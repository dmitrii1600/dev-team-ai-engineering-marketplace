# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

## [1.0.1] - 2026-10-15

### Changed

- Agent `researcher`: never copies secret values (API keys, tokens, passwords) into the
  report; it cites `path:line` and writes `<redacted>` instead.

## [1.0.0] - 2026-10-15

### Added

- Agent `researcher`: read-only research in two modes (repository and external), a
  clarification step for questions without a concrete scope, and a structured report with
  `path:line` or URL evidence, confidence levels and a *Could not establish* section.
- Optional `conventions:` and `insights:` inputs; without them the agent reads whichever
  conventions files the project has.
