# Configuration

`sdd-engineering` works in a project with no configuration at all: specs in `specs/`,
plans in `plans/`, run reports in `.sdd/runs/`, retros in `docs/retro/`. Everything else
is optional and lives in one file, **`.claude/sdd-engineering.json`** in the project root.
Every key is optional; a key you leave out takes its default.

## Inputs

| Key | Type | Default | What it controls | Read by |
|---|---|---|---|---|
| `specsDir` | path | `specs/` | where specs live; designs go in `<specsDir>/designs/<slug>/` | spec-creator, planner, verifier, run-plan |
| `plansDir` | path | `plans/` | where plans live, one per spec, same stem | planner, run-plan |
| `runsDir` | path | `.sdd/runs/` | run-plan reports, one folder per plan: `<runsDir>/<stem>/` | run-plan, verifier (its only write target), spec-creator (amend check), workflow-retro |
| `retroDir` | path | `docs/retro/` | retro ledger: `<retroDir>/ledger/` and the index `<retroDir>/README.md` | workflow-retro |
| `conventions` | list of paths | `AGENTS.md`, `CLAUDE.md` — whichever exist | the project's stack, layout, naming and "do not touch" rules | every agent |
| `insights` | path or `null` | `null` | a lessons file (for example `INSIGHTS.md`) that agents read and cite; ignored while unset | spec-creator, planner |
| `verify.checks` | shell command | none | lint, typecheck and static architecture checks — non-mutating | planner (writes it into steps), architecture-reviewer |
| `verify.tests` | shell command | none | the test runner; `{file}` stands for one test file | planner (writes it into steps) |
| `gate` | slash command or shell command | `null` | a last pre-PR check run by `/sdd-engineering:run-plan` after delta | run-plan |
| `routing` | skill name or path | `engineering-paved-path:skill-routing` | which skills own which file groups, split into write-time and review-time | planner, implementer, architecture-reviewer |

Paths are relative to the project root and use forward slashes. A trailing `/` is
optional.

## Example

```json
{
  "specsDir": "docs/specs",
  "plansDir": "docs/plans",
  "conventions": ["AGENTS.md", "docs/architecture.md"],
  "insights": "INSIGHTS.md",
  "verify": {
    "checks": "npm run lint && npm run typecheck",
    "tests": "npx vitest run {file}"
  },
  "gate": "npm run ci"
}
```

A minimal one, for a project that only wants the verify commands set:

```json
{ "verify": { "checks": "pnpm lint && pnpm typecheck", "tests": "pnpm vitest run {file}" } }
```

## How the verify commands are used

The planner writes the commands **literally** into each step of the plan, so the
implementer and the verifier run exactly what the plan says and nothing else:

| Where | Command |
|---|---|
| a step with no test | `verify.checks` |
| a step that adds or changes a test | `verify.tests` with `{file}` replaced by that test file |
| the last step (single-agent *Final check*, multi-agent *Integration*) | `verify.checks`, then `verify.tests` with `{file}` removed — the one full run |
| a multi-agent track's own steps | `verify.checks` and the `{file}` form of `verify.tests` only |

- `verify.tests` without a `{file}` placeholder: steps verify with `verify.checks` only and
  the test command runs once, in the last step.
- No `verify` configured: the planner asks for the commands in its *Requirements review*
  (it may show what it found in `package.json` or CI, but never invents one). If you
  answer "none", each step's *Verify* reads `none configured — <the observable check a
  person would make>`, and the verifier marks those rows NOT VERIFIABLE unless it can
  observe the check itself.
- The implementer and the verifier do **not** read `verify.*` directly: they run the
  commands the plan wrote, because those are what the plan claims proves each item.
- There is no result cache. Each agent re-runs its commands on the same tree, so keep
  per-step commands narrow; see *Cost* in the [README](../README.md).

## The gate

`gate` is optional. When it is set, `/sdd-engineering:run-plan` runs it as the last
phase, after the delta verification:

- a value starting with `/` is a **slash command** (another plugin's skill or command)
  and is invoked in the orchestrating session; its output must state `PASS` or `BLOCK`;
- anything else is a **shell command** run from the project root; exit code 0 is `PASS`,
  anything else `BLOCK`.

One fix iteration follows a `BLOCK`, and only when the gate output names a file and a fix
for each blocking item. Output with neither verdict stops the run with a summary. Without
a `gate`, the run ends after delta with a summary. No agent runs the gate on its own.

## How agents receive the inputs

1. `/sdd-engineering:run-plan` reads `.claude/sdd-engineering.json` **once**, in its
   intake step, fills in the defaults, keeps only the `conventions` files that exist, and
   appends an **inputs block** to every agent prompt:

   ```
   Inputs:
   - specsDir: specs/
   - plansDir: plans/
   - runsDir: .sdd/runs/
   - conventions: AGENTS.md, CLAUDE.md
   - insights: none
   - verify.checks: npm run lint && npm run typecheck
   - verify.tests: npx vitest run {file}
   - routing: engineering-paved-path:skill-routing
   - gate: none
   ```

2. When you invoke an agent yourself (spec-creator and the planner are run by hand), you
   may state any input in the prompt. Whatever the prompt does not carry, the agent reads
   from `.claude/sdd-engineering.json`, and falls back to the default for a key that file
   does not set.
3. An agent never guesses a path that is in none of the three places. A required value it
   cannot resolve is returned as a question (spec-creator's *Need clarification*, the
   planner's *Requirements review*, the implementer's or verifier's `BLOCKED`).

## `.gitignore`

`runsDir` holds machine-written reports for one working copy — rebuilt by the next run,
useful to resume, not useful in history. Ignore it:

```gitignore
# sdd-engineering run reports
.sdd/
```

If you moved `runsDir`, ignore that folder instead. `/sdd-engineering:run-plan` warns in
its start line when `runsDir` is not ignored. Specs, plans and the retro ledger
(`specsDir`, `plansDir`, `retroDir`) are meant to be committed.

## Overriding the skill routing

`routing` defaults to the `engineering-paved-path:skill-routing` skill: a generic table
of file groups → the skills that own them, split into *write-time* (loaded by the
implementer) and *review-time* (applied by reviewers only). A project with its own layout
can point `routing` at another skill (`my-plugin:routing`) or at a markdown file in the
repository (`docs/skill-map.md`) with the same two-column split. The planner derives
the plan's *Skill contract* from it; the implementer and the architecture reviewer read
the same table, so there is only ever one.
