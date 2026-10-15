# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

## [1.0.0] - 2026-10-15

### Added

- Agent `architecture-reviewer`: read-only architectural boundary review of a branch, a
  `base...HEAD` range, a file list or a diff, against the preloaded
  `engineering-paved-path:onion-architecture` and
  `engineering-paved-path:frontend-ui-architecture` skills and the project's conventions
  files. Findings carry `path:line`, verbatim evidence, a named rule and a severity read
  from the `engineering-paved-path:skill-routing` mapping; the verdict (CLEAN, CONCERNS,
  BLOCKING-RISK) is advisory.
- Optional machine checks through the project's `verify.checks` command (from the prompt or
  `.claude/sdd-engineering.json`); skipped and reported when not configured.
- Evals: four quality cases over three sample-project diffs and a sample conventions file.

### Dependencies

- engineering-paved-path ^1.0.0
