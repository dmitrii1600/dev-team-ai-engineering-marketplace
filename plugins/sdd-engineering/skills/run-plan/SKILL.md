---
name: run-plan
description: >-
  Runs the build half of the Spec Driven Development chain from an approved
  implementation plan: sdd-engineering:implementer (single-agent, or step 0 → parallel
  tracks → Integration), sdd-engineering:plan-verifier with a capped fix loop,
  architecture-review:architecture-reviewer with a capped fix loop, a delta verification,
  and the project's gate command when one is configured. Saves every agent's report under
  the runs folder so a new chat can resume. Use when a plan is ready to build:
  "implement the plan", "build plans/<stem>.md", "run the chain on this plan". It never
  writes specs or plans (spec-creator and implementation-planner run by hand before it),
  never edits code itself, never opens a pull request, and stops with a summary when a
  fix loop hits its cap.
argument-hint: "<plansDir/stem.md> [--from build|verify|arch|delta|gate]"
---

# /sdd-engineering:run-plan — build an approved plan

You are the orchestrator. You call agents, save what they return, and pass **paths**
forward. You do not write code, tests or docs yourself, and you do not re-explain a
report to the next agent — the file is the hand-off. Everything an agent returns is saved
verbatim before you act on it, so a new chat can resume from the files alone.

Upstream of this command, by hand: `sdd-engineering:spec-creator` → a person sets
`Status: approved` → `sdd-engineering:implementation-planner` writes
`<plansDir>/<stem>.md`. This command starts from that file. The plan's format is in
`${CLAUDE_SKILL_DIR}/references/plan-format.md`; read it only when a plan does not parse.

## Arguments

| Argument | Meaning |
|---|---|
| `<plansDir>/<stem>.md` | required — the plan to build; its header carries the Plan ID, the spec path and the execution mode |
| `--from <phase>` | resume from `build`, `verify`, `arch`, `delta` or `gate`; without it the reports already on disk decide (see *Resume*) |

## Project inputs

Resolved **once**, in step 0, and passed to every agent in its prompt — an agent never
guesses a path. Source: `.claude/sdd-engineering.json` in the project root (every key
optional), otherwise the default.

| Input | Default | Used for |
|---|---|---|
| `specsDir` | `specs/` | where the plan's spec lives |
| `plansDir` | `plans/` | where plans live |
| `runsDir` | `.sdd/runs/` | reports of this command, under `<runsDir>/<stem>/` |
| `retroDir` | `docs/retro/` | not used here; `/sdd-engineering:workflow-retro` reads it |
| `conventions` | `AGENTS.md`, `CLAUDE.md` — those that exist | the project's rules every agent reads |
| `insights` | none | a lessons file agents read only when it is set |
| `verify.checks` | none | lint / typecheck / architecture command |
| `verify.tests` | none | test command; `{file}` is replaced by one test file |
| `gate` | none | a slash command or shell command run as the last phase |
| `routing` | `engineering-paved-path:skill-routing` | which skill maps files to skills |

The values are appended to each agent prompt as the **inputs block**, one key per line so
a command with spaces or `&&` stays intact:

```
Inputs:
- specsDir: <…>
- plansDir: <…>
- runsDir: <…>
- conventions: <a, b>
- insights: <path | none>
- verify.checks: <cmd | none>
- verify.tests: <cmd with {file} | none>
- routing: <skill or file>
- gate: <cmd | none>
```

Each agent reads only the keys it needs and falls back to the config file and the
defaults for a key the block does not carry.

## Hard rules

- **Paths, not retellings.** An agent prompt carries the plan path, a report path, item
  numbers and the inputs block. Never a summary of the plan, never a pasted report.
- **Save first, decide second.** Write every agent's final message to its report file
  with `Write`, verbatim, before reading it for a verdict. Never condense or trim it: a
  saved report that drops rows breaks the next delta pass. Then take the verdict from the
  file's header lines (`grep -n "^\*\*Verdict\|^\*\*Status" <file>`), not from memory.
  **Exception: `plan-verifier` writes its own report.** Its prompt carries `report to:
  <runsDir>/<stem>/<file>.md`. Check that the file exists and starts with
  `# Plan Conformance`; only when it is missing do you save the final message yourself.
- **Caps are hard.** Two fix iterations per loop (verify, arch), one for delta, one for
  the gate. When a cap is hit, stop, write the summary, and hand the open items to the
  person. Never "one more try".
- **Thin context.** Read a plan's header (`sed -n 1,12p`), not the plan. Read a report's
  verdict line and the rows you need (`grep`), not the report. The agent's message is
  already in your context once; do not paste it back to the user — point at the file.
- **Stop conditions.** `BLOCKED` from any agent, a spec still at `Status: draft`, a
  blocking open question in the plan, or a cap hit: stop with the summary. The person
  decides; you do not guess.
- **No PR.** The run ends with a summary — after the gate's `PASS` when a gate is
  configured, after delta otherwise. Committing, pushing and opening the pull request are
  separate requests from the person.

## Step 0 — intake

1. **Inputs.** `cat .claude/sdd-engineering.json` if it exists; take each key from it,
   the rest from the defaults above. For `conventions`, keep only the files that exist.
   A file that is not valid JSON stops the run: "fix .claude/sdd-engineering.json".
2. **The plan.** The path exists and its first lines parse: `**Plan ID:**`, `**Spec:**`,
   `**Execution mode:**` (`sed -n 1,12p`). Otherwise stop: "not an Implementation Plan".
   `<stem>` is the plan's filename without `.md`.
3. `grep -n "Blocking:" <plan>` — a blocking open question that is still open means stop.
4. **The spec.** If the header cites a spec, `sed -n 1,5p` it: `Status: approved` or
   `implemented` proceeds; `draft` stops with "the spec is not approved — a person sets
   `Status: approved` after reading it".
5. **Verify commands.** When the plan's steps carry no verify command and neither
   `verify.checks` nor `verify.tests` is set, say so in the start line: the agents will
   have nothing to re-run, and the verifier will mark those rows NOT VERIFIABLE.
6. **Base ref** for the architecture scope: `git rev-parse --abbrev-ref origin/HEAD`
   (e.g. `origin/main`); if that fails, the default branch name the repository uses.
7. `mkdir -p <runsDir>/<stem>/`; list what is already there (see *Resume*). If
   `git check-ignore -q <runsDir>` fails, add one line to the start line: "<runsDir> is
   not git-ignored".
8. Print one line: Plan ID · mode · phase you start at · gate (`<gate>` or "none").

## Phases

Agents are dispatched with the `Agent` tool by their namespaced `subagent_type`. Every
prompt below ends with the inputs block, omitted here for brevity.

Every **fix-loop** prompt to the implementer has the same shape, whatever triggered it:

```
Plan: <plansDir>/<stem>.md · Plan ID: <id> · mode: <mode> [· track: shared] · fix loop · report: <runsDir>/<stem>/<report>.md · items: <numbers>
```

In multi-agent mode a fix runs on `track: shared`, because a fix may touch files of
several tracks and the tracks have already finished. The implementer accepts two report
shapes for `report:` — a *Plan Conformance* report and an *Architecture Review* — whose
items carry their own smallest fix.

### 1. build

**single-agent** — one `sdd-engineering:implementer`:

```
Plan: <plansDir>/<stem>.md · Plan ID: <id> · mode: single-agent
```

Save → `10-build.md`.

**multi-agent** — three waves, all `sdd-engineering:implementer`:

1. `Plan: <plansDir>/<stem>.md · Plan ID: <id> · mode: multi-agent · track: shared ·
   step 0 only` → save `10-build-step0.md`. Wait; `BLOCKED` stops the run.
2. One agent per track from the plan's `## Tracks` table, **in one message, in the
   background**: `… · track: <A>` → save `11-build-track-<A>.md`,
   `11-build-track-<B>.md`. Wait for every one.
3. `… · track: shared · Integration step only` → save `12-build-integration.md`.

`Status: BLOCKED` in any report stops the run. `PARTIAL` continues — the verifier will
turn it into ledger rows — but is listed in the summary.

### 2. verify (pass 1)

`sdd-engineering:plan-verifier`: `Plan: <plansDir>/<stem>.md · branch: <current> ·
report to: <runsDir>/<stem>/20-verify-1.md`. The verifier writes the file itself.

- `CONFORMS` or `PARTIAL` → phase 3. `PARTIAL` rows that are NOT VERIFIABLE go to the
  summary for the person.
- `DIVERGES` → **fix loop**, at most 2 iterations, `i = 1, 2`:
  1. Items to close: every ledger row with status `NOT MET` or `PARTIAL` in the latest
     verify report (`grep -n "| NOT MET |\|| PARTIAL |" <latest verify>`). Take the row
     numbers.
  2. `sdd-engineering:implementer`, fix loop: `report: <runsDir>/<stem>/<latest
     verify>.md · items: <numbers>` → save `21-fix-<i>.md`.
  3. `sdd-engineering:plan-verifier`, delta: `Plan: <plansDir>/<stem>.md · branch:
     <current> · previous report: <runsDir>/<stem>/<latest verify>.md · report to:
     <runsDir>/<stem>/22-verify-<i+1>.md`.
  4. `DIVERGES` again and `i < 2` → next iteration; `i = 2` → stop, summary.

### 3. arch

`architecture-review:architecture-reviewer`: `Scope: <base>...HEAD plus uncommitted ·
base: <base>` → save `30-arch-1.md`. The reviewer runs `verify.checks` from the inputs
block itself when it is set.

- `CLEAN`, or only `SUGGESTION` findings → phase 4. Suggestions are copied to the summary
  by number; nobody fixes them automatically.
- Any `CRITICAL` or `WARNING` → **fix loop**, at most 2 iterations, `i = 1, 2`:
  1. Finding numbers with severity CRITICAL or WARNING
     (`grep -n "^### [0-9]*\. .*— \(CRITICAL\|WARNING\)" 30-arch-<i>.md`).
  2. `sdd-engineering:implementer`, fix loop: `report: <runsDir>/<stem>/30-arch-<i>.md
     · items: <numbers>` → save `31-arch-fix-<i>.md`.
  3. `architecture-review:architecture-reviewer` again, narrowed: `files: <the files
     listed under ## Changes in 31-arch-fix-<i>.md>` → save `30-arch-<i+1>.md`.
  4. Still a CRITICAL or WARNING and `i < 2` → next iteration; `i = 2` → stop, summary.

  A finding the implementer reports as outside the plan's files (its *Deviations* or
  *Follow-ups*) is not retried: it goes to the summary as a decision for the person.

The reviewer is advisory. Its verdict decides only whether the fix loop runs.

### 4. delta — only when something changed after `20-verify-1.md`

Skip when no `21-*` or `31-*` report exists. Otherwise `sdd-engineering:plan-verifier`,
delta: `Plan: <plansDir>/<stem>.md · branch: <current> · previous report: <latest
2x-verify>.md · report to: <runsDir>/<stem>/40-verify-delta.md`. `DIVERGES` → one
`sdd-engineering:implementer` fix loop on `40-verify-delta.md` (`41-fix.md`) and one more
delta (`report to: …/42-verify-delta-2.md`); still `DIVERGES` → stop, summary.

### 5. gate — only when `gate` is set

Without a `gate`, go to the summary; the summary says "no gate configured".

- `gate` starts with `/` — a slash command. Invoke it with the `Skill` tool (the name
  without the leading `/`, the rest as arguments), in this session. Save its final
  markdown output → `70-gate-1.md`. Its verdict is `PASS` or `BLOCK` as it states it.
- Otherwise — a shell command. Run it with `Bash` from the project root. Save the command,
  its exit code and the last 60 lines of output → `70-gate-1.md`. Exit 0 is `PASS`,
  anything else `BLOCK`.

A gate output that states neither verdict is `NO VERDICT`: stop with the summary and let
the person read `70-gate-1.md`.

- `PASS` → phase 6.
- `BLOCK` → **one** fix iteration. A gate report is neither of the implementer's two
  report shapes, so the prompt must state each item itself: from `70-gate-1.md`, list
  every blocking finding as `<n>. <file>[:line] — <the fix the gate names>`. When the gate
  output does not name a file and a fix for an item (a bare failing check, a red suite),
  do not dispatch: stop with the summary and point the person at `70-gate-1.md`.
  Otherwise `sdd-engineering:implementer`, fix loop: `report:
  <runsDir>/<stem>/70-gate-1.md · items: 1–N` followed by the item list → save
  `71-gate-fix.md`; run the gate again → `72-gate-2.md`. Still `BLOCK` → stop, summary.
  A blocking finding that is a deliberate decision (a waiver the project's gate supports)
  is not fixed: propose the waiver in the summary and let the person apply it.

### 6. summary

Write `<runsDir>/<stem>/summary.md`:

```
# /run-plan: <Plan ID>

**Result:** DONE | STOPPED at <phase> — <why>
**Mode:** single-agent | multi-agent (N tracks)  ·  **Reports:** <runsDir>/<stem>/  ·  **Gate:** <gate> | none

| Phase | Report | Verdict | Iterations |
|---|---|---|---|
| build | 10-build.md | DONE | — |
| verify | 22-verify-2.md | CONFORMS | 1 fix |
| arch | 30-arch-2.md | CLEAN | 1 fix |
| delta | 40-verify-delta.md | CONFORMS | — |
| gate | 70-gate-1.md | PASS | — |

## For the person
- <NOT VERIFIABLE rows, one line each — needs a running stack / a manual check / a judgement>
- <arch SUGGESTIONs by number>
- <follow-ups the implementer left>
- <a waiver to apply, if any>

## Lessons the agents reported
- <report:line of each "Deviations from plan", "Plan claims the tree contradicts" and
  "Could not establish" entry — pointers only; nothing is written to the insights file>

## Next
- Set the spec to `Status: implemented` once the feature ships — a person's call.
- Commit and open the pull request — when you say so.
- `/sdd-engineering:workflow-retro --stem <stem>` — if you want a retrospective of this run.
```

Show the person the summary table and the *For the person* list, then at most three
sentences. Do not restate the reports.

## Resume

Without `--from`, the highest-numbered report in `<runsDir>/<stem>/` decides where to
start: a `1x` report → verify; a `2x` → arch; a `3x` → delta; `40`–`42` → gate (or the
summary when no gate is set); `70`+ → the gate again; `summary.md` with `Result: DONE` →
nothing to do, say so. Whatever exists is not re-run. `--from <phase>` overrides that and
re-runs from the phase named, keeping the earlier reports. A plan whose `## Tracks` or
`## Steps` changed since the last report (`git log -1 --format=%ci <plan>` newer than the
report, or the plan has uncommitted changes) restarts from `build` regardless.

## Cost

There is no verification cache: each agent runs the plan's own verify commands, so a
suite can run once per agent on the same tree. Keep it cheap through the plan — a step
verifies with the narrowest command (`verify.checks`, or `verify.tests` on one `{file}`)
and the full suite runs once, in the last step.

## What this command is not

- Not the spec or the plan: `spec-creator` and `implementation-planner` run by hand,
  before, with a person's approval between them.
- Not a reviewer: it relays verdicts; it never grades code itself.
- Not the gate: the configured `gate` decides PASS/BLOCK; this command only runs it.
- Not a PR: it ends with a summary.
