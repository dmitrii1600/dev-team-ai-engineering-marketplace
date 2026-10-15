#!/usr/bin/env node
// Repo-specific checks that `claude plugin validate` does not cover.
// Usage: node .github/scripts/check-marketplace.mjs
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const MARKETPLACE = join(ROOT, ".claude-plugin", "marketplace.json");
const PLUGINS_DIR = join(ROOT, "plugins");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX_DESCRIPTION = 1024;
const MAX_SKILL_LINES = 500;

const errors = [];
const fail = (msg) => errors.push(msg);

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`${relative(ROOT, path)}: invalid JSON (${err.message})`);
    return null;
  }
};

// Minimal frontmatter reader: top-level `key: value` pairs plus folded/literal blocks.
const readFrontmatter = (path) => {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = block.join(" ");
    }
    fields[kv[1]] = value.replace(/^["']|["']$/g, "");
  }
  return { fields, lineCount: text.split("\n").length };
};

const listDirs = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()) : [];

const checkComponents = (pluginName, pluginDir) => {
  for (const skill of listDirs(join(pluginDir, "skills"))) {
    const file = join(pluginDir, "skills", skill, "SKILL.md");
    const where = relative(ROOT, file);
    if (!existsSync(file)) {
      fail(`${where}: missing`);
      continue;
    }
    const fm = readFrontmatter(file);
    const description = fm?.fields.description ?? fm?.fields.when_to_use;
    if (!description) fail(`${where}: frontmatter needs a description`);
    else if (description.length > MAX_DESCRIPTION)
      fail(`${where}: description is ${description.length} chars (max ${MAX_DESCRIPTION})`);
    if (fm && fm.lineCount > MAX_SKILL_LINES)
      fail(`${where}: ${fm.lineCount} lines (max ${MAX_SKILL_LINES}); move detail to references/`);
  }

  const agentsDir = join(pluginDir, "agents");
  if (existsSync(agentsDir)) {
    for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
      const where = relative(ROOT, join(agentsDir, file));
      const fm = readFrontmatter(join(agentsDir, file));
      if (!fm?.fields.name) fail(`${where}: frontmatter needs a name`);
      if (!fm?.fields.description) fail(`${where}: frontmatter needs a description`);
    }
  }

  if (existsSync(join(pluginDir, "CLAUDE.md")))
    fail(`plugins/${pluginName}/CLAUDE.md is not loaded by Claude Code; move it into a skill`);
};

const marketplace = readJson(MARKETPLACE);
if (marketplace) {
  const entries = marketplace.plugins ?? [];
  const names = entries.map((e) => e.name);

  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  if (names.join() !== sorted.join()) fail(`marketplace.json: plugins must be sorted by name`);

  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) fail(`marketplace.json: duplicate plugin names: ${[...new Set(dupes)].join(", ")}`);

  const listedDirs = new Set();
  for (const entry of entries) {
    const label = `marketplace.json › ${entry.name}`;
    if (entry.version !== undefined)
      fail(`${label}: set "version" only in plugin.json, not in the marketplace entry`);

    if (typeof entry.source !== "string") continue; // external sources are validated by the CLI
    if (!entry.source.startsWith("./plugins/")) {
      fail(`${label}: local sources must live under ./plugins/`);
      continue;
    }

    const pluginDir = join(ROOT, entry.source);
    listedDirs.add(relative(PLUGINS_DIR, pluginDir));
    if (!existsSync(pluginDir)) {
      fail(`${label}: source ${entry.source} does not exist`);
      continue;
    }

    const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      fail(`${label}: ${entry.source}/.claude-plugin/plugin.json is missing`);
      continue;
    }
    const manifest = readJson(manifestPath);
    if (!manifest) continue;
    if (manifest.name !== entry.name)
      fail(`${label}: entry name differs from plugin.json name "${manifest.name}"`);
    if (!SEMVER.test(manifest.version ?? ""))
      fail(`${label}: plugin.json needs a SemVer "version" (got ${JSON.stringify(manifest.version)})`);
    if (!existsSync(join(pluginDir, "CHANGELOG.md"))) fail(`${label}: CHANGELOG.md is missing`);

    checkComponents(entry.name, pluginDir);
  }

  for (const dir of listDirs(PLUGINS_DIR)) {
    if (!listedDirs.has(dir)) fail(`plugins/${dir} is not listed in marketplace.json`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log("Marketplace checks passed.");
