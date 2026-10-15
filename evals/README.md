# evals

The shared eval harness for the plugins in this marketplace. It measures whether a plugin's
skills and agents actually do what their files say: static checks on every `SKILL.md`, LLM-judged
quality cases per skill or agent, and trace-asserted workflow cases with the plugins loaded.

The harness lives here (`evals/`, package `@dev-team/evals`, private, never published). The
**cases live next to the plugin they test**, in `plugins/<plugin>/evals/`.

> **Cost warning.** Every quality and workflow case starts real Claude sessions (the task, plus an
> LLM judge). On the default backend that spends your Claude Code subscription usage; on OpenRouter
> it spends money. A full run of all plugins is dozens of sessions and can take a long time. Run one
> plugin or one artifact at a time, and run `eval:quality` (free, no model) first.
>
> **Not run in CI.** The repository's workflows never call the model-backed tiers. Run them locally,
> before you change a skill or an agent and after, and compare.

## Quick start

```bash
cd evals
npm install

npm run eval:quality                                    # static SKILL.md gate — no model, free
npm run eval:list                                       # list every discovered case — no model, free
npm run eval -- plugins/sdd-engineering/evals/spec-creator   # one artifact's cases (costs sessions)
```

`npm run eval -- <filter>` passes the filter to vitest, which matches it as a substring of the
eval file path, so `plugins/sdd-engineering` runs a whole plugin and
`plugins/sdd-engineering/evals/spec-creator` one artifact. Add `-t "<case name>"` for one case.

Requires Node 22.12+ and, for the default backend, a logged-in Claude Code (`claude` CLI).

## Artifact names

Every skill and agent is addressed by its **namespaced** name, the same form Claude Code uses at
runtime:

| Name | Resolves to |
|---|---|
| agent `sdd-engineering:spec-creator` | `plugins/sdd-engineering/agents/spec-creator.md` |
| skill `engineering-paved-path:onion-architecture` | `plugins/engineering-paved-path/skills/onion-architecture/SKILL.md` |

A bare name (`spec-creator`) is rejected with a "did you mean" hint. Resolution lives in
`src/artifacts/paths.ts`.

## Tiers

1. **Static gate (no model)** — `npm run eval:quality` scans `plugins/*/skills/*/SKILL.md`:
   frontmatter `description` (and `name`, when set, equal to the folder; a missing `name` is a
   warning), body length, headings, relative
   links that resolve, no `.claude/skills|agents` paths. A skill without evals is a warning, not a
   failure. `npm run eval:quality -- <plugin>` or `-- <plugin>:<skill>` narrows it.
2. **Quality (LLM-judged)** — per skill or agent, isolate the artifact's *content* and judge the
   answer against a list of practices.
3. **Workflow (trace-asserted)** — load the plugins into a session and assert on what it *did*:
   which subagent was dispatched, which skill activated, which files were read.

On top of the tiers sit three statistics tools that read the same `results/records.jsonl`:
**repeat** (one pattern N times → stability), **delta** (diff two labeled repeat runs) and
**benchmark** (with vs without the artifact → measured lift).

## How a case runs

| Task | What the session gets | Measures |
|---|---|---|
| `skillTask(prompt, "<plugin>:<skill>")` | `SKILL.md` + every `references/*.md` as the system prompt, no tools, no plugins, no on-disk settings | the skill's content |
| `agentTask(prompt, "<plugin>:<agent>")` | the agent body + the `SKILL.md` of every skill in its `skills:` frontmatter (as Claude Code preloads them), and the **read-only** subset of its declared `tools:` | the agent's content and method |
| `workflowTask(prompt)` | every plugin under `plugins/` loaded through the Agent SDK `plugins` option (`{ type: "local", path }`, the `--plugin-dir` mechanism), plugin MCP servers off, read-only tools plus `Agent`/`Skill` | the systemic effect: dispatch, activation, namespaced cross-plugin references |

Details that matter when you write cases:

- `agentTask` drops `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Bash`, `Agent` and `Task` from an
  agent's tools: evals run with `bypassPermissions` against this repository, and a nested subagent
  would blur what is measured. A case for an agent that normally writes a file or runs commands
  therefore says so in its prompt ("return the file content instead", "report the command as not
  run") — see the `sdd-engineering` cases.
- `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PLUGIN_ROOT}` in injected artifacts are expanded to the real
  paths in this repository.
- Sessions run from the repository root, so an agent can read real files here (for example a
  routing table in another plugin). The sample project a case describes is usually **not** on
  disk; cases hand it over as a text snapshot in `fixtures/`.
- `workflowTask` loads no project or user settings unless a case passes `settingSources`, and a
  `plugins: [...]` option narrows which plugins are loaded.

## Scorers

- `patternMatch(output, expected)` — deterministic, case-insensitive substring coverage, no model.
  A case's `grounding` list runs first and must score `1.0`; if it fails, the judge is skipped.
- `llmJudge(output, practices)` — strict JSON, binary PASS/FAIL per practice, PASS only with a
  verbatim quote from the output. The judge defaults to a stronger model family than the task.

## Backends: subscription (default) vs OpenRouter

Chosen by `EVAL_BACKEND`; you never edit a case to switch. The model is a separate knob.

| `EVAL_BACKEND` | Runtime | Auth | Model names |
|---|---|---|---|
| `subscription` *(default)* | Claude Agent SDK on the Claude Code login | none — `ANTHROPIC_API_KEY` is stripped so nothing bills API tokens | Anthropic IDs (`claude-haiku-4-5`) |
| `openrouter` | content tier: a direct OpenAI-compatible call; tool tiers: the Agent SDK pointed at `ANTHROPIC_BASE_URL` | `OPENROUTER_API_KEY` | OpenRouter slugs (`anthropic/claude-haiku-4.5`, `google/gemini-2.5-flash`) |

| Variable | Default | Meaning |
|---|---|---|
| `EVAL_MODEL` | `claude-haiku-4-5` | model under test |
| `EVAL_JUDGE_MODEL` | `claude-sonnet-5` | judge model |
| `EVAL_MAX_TURNS` | `8` | default turn cap (a case's `maxTurns` overrides it) |
| `EVAL_CONFIG` | `candidate` | `baseline` runs without the artifact (used by `eval:benchmark`) |
| `EVAL_QUIET` | unset | suppress per-run traces |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api` | point at the LiteLLM proxy below for non-Anthropic models in the tool tiers |

Always set `EVAL_MODEL` (and `EVAL_JUDGE_MODEL`) together with `EVAL_BACKEND=openrouter`: the
defaults are Anthropic IDs that OpenRouter does not know.

```bash
EVAL_BACKEND=openrouter OPENROUTER_API_KEY=sk-or-... \
EVAL_MODEL=anthropic/claude-haiku-4.5 EVAL_JUDGE_MODEL=anthropic/claude-sonnet-4.5 \
npm run eval -- plugins/sdd-engineering/evals/plan-verifier
```

### Tool tiers on non-Anthropic models: the LiteLLM proxy

The Agent SDK speaks only the Anthropic Messages protocol, and OpenRouter serves that shape only for
`anthropic/*` slugs. To run `agentTask` / `workflowTask` on another model, start the bundled
translating proxy (Docker) and point the harness at it:

```bash
export OPENROUTER_API_KEY=sk-or-...
npm run proxy:up                    # proxy/docker-compose.yml → http://localhost:4000
export EVAL_BACKEND=openrouter OPENROUTER_BASE_URL=http://localhost:4000
export EVAL_MODEL=google/gemini-2.5-flash EVAL_JUDGE_MODEL=google/gemini-2.5-flash
npm run eval -- plugins/architecture-review
npm run proxy:down
```

The proxy uses `OPENROUTER_API_KEY` as its master key; do not expose port 4000. Smaller models
often do the work inline instead of dispatching a subagent or invoking the `Skill` tool, so treat
workflow `activation` results on them as indicative.

## Adding evals to a plugin

```
plugins/<plugin>/evals/<name>/
  <name>.eval.ts      thin: describe + run — nothing else
  <name>.cases.ts     the data: prompts, practices, grounding, threshold, maxTurns
  fixtures/           raw inputs inlined into prompts (diffs, snapshots, plans)
```

`<name>` is the skill or agent name without the plugin prefix. Generate the trio with:

```bash
npm run eval:scaffold                                       # list skills/agents and which have evals
npm run eval:scaffold -- <plugin>:<skill>                   # a skill
npm run eval:scaffold -- --agent <plugin>:<agent>           # an agent (refuses to overwrite)
```

Eval files import the harness by relative path — `plugins/<plugin>/evals/<name>/` is four levels
below the repository root:

```ts
// plugins/sdd-engineering/evals/spec-creator/spec-creator.eval.ts
import { describeAgent, runAgentCases } from "../../../../evals/src/index.js";
import { cases } from "./spec-creator.cases.js";

describeAgent("sdd-engineering:spec-creator", () => runAgentCases("sdd-engineering:spec-creator", cases));
```

```ts
// plugins/sdd-engineering/evals/spec-creator/spec-creator.cases.ts
import type { AgentCase } from "../../../../evals/src/index.js";
import { fixtureReader } from "../../../../evals/src/index.js";

const fx = fixtureReader(import.meta.url); // reads ./fixtures/<file>

export const cases: AgentCase[] = [
  {
    name: "vague idea returns a Need clarification block instead of a spec",
    kind: "quality",
    prompt: `Write a spec: add tags to orders.\n\n${fx("orders-service-snapshot.md")}`,
    grounding: ["Need clarification"],          // cheap gate, all must appear
    practices: ["asks at most five numbered questions, each with concrete options"],
    threshold: 0.75,                            // judge score gate (default 0.6)
    maxTurns: 10,
  },
];
```

Skills use `describeSkill` / `runSkillCases` / `SkillCase` with the same shape. Workflow cases
(`describeWorkflow` / `runWorkflowCases` / `WorkflowCase`) are trace-asserted and organised by
scenario:

| `kind` | Passes when |
|---|---|
| `dispatch` | the session launched `expectSubagent` (a namespaced agent, e.g. `sdd-engineering:implementer`) |
| `activation` | the skill engaged (Skill call or `SKILL.md` read) exactly when `shouldActivate` says; `indicative: true` turns a miss into a warning |
| `trace` | every listed subagent, skill and file read happened in one session |
| `contrast` | the treatment session (plugins loaded) read `expectFileRead` and the control session (empty folder, no plugins) did not |

Writing good cases:

- Use a neutral sample domain (orders, invoices, a todo app) and keep fixtures free of any real
  project's names.
- One practice = one binary, quotable fact about the answer. "Gives good advice" is not a practice.
- Put cheap, exact facts in `grounding`; keep the judge for what a substring cannot settle.
- Include a negative case (a request the artifact must refuse, a benign input it must not flag).
- Fixtures are excluded from typechecking and test discovery; keep them under `fixtures/`.

Changes only under `plugins/*/evals/` do not require a plugin version bump.

## Statistics tools

```bash
npm run eval:repeat -- plugins/sdd-engineering/evals/plan-verifier -n 5 --allow-more --label before
# edit the agent …
npm run eval:repeat -- plugins/sdd-engineering/evals/plan-verifier -n 5 --allow-more --label after
npm run eval:delta -- before after         # which practices moved, and how the metrics shifted

npm run eval:benchmark -- plugins/sdd-engineering/evals/spec-creator -n 3   # lift vs no artifact
npm run eval:compare                       # pass/fail flips between the last two runs
npm run test:unit                          # the statistics unit tests (no model)
```

`eval:repeat` caps `-n` at 2 to bound token spend; `-n 5` without `--allow-more` prints a warning
and runs 2. Pass `--allow-more` to run all `n`. A median over 2 samples says little, so use 5 or
more for a cost baseline.

### Recorded metrics

Every run appends these to `results/records.jsonl` (`metrics`, plus `num_turns`):

| Metric | Meaning |
|---|---|
| `inputTokens` / `outputTokens` | uncached input and output tokens |
| `cacheReadTokens` / `cacheCreationTokens` | input tokens read from / written to the prompt cache |
| `apiCalls` | distinct API responses (the SDK streams one message per content block; blocks of one response share an id and are counted once) |
| `toolCallCount` | `tool_use` blocks seen |
| `numTurns` | turns reported by the SDK |
| `durationMs` | wall-clock latency |
| `costUsd` | SDK `total_cost_usd` |

`costUsd` on the **subscription backend is an API-price estimate, not money billed**: nothing is
charged per token there, so use it to compare runs against each other, not as a bill. On the
`openrouter` content tier it is OpenRouter's `usage.cost` (0 if the gateway omits it). Token counts
include Task subagents (taken from the SDK's per-model usage). A run stopped early by `stopWhen`
sums what it saw before the stop. Records written before a metric existed read as 0 for it.

`repeat` and `benchmark` summarize each metric as **median [min–max]** with mean ± stddev as the
secondary figure; the median is the headline because a single slow or retried run skews the mean.
`eval:repeat --label X` saves all of it to `results/repeat-X.json`, and `eval:delta` shows the
per-metric median change (absolute and %) and whether the candidate's median falls outside the
baseline's `[min, max]` (`outside baseline range`) or inside it (`within noise`).

Everything is written to `evals/results/` (git-ignored, append-only, safe to delete): per-run rows
in `records.jsonl`, full outputs in `outputs/<run>/`, the trend log in `history.jsonl`.

## Layout

```
evals/
  package.json  package-lock.json  tsconfig.json  vitest.config.ts
  proxy/        LiteLLM docker-compose + config (optional, OpenRouter tool tiers)
  scripts/      litellm-proxy.sh (up / down / wait)
  src/
    config.ts             tunables (models, turn cap, thresholds, tool allow-lists)
    artifacts/paths.ts    REPO_ROOT, PLUGINS_DIR, `<plugin>:<name>` resolution, artifact listing
    artifacts/load.ts     skillContent / agentContent / agentTools / agentPreloadedSkills
    artifacts/fixture.ts  fixtureReader(import.meta.url)
    runtime/              runClaude (Agent SDK), runOpenRouter, backend env
    tasks.ts              skillTask / agentTask / workflowTask
    dsl/                  describe* + run*Cases + case types
    scoring/              patternMatch, llmJudge
    records/              record(), stats, benchmark
    repeat.ts delta.ts compare.ts scaffold.ts skill-quality.ts trend-reporter.ts
    index.ts              the import surface for eval files
```

Vitest's test directory is the repository root (`test.dir` in `vitest.config.ts`); it discovers
`plugins/*/evals/**/*.eval.ts` and `evals/src/**/*.test.ts`. `tsconfig.json` includes
`../plugins/*/evals/**/*.ts`, so `npm run typecheck` checks every plugin's cases too.
