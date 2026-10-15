# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

## [1.0.0] - 2026-10-15

### Added

- Agent `spec-creator`: dated feature specs with EARS acceptance criteria, edge cases, design review, traceability and untrusted inputs; delegates research to `research-tools:researcher`.
- Agent `implementation-planner`: requirements review, then a single-agent or multi-agent implementation plan with a skill contract derived from `engineering-paved-path:skill-routing`.
- Agent `implementer`: executes a plan, a track or a fix loop with the plan's own verify commands.
- Agent `plan-verifier`: per-item conformance ledger against a plan or spec, with a delta mode.
- Skill `run-plan`: build → verify → arch → delta → gate orchestration with capped fix loops, reports under `runsDir` and resume with `--from`.
- Skill `workflow-retro` (manual only): retrospective of an agent workflow run, with the bundled `retro-usage.mjs` transcript reader.
- Skill `spec-writing`: spec template, lifecycle and the bundled `spec-lint.mjs`.
- Project configuration in `.claude/sdd-engineering.json`: `specsDir`, `plansDir`, `runsDir`, `retroDir`, `conventions`, `insights`, `verify`, `gate`, `routing`.
- Docs: `docs/configuration.md`, `docs/artifacts.md`.

### Dependencies

- engineering-paved-path ^1.0.0, research-tools ^1.0.0, architecture-review ^1.0.0
