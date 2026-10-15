#!/usr/bin/env node
// Repo-specific checks that `claude plugin validate` does not cover.
// Usage: node .github/scripts/check-marketplace.mjs
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { listDirs, readFrontmatter, readJson as readJsonFile } from "./lib/frontmatter.mjs";

const ROOT = process.cwd();
const MARKETPLACE = join(ROOT, ".claude-plugin", "marketplace.json");
const PLUGINS_DIR = join(ROOT, "plugins");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX_DESCRIPTION = 1024;
const MAX_SKILL_LINES = 500;

const errors = [];
const fail = (msg) => errors.push(msg);

const readJson = (path) =>
  readJsonFile(path, (err) => fail(`${relative(ROOT, path)}: invalid JSON (${err.message})`));

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

// The subset of node-semver ranges this repo uses: exact, =, >=, ^ and ~ (partial
// versions such as ^2.0 allowed). Anything else is reported so the check stays honest.
const RANGE = /^(\^|~|>=|=)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;
const satisfies = (range, version) => {
  const r = range.trim().match(RANGE);
  if (!r) return undefined;
  const [, op = "=", ...parts] = r;
  const want = parts.map((p) => (p === undefined ? undefined : Number(p)));
  const [M, m, p] = want.map((n) => n ?? 0);
  const v = version.split(/[-+]/)[0].split(".").map(Number);
  const cmp = (a, b) => a.reduce((acc, x, i) => acc || Math.sign(x - b[i]), 0);
  if (cmp(v, [M, m, p]) < 0) return false;
  if (op === ">=") return true;
  if (op === "=") return want.every((n, i) => n === undefined || n === v[i]);
  if (op === "~") return v[0] === M && (want[1] === undefined || v[1] === m);
  // ^: the left-most non-zero part is fixed
  if (M > 0 || want[1] === undefined) return v[0] === M;
  if (m > 0 || want[2] === undefined) return v[0] === 0 && v[1] === m;
  return v[0] === 0 && v[1] === 0 && v[2] === p;
};

// `dependencies` items are "name", "name@marketplace" or { name, version?, marketplace? }.
// Same-marketplace dependencies must exist, satisfy their range and form no cycle.
const checkDependencies = (manifests) => {
  const edges = new Map();
  for (const [name, manifest] of manifests) {
    const deps = manifest.dependencies ?? [];
    if (!Array.isArray(deps)) {
      fail(`plugins/${name}: "dependencies" must be an array`);
      continue;
    }
    edges.set(name, []);
    for (const dep of deps) {
      const item = typeof dep === "string" ? { name: dep } : dep ?? {};
      const [depName, market] =
        typeof dep === "string" && dep.includes("@") ? dep.split("@") : [item.name, item.marketplace];
      const label = `plugins/${name} › dependency ${depName}`;
      if (market && market !== marketplace.name) {
        fail(`${label}: cross-marketplace dependencies need "allowCrossMarketplaceDependenciesOn" and a review`);
        continue;
      }
      const target = manifests.get(depName);
      if (!target) {
        fail(`${label}: not listed in marketplace.json`);
        continue;
      }
      edges.get(name).push(depName);
      if (item.version === undefined) continue;
      const ok = satisfies(item.version, target.version ?? "");
      if (ok === undefined) fail(`${label}: unsupported range "${item.version}" (use ^, ~, >=, = or exact)`);
      else if (!ok) fail(`${label}: range ${item.version} is not satisfied by ${depName} ${target.version}`);
    }
  }

  const state = new Map();
  const visit = (name, path) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "active") {
      fail(`dependency cycle: ${[...path.slice(path.indexOf(name)), name].join(" -> ")}`);
      return;
    }
    state.set(name, "active");
    for (const next of edges.get(name) ?? []) visit(next, [...path, name]);
    state.set(name, "done");
  };
  for (const name of edges.keys()) visit(name, []);
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
  const manifests = new Map();
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
    manifests.set(entry.name, manifest);
  }

  for (const dir of listDirs(PLUGINS_DIR)) {
    if (!listedDirs.has(dir)) fail(`plugins/${dir} is not listed in marketplace.json`);
  }

  checkDependencies(manifests);
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log("Marketplace checks passed.");
