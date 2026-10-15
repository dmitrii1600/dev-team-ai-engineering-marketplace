# Ledger templates

Two templates: the **entry** written for every retro, and the **README** created once in
`<retroDir>/` when it does not exist yet.

## Entry — `<retroDir>/ledger/YYYY-MM-DD-<stem-or-title>.md`

```markdown
# Retro: <workflow> — <stem or title>

**Date:** YYYY-MM-DD · **Branch:** <branch> · **Sessions:** <ids> · **Mode:** in-context | deep
**Workflow:** spec → plan | run-plan <stem> | … · **Result:** DONE | STOPPED at <phase> · **Facilitator:** <model>

## Numbers
| Metric | Value | Source |
|---|---|---|
| Agents spawned (top-level / nested) | | tool results · script |
| Fix-loop iterations (verify / arch / delta / gate) | | reports |
| Rounds with the person | | chat |
| Wall clock (first prompt → last agent) | | script |
| Session tokens — output / cache read / cache create | | script (transcript rows) |
| Session cost — harness cost-state | | script (a snapshot; lower bound if ⚠) |
| Session cost — estimated at list price (main + agents) | | script (`est. cost`, cache writes by TTL) |
| Most expensive agent | | script (`est. cost` column) |
| Lines added / removed | | cost-state · toolStats |

## Agent timeline
| # | agent | parent | model | started | duration | gap before | API calls | output | final ctx | tools | +/- | errors | outcome |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Per agent
### <agent> — <description>
- **Input:** …
- **Hard:** …
- **Easy:** …
- **Duplicated:** …
- **Missed:** …
- **Report:** …

## Cross-cutting findings
- …

## Proposals
| # | Target | Change | Evidence | Expected effect | Cost | Status |
|---|---|---|---|---|---|---|

## Earlier proposals
| Entry | # | Target | Status now | Note |
|---|---|---|---|---|

## Impressions
<judgements without a citation, or none>

## Not measured
- …
```

Rules for the entry:

- a number is measured (tool result, report file, script) or written as `not measured`;
- a judgement cites a report line, a script row or a `path:line`, or sits under
  *Impressions*;
- a proposal names a target, a change, its evidence, the expected effect and a cost, and
  stays `open` until a later retro marks it `adopted` or `declined`;
- a target is project-side (config, conventions, routing override, templates) or
  plugin-side (an agent or skill of a plugin — adopted upstream, never by editing the
  installed copy).

## README — `<retroDir>/README.md`, created when missing

```markdown
# Retrospectives of agent workflow runs

The ledger of how our multi-agent workflows actually ran: the Spec Driven Development
chain (`spec-creator` → `implementation-planner` → `/sdd-engineering:run-plan`), a single
run-plan, or any session that fanned work out to subagents. One entry per run, written by
`/sdd-engineering:workflow-retro` after the run finished.

This folder remembers what we learned about the **process and the agents**: what each one
found hard or easy, what was read twice, what slipped through to the next stage, how many
tokens the run cost, and what we proposed to change. Lessons about the **code** live
elsewhere; the two never copy each other.

## How an entry is made

    /sdd-engineering:workflow-retro                            # the run happened in this session
    /sdd-engineering:workflow-retro --deep --stem <plan-stem>  # + tokens per session and per agent
    /sdd-engineering:workflow-retro --deep --since <date>      # a workflow spread over several sessions

Manual only: the skill is never invoked by the model on its own, never by run-plan and
never by a hook. Making it automatic is a decision to record here first.

`--deep` numbers come from the skill's `retro-usage.mjs`, which reads the Claude Code
transcripts under `~/.claude/projects/<project-slug>/` (read-only). Transcripts are local
and unversioned — run the retro before they are cleaned up; the entry is the durable
record.

## Entry format

`ledger/YYYY-MM-DD-<plan-stem-or-title>.md`: Numbers · Agent timeline · Per agent (input,
hard, easy, duplicated, missed, report) · Cross-cutting findings · Proposals · Earlier
proposals · Impressions · Not measured.

## Index

| Date | Workflow | Sessions | Agents | Cost | Top proposal | Entry |
|---|---|---|---|---|---|---|

(The retro adds one row per entry, newest first.)
```

An index row looks like:

```markdown
| 2026-10-15 | spec → plan → run-plan (2 tracks) → gate (export-invoice-pdf) | 1a2b3c4d | 12 | $18.40 est. | Planner names boundary inputs for every cap criterion | [ledger/2026-10-15-export-invoice-pdf.md](ledger/2026-10-15-export-invoice-pdf.md) |
```
