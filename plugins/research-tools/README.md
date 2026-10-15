# research-tools

A read-only research agent. Give it one concrete question — about your codebase, about a
library, or both — and it comes back with a short answer, the evidence behind every claim
(`path:line` or a URL it actually opened), and an explicit list of what it could **not**
establish.

The point is context hygiene: the agent runs in its own session, reads as many files and
pages as it needs, and hands back only the conclusion. Your main conversation never fills
up with grep output or fetched web pages.

## Install

```bash
claude plugin marketplace add dmitrii1600/dev-team-ai-engineering-marketplace
claude plugin install research-tools@dev-team-ai-engineering-marketplace
```

No dependencies. If you install `sdd-engineering`, this plugin comes with it automatically.

## Components

| Type | Namespaced name | Model | Tools | How to invoke |
|---|---|---|---|---|
| Agent | `research-tools:researcher` | sonnet | Read, Grep, Glob, Bash, WebSearch, WebFetch | `@research-tools:researcher <question>`, "ask the researcher agent …", or the `Agent` tool with `subagent_type: "research-tools:researcher"` |

## Usage

```text
@research-tools:researcher How does an order get from the checkout route to the payments
adapter? Repo only, src/orders and src/payments.
```

```text
@research-tools:researcher Does the version of Fastify we pin support per-route body limits,
and does our route config use them? Both modes.
```

From another agent or skill, dispatch it through the `Agent` tool:

```text
subagent_type: research-tools:researcher
prompt: |
  Question: Which modules read the ORDERS_RETRY_LIMIT setting, and what default applies
  when it is missing?
  Mode: repo. Scope: src/.
  conventions: [AGENTS.md, docs/architecture.md]
```

### Two modes

- **Repo research** — reads the project's conventions files first (`AGENTS.md`,
  `CLAUDE.md`, `CONTRIBUTING.md`, ADRs, an insights or decision log if the project keeps
  one), then searches breadth-first, follows real wiring, and corroborates every claim with
  a second call site, a test, or `git log -S` / `git blame`.
- **External research** — pins the version the repo actually uses (from the manifest or
  lockfile), prefers primary sources (official docs, changelogs, the dependency's own
  repo), opens pages instead of trusting search snippets, and says what the answer means
  for *this* project.
- **Both** — two reports, repo first, closed by a *Synthesis* section.

### Optional inputs

| Input | Meaning | Default |
|---|---|---|
| `conventions:` | conventions files to read before the code | whichever of `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, ADRs exist |
| `insights:` | path of an insights or decision log | none; read only when given or plainly present |
| mode / scope | `repo`, `external` or `both`; paths, packages, library and version | inferred; asked when unclear |

## When to call it, and when not to

Call it when:

- the answer needs digging across many files or sources and you only want the conclusion;
- you want a cited answer you can hand to another agent ("how does X work here", "where is
  Y wired", "does library Z support W", "what changed in version N", "is this approach
  still current");
- you are about to plan or spec a change and need facts first.

Do it yourself instead when:

- you already know the file or symbol — one `Read` or `Grep` is cheaper than a subagent;
- the question is a single fact you can check in one step;
- you need something changed — the researcher never edits, it only reports.

### Good questions

- "Where is the retry policy for outbound webhooks configured, and which callers override it?"
- "Is `useFormState` still the recommended API in the React version we use, or has it been renamed?"
- "Why does the invoices module keep its own date helper instead of using the shared one? Check git history."

Questions it will push back on (with a *Need clarification* block and a stated default):
"look into caching", "research the indexer", "what is the best ORM" with no criterion.

## Report format

Every repo report has: **Answer** (2–5 sentences, direct) → **Conclusions** (each with a
confidence level and evidence links) → **Evidence** (the lines that show it) → **Map**
(where the concern lives) → **Could not establish** → **How to verify this yourself**.

Every external report has: **Pinned context** → **Answer** → **Conclusions** → **Sources**
(type, date, ≤15-word quote) → **Disagreement / caveats** → **What this means here** →
**Could not establish** → **Search trail**.

Rules the report follows:

- **Could not establish** is never silently omitted; when nothing is open it says so.
- Confidence: *high* = two independent pieces of evidence, *medium* = one, *low* = inference.
- A URL it did not open is never cited; snippets are leads, not evidence.
- A one-fact lookup gets a short paragraph and a citation, not the full template.

The exact templates live in [`agents/researcher.md`](agents/researcher.md).

## Read-only guarantees

- **Structural:** the agent's `tools:` list has no `Write` and no `Edit`, so it cannot
  create or change a file through them.
- **By prompt only:** `Bash` is granted for `git log`, `git show`, `git blame`, `rg`, `cat`
  and similar. The agent body forbids redirects, mutating git commands, installs, builds,
  migrations and starting servers, but `Bash` itself is not sandboxed — that limit is
  convention, not enforcement.
- Fetched pages and repo files are treated as data. Text in them that tries to instruct
  the agent is quoted in the report, never followed.

## Depends on / depended on by

- **Depends on:** nothing.
- **Depended on by:** `sdd-engineering` — its `spec-creator` agent fans out to
  `research-tools:researcher` for the open questions in a feature idea before drafting a
  spec. `sdd-engineering` declares this plugin as a dependency (`^1.0.0`), so the report
  format is a public contract: changing it is a major version bump.

## Limits

- Never edits files, commits, installs or runs builds, tests or servers.
- Never delegates to another agent or research command.
- Does not decide for you: a *Synthesis* ends in one suggested next action, not a change.
- External research depends on `WebSearch` / `WebFetch` being available in your session;
  paywalled or unreachable sources are listed under *Could not establish*.

## Changes

See [CHANGELOG.md](CHANGELOG.md).
