import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFrontmatter, readJson, splitList } from "../../.github/scripts/lib/frontmatter.mjs";

test("splitList keeps Bash(...) entries with spaces whole", () => {
  assert.deepEqual(splitList("Read, Grep, Glob, Bash(git diff *), Bash(git log *)"), [
    "Read",
    "Grep",
    "Glob",
    "Bash(git diff *)",
    "Bash(git log *)",
  ]);
});

test("splitList does not split on commas inside parentheses and tolerates brackets/quotes", () => {
  assert.deepEqual(splitList("Bash(echo a, b), Read"), ["Bash(echo a, b)", "Read"]);
  assert.deepEqual(splitList('[Read, "Grep"]'), ["Read", "Grep"]);
  assert.deepEqual(splitList(""), []);
  assert.deepEqual(splitList(undefined), []);
});

test("parseFrontmatter returns fields, body, lineCount and split lists", () => {
  const text = [
    "---",
    "name: demo",
    'argument-hint: "[scope]"',
    "tools: Read, Bash(git diff *)",
    "allowed-tools: Bash(git status *), Bash(git log *)",
    "description: >",
    "  Folded text",
    "  continues here.",
    "---",
    "",
    "# Title",
    "",
    "Body.",
    "",
  ].join("\n");
  const fm = parseFrontmatter(text);
  assert.equal(fm.fields.name, "demo");
  assert.equal(fm.fields["argument-hint"], "[scope]");
  assert.equal(fm.fields.description, "Folded text continues here.");
  assert.deepEqual(fm.lists.tools, ["Read", "Bash(git diff *)"]);
  assert.deepEqual(fm.lists["allowed-tools"], ["Bash(git status *)", "Bash(git log *)"]);
  assert.equal(fm.body, "\n# Title\n\nBody.\n");
  assert.equal(fm.lineCount, text.split("\n").length);
});

test("parseFrontmatter handles CRLF and returns null without frontmatter", () => {
  const fm = parseFrontmatter("---\r\nname: x\r\n---\r\nBody\r\n");
  assert.equal(fm.fields.name, "x");
  assert.equal(fm.body, "Body\n");
  assert.equal(parseFrontmatter("# just markdown\n"), null);
  assert.equal(parseFrontmatter("---\nname: x\nno closing fence\n"), null);
});

test("lists are only present for keys that exist", () => {
  assert.deepEqual(parseFrontmatter("---\nname: x\n---\n").lists, {});
});

test("readJson reports errors through the handler and throws without one", () => {
  const seen = [];
  assert.equal(
    readJson("does-not-exist.json", (e) => seen.push(e)),
    null,
  );
  assert.equal(seen.length, 1);
  assert.throws(() => readJson("does-not-exist.json"));
});
