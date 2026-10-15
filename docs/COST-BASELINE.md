# Cost baseline: sdd-engineering implementation-planner

One fixed SDD scenario, measured before and after one prompt change, on the same model and
the same eval set. The question: does removing duplicated instructions from the agent prompt
(and loading them from a skill reference on demand) make the planner cheaper or faster
without hurting quality?

**Verdict: the optimization does not pass.** The quality gate stays green and no critical
false negative was added, but neither cost nor latency went down. Input tokens per eval set
fell by 7%, but the extra on-demand `Read` on the plan-writing path costs more than the
smaller prompt saves. Median cost and latency per eval set both stay inside the baseline's
run-to-run spread. Details are below.

## Setup

| | Baseline | After |
|---|---|---|
| Plugin | `sdd-engineering` 1.0.0 | `sdd-engineering` 1.0.1 |
| Commit | `ef1dc37` | `f296daf` |
| Working tree | clean | clean |
| Task model | `claude-sonnet-5-5` | `claude-sonnet-5-5` |
| Judge model | `claude-opus-5-5` | `claude-opus-5-5` |
| Backend | `subscription` (Claude Agent SDK) | same |
| Eval set | `plugins/sdd-engineering/evals/implementation-planner`, 3 cases | same |
| Runs | 5 per case, 15 sessions | 5 per case, 15 sessions |
| Date | 2026-10-15 | 2026-10-15 |

The three cases (all `agentTask`, read-only tools, the planner's own prompt):

1. **review-only: mode missing.** No execution mode is given, so the planner must return only the Requirements review, with the mode question.
2. **plan: mode and verify given.** The planner must write a full single-agent plan with header fields and a namespaced Skill contract.
3. **review-only: verify missing.** The verify commands are missing, so the planner must ask for them rather than invent them.

Reproduce (from `evals/`, at each commit):

```bash
EVAL_MODEL=claude-sonnet-5-5 EVAL_JUDGE_MODEL=claude-opus-5-5 npm run eval:repeat -- plugins/sdd-engineering/evals/implementation-planner -n 5 --allow-more --label baseline
EVAL_MODEL=claude-sonnet-5-5 EVAL_JUDGE_MODEL=claude-opus-5-5 npm run eval:repeat -- plugins/sdd-engineering/evals/implementation-planner -n 5 --allow-more --label after
npm run eval:delta -- baseline after
```

How the metrics are measured:

- **Cost.** This is the SDK's `total_cost_usd`. On the subscription backend nothing is billed per token, so it is an **API-price estimate**. Use it to compare runs, not as a bill.
- **Judge excluded.** The judge's own calls are not counted in cost, tokens or latency.
- **Latency.** Wall-clock time of the task session.
- **Noise rule.** A change counts as real only if the after-median falls outside the baseline's `[min, max]` over its 5 runs. Otherwise it is "within noise".

## Baseline (`ef1dc37`, sdd-engineering 1.0.0)

### Per eval set

One run is the 3 cases together. The table gives the median over 5 runs, with `[min–max]`.

| Metric | Median | Range |
|---|---|---|
| Cost (API estimate) | $0.2556 | $0.1961–$0.3479 |
| Latency | 136.4 s | 94.9–142.7 s |
| Input tokens, uncached | 8 | 8–10 |
| Cache read tokens | 68,466 | 45,333–88,092 |
| Cache write tokens | 21,234 | 15,691–38,828 |
| Input tokens, total | 84,169 | 84,163–109,347 |
| Output tokens | 17,607 | 11,744–18,800 |
| API calls | 4 | 4–5 |
| Tool calls | 1 | 1–2 |
| Pass rate | **13/15 (87%)** | |

### Per case

| Case | Pass | Cost | Latency | API / tool calls |
|---|---|---|---|---|
| review-only: mode missing | 5/5 | $0.0543 [$0.0496–$0.1211] | 30.0 s [26.8–32.2] | 1 / 0 |
| plan: mode and verify given | 3/5 | $0.1469 [$0.0835–$0.1678] | 80.2 s [36.3–86.9] | 2 / 1 |
| review-only: verify missing | 5/5 | $0.0590 [$0.0459–$0.0733] | 27.0 s [23.6–33.1] | 1 / 0 |

### Critical errors

1. **Plan withheld when it was due (2/5 runs of the plan case).** All inputs were given, but the planner returned only a Requirements review with blocking questions and no plan. Those runs failed grounding (`**Plan ID:**` missing), so the judge was skipped. They are also why the baseline's cheapest runs ($0.0835 and $0.0891) are so cheap.
2. **Unmarked file paths (every plan produced, 3/3).** The practice "every file path in the steps either exists in the snapshot or is explicitly marked new" failed in every plan. The planner names paths that are not in the snapshot and does not mark them `new`, and the implementer would reproduce that. This is systemic, not noise.
3. **Missing default line (4/5 runs of the mode-missing case).** The review omitted the "Default if you would rather I just go" line. This is not critical, since the case still passed the 0.8 threshold.

## The change (`f296daf`, sdd-engineering 1.0.1)

One change, with model and routing unchanged. `agents/implementation-planner.md` carried a full copy of
the plan file template, the Plan Report template, and the step and track rules. All of these were already in
`skills/run-plan/references/plan-format.md`. They now live only in the reference, which became
the source of truth. The agent reads it once, after the Requirements review and before
writing a plan, and never for a review-only response.

The agent prompt went from 4,343 to 3,239 words (−25%).

## After (`f296daf`)

### Per eval set

| Metric | Baseline | After | Δ median | Verdict |
|---|---|---|---|---|
| Cost (API estimate) | $0.2556 | $0.2767 [$0.2643–$0.3321] | +8% | within noise |
| Latency | 136.4 s | 140.7 s [132.4–159.3] | +3% | within noise |
| Input tokens, total | 84,169 | 77,913 [77,903–77,924] | −7.4% | **outside baseline range (lower)** |
| Cache read tokens | 68,466 | 57,259 [40,154–57,265] | −16% | within noise |
| Cache write tokens | 21,234 | 20,646 [20,630–37,762] | −3% | within noise |
| Output tokens | 17,607 | 18,610 [17,599–21,169] | +6% | within noise |
| API calls | 4 | 4 [4–4] | 0 | within noise |
| Tool calls | 1 | 2 [2–2] | +1 | outside baseline range (higher) |
| Pass rate | 13/15 (87%) | **14/15 (93%)** | +1 | |

### Per case

| Case | Pass | Cost | Latency | Tool calls | Notes |
|---|---|---|---|---|---|
| review-only: mode missing | 5/5 → 5/5 | $0.0543 → $0.0496 (−9%, within noise) | 30.0 → 25.8 s (−14%, outside range) | 0 → 0 | default line 1/5 → 3/5 |
| plan: mode and verify given | 3/5 → 4/5 | $0.1469 → $0.1805 (+23%, outside range) | 80.2 → 85.6 s (+7%, within noise) | 1 → 2 | cache write +55% |
| review-only: verify missing | 5/5 → 5/5 | $0.0590 → $0.0483 (−18%, within noise) | 27.0 → 27.5 s (+2%, within noise) | 0 → 0 | |

The baseline's plan-case median includes the two cheap runs that never wrote a plan. Among
runs that actually produced a plan, the comparison is:

| | Baseline (3 runs) | After (5 runs) | Δ median |
|---|---|---|---|
| Cost | $0.1595 [$0.1469–$0.1678] | $0.1805 [$0.1672–$0.2042] | **+13%** |
| Latency | 86.9 s [80.2–86.9] | 85.6 s [80.7–104.9] | −1% (noise) |

### What moved, and why

- **Review-only path (cases 1 and 3): cheaper, but mostly within noise.** The shorter prompt removes ≈2.8k cache-read tokens from every call. Cost fell 9–18% and latency fell in case 1, but only case 1's latency drop is outside the baseline spread.
- **Plan path (case 2): more expensive.** The planner now reads `plan-format.md` (≈1,700 words) on top of the routing table. That adds one tool call and about +5k cache-write tokens per plan, which more than cancels the ≈2.8k-token saving on the prompt. On runs that wrote a plan, cost is up 13% and latency is unchanged.
- **Per eval set: the two paths roughly cancel.** Total input tokens fall 7% (outside the baseline range), but cost (+8%) and latency (+3%) stay within noise. **No real cost or latency reduction is claimed.**

### Quality gate and false negatives

- **Gate: green.** Pass rate went from 13/15 to 14/15, and both review-only cases stay 5/5 on every practice.
- **No new critical false negative.**
  - The planner never produced a plan where a review-only response was required (cases 1 and 3).
  - It never invented verify commands.
  - The baseline's "plan withheld" error did not recur (0/5, from 2/5). With n=5 that drop is not significant.
- **One new practice-level failure (1/5).** In one plan, the verify commands were not literal, or the full suite ran more than once. That run scored 0.71 against a 0.8 threshold. These rules now come from the reference rather than the prompt, so watch this failure if the change is kept.
- **Unchanged systemic error.** "Every file path exists or is marked new" is still 0/5. The change neither fixed nor caused it.

## Decision

The optimization **fails the pass criterion** for this lab: the quality gate is green, but
cost and latency did not really go down. The saving on review-only responses is offset by the
on-demand read on the plan path.

`f296daf` is **kept anyway**, for a maintenance reason, not a cost one: the plan format now
has one source of truth instead of two copies that can drift apart. It is not counted as a
cost optimization.

Next candidates, not tried here (one change at a time):

- Cut the reference that the plan path loads. For example, split the Plan Report and the people-facing notes out of `plan-format.md`, so the planner reads only the template and the step rules.
- Fix critical error 2 (unmarked file paths) before any further cost work. It is a correctness problem, and it is present in every plan.
