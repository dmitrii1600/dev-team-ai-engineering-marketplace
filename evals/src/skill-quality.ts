/**
 * Static quality checks for SKILL.md files — no model, no network. The fast gate to run
 * before the (slower) LLM evals.
 *
 *   npm run eval:quality                                   # every plugins/*\/skills/*\/SKILL.md
 *   npm run eval:quality -- engineering-paved-path         # every skill of one plugin
 *   npm run eval:quality -- sdd-engineering:spec-writing   # one skill
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
import {
  REPO_ROOT,
  artifactEvalDir,
  hasEvals,
  listPlugins,
  listSkills,
  parseArtifactName,
  skillDir,
} from "./artifacts/paths.js";

const REQUIRED = ["description"];
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const rel = (p: string) => relative(REPO_ROOT, p).replace(/\\/g, "/");

interface Report {
  skill: string;
  errors: string[];
  warnings: string[];
  verdict: "PASS" | "WARN" | "FAIL";
}

function* internalLinks(body: string): Generator<[string, string]> {
  for (const m of body.matchAll(LINK_RE)) {
    const target = m[2].trim().replace(/^<|>$/g, "");
    if (/^(https?:|#|mailto:)/.test(target)) continue;
    // Links built from runtime variables (`${CLAUDE_SKILL_DIR}/...`) are resolved by Claude Code.
    if (target.includes("${")) continue;
    const path = target.split("#")[0];
    if (path) yield [target, path];
  }
}

function evaluate(id: string): Report {
  const { name } = parseArtifactName(id);
  const dir = skillDir(id);
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) {
    return { skill: id, errors: [`SKILL.md not found in ${rel(dir)}`], warnings: [], verdict: "FAIL" };
  }
  const { data: fm, content: body } = matter(readFileSync(skillMd, "utf8"));
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const f of REQUIRED) {
    if (!(f in fm)) errors.push(`missing frontmatter field: ${f}`);
    else if (!fm[f]) errors.push(`empty frontmatter field: ${f}`);
  }
  // Claude Code falls back to the directory name when `name` is absent, so that is not fatal.
  if (!("name" in fm)) warnings.push(`no frontmatter name — Claude Code uses the directory name '${name}'`);
  else if (!fm.name) errors.push("empty frontmatter field: name");
  if (fm.name && fm.name !== name) errors.push(`frontmatter name '${fm.name}' != directory '${name}'`);
  if (body.length < 100) errors.push("SKILL.md body suspiciously short (< 100 chars)");
  if (body.split("\n").filter((l) => l.startsWith("#")).length < 2) errors.push("fewer than 2 headings — likely incomplete");
  for (const [target, path] of internalLinks(body)) {
    if (!existsSync(join(dir, path))) errors.push(`broken reference (${target}) — not found: ${path}`);
  }
  if (/\.claude\/(skills|agents)\//.test(body)) {
    errors.push("references .claude/skills or .claude/agents — plugin skills use ${CLAUDE_SKILL_DIR} or namespaced names");
  }

  if (!hasEvals(id)) warnings.push(`no eval file (expected under: ${rel(artifactEvalDir(id))}/)`);
  if (body.split("\n").length > 500) warnings.push(`SKILL.md very long (${body.split("\n").length} lines) — consider splitting`);

  return { skill: id, errors, warnings, verdict: errors.length ? "FAIL" : warnings.length ? "WARN" : "PASS" };
}

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const verdictColor = (v: Report["verdict"]) => (v === "FAIL" ? RED : v === "WARN" ? YELLOW : GREEN);

/** Args are `<plugin>:<skill>` (one skill) or `<plugin>` (all its skills); none = every skill. */
function selectSkills(args: string[]): string[] {
  const all = listSkills();
  if (!args.length) return all;
  const plugins = new Set(listPlugins());
  const out: string[] = [];
  for (const a of args) {
    if (a.includes(":")) out.push(a);
    else if (plugins.has(a)) out.push(...all.filter((s) => s.startsWith(`${a}:`)));
    else parseArtifactName(a); // not a plugin and not namespaced: throws with a "did you mean" hint
  }
  return out;
}

function main() {
  const ids = selectSkills(process.argv.slice(2));

  let failures = 0;
  for (const id of [...ids].sort()) {
    const r = evaluate(id);
    console.log(`\n${"=".repeat(64)}\n${r.skill}  [${verdictColor(r.verdict)}${r.verdict}${RESET}]\n${"=".repeat(64)}`);
    r.errors.forEach((e) => console.log(`  ${RED}ERROR: ${e}${RESET}`));
    r.warnings.forEach((w) => console.log(`  ${YELLOW}WARN:  ${w}${RESET}`));
    if (!r.errors.length && !r.warnings.length) console.log(`  ${GREEN}all checks passed.${RESET}`);
    if (r.verdict === "FAIL") failures++;
  }
  console.log(`\n${"=".repeat(64)}\nTotal: ${ids.length} skills in ${listPlugins().length} plugins, ${failures} failures`);
  process.exit(failures ? 1 : 0);
}

main();
