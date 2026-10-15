#!/usr/bin/env node
// Fails when a plugin changed since <base-ref> without a higher plugin.json
// version and a CHANGELOG.md update. Without a version bump users never
// receive the change, because Claude Code keeps the cached copy.
// Usage: node .github/scripts/check-version-bump.mjs origin/main
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const base = process.argv[2];
if (!base) {
  console.error("Usage: check-version-bump.mjs <base-ref>");
  process.exit(2);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const changed = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
const changedPlugins = new Map();
for (const file of changed) {
  const m = file.match(/^plugins\/([^/]+)\/(.+)$/);
  if (!m) continue;
  if (!changedPlugins.has(m[1])) changedPlugins.set(m[1], new Set());
  changedPlugins.get(m[1]).add(m[2]);
}

const parse = (v) => (v ?? "").split(/[-+]/)[0].split(".").map(Number);
const greater = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

const errors = [];
for (const [plugin, files] of changedPlugins) {
  const manifest = `plugins/${plugin}/.claude-plugin/plugin.json`;
  if (!existsSync(manifest)) continue; // plugin removed in this change

  let baseVersion;
  try {
    baseVersion = JSON.parse(git("show", `${base}:${manifest}`)).version;
  } catch {
    console.log(`${plugin}: new plugin, skipping bump check`);
    continue;
  }
  const headVersion = JSON.parse(readFileSync(manifest, "utf8")).version;

  if (!greater(headVersion, baseVersion))
    errors.push(`${plugin}: files changed but version ${headVersion} is not greater than ${baseVersion} on ${base}`);
  if (!files.has("CHANGELOG.md"))
    errors.push(`${plugin}: files changed but CHANGELOG.md was not updated`);
  if (!errors.some((e) => e.startsWith(`${plugin}:`)))
    console.log(`${plugin}: ${baseVersion} -> ${headVersion}`);
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
console.log("Version bump checks passed.");
