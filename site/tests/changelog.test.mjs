import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChangelog, summarizeRelease } from "../scripts/lib/catalog.mjs";

const SAMPLE = `# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/)

## [Unreleased]

### Added

- Not released yet.

## [0.2.0] - 2026-11-01

### Fixed

- Fixed a crash.

### Added

- New thing that spans
  two lines.
- Another thing.

## [0.1.0] - 2026-10-15

### Added

- Skill \`commit-message\`: commit messages.
`;

test("parses releases newest first and ignores [Unreleased]", () => {
  const { releases, recognized } = parseChangelog(SAMPLE);
  assert.equal(recognized, true);
  assert.deepEqual(
    releases.map((r) => [r.version, r.date]),
    [
      ["0.2.0", "2026-11-01"],
      ["0.1.0", "2026-10-15"],
    ],
  );
  assert.deepEqual(releases[0].sections, {
    Fixed: ["Fixed a crash."],
    Added: ["New thing that spans two lines.", "Another thing."],
  });
});

test("summary uses Added before Fixed and counts the remaining changes", () => {
  const [latest, first] = parseChangelog(SAMPLE).releases;
  assert.equal(latest.summary, "New thing that spans two lines, and 2 more changes");
  assert.equal(first.summary, "Skill `commit-message`: commit messages");
});

test("summary singular form and fallback ordering", () => {
  assert.equal(summarizeRelease({ Added: ["A.", "B."] }), "A, and 1 more change");
  assert.equal(summarizeRelease({ Security: ["S"], Changed: ["C"] }), "C, and 1 more change");
  assert.equal(summarizeRelease({ Removed: ["R"], Fixed: [] }), "R");
  assert.equal(summarizeRelease({}, "1.0.0"), "Release 1.0.0");
});

test("unrecognized formats are flagged instead of throwing", () => {
  const { releases, recognized } = parseChangelog("# Changelog\n\n## Version 1 (Oct 2026)\n\n- stuff\n");
  assert.deepEqual(releases, []);
  assert.equal(recognized, false);
});

test("a file with only [Unreleased] or no headings is fine", () => {
  assert.equal(parseChangelog("# Changelog\n\n## [Unreleased]\n").recognized, true);
  assert.equal(parseChangelog("# Changelog\n").recognized, true);
});

test("rejects impossible dates", () => {
  const { releases, recognized } = parseChangelog("## [1.0.0] - 2026-13-45\n\n### Added\n\n- x\n");
  assert.equal(releases.length, 0);
  assert.equal(recognized, false);
});
