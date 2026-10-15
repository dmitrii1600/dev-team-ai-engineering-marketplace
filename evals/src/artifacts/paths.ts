/**
 * Filesystem anchors and artifact addressing. The eval package reads the real plugin sources of
 * this marketplace by relative path — this module is the single source of those locations.
 *
 * An artifact is addressed by its namespaced name `<plugin>:<name>`, the same form Claude Code
 * uses at runtime:
 *
 *   agent  `<plugin>:<name>` → plugins/<plugin>/agents/<name>.md
 *   skill  `<plugin>:<name>` → plugins/<plugin>/skills/<name>/SKILL.md
 *
 * A plugin's own evals live next to it: plugins/<plugin>/evals/<name>/.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVALS_DIR = join(HERE, "..", "..");
export const REPO_ROOT = join(EVALS_DIR, "..");
export const PLUGINS_DIR = join(REPO_ROOT, "plugins");
export const RESULTS_DIR = join(EVALS_DIR, "results");

export interface ArtifactRef {
  plugin: string;
  name: string;
}

const NAMESPACED = /^([a-z0-9][a-z0-9._-]*):([a-z0-9][a-z0-9._-]*)$/i;

/** Split `<plugin>:<name>`. Throws with a hint when the name is not namespaced. */
export function parseArtifactName(id: string): ArtifactRef {
  const m = id.match(NAMESPACED);
  if (!m) {
    const candidates = [...listAgents(), ...listSkills()].filter((a) => a.endsWith(`:${id}`));
    const hint = candidates.length ? ` — did you mean ${candidates.map((c) => `'${c}'`).join(" or ")}?` : "";
    throw new Error(`artifact name must be namespaced as '<plugin>:<name>', got '${id}'${hint}`);
  }
  return { plugin: m[1], name: m[2] };
}

export const pluginDir = (plugin: string): string => join(PLUGINS_DIR, plugin);

/** plugins/<plugin>/agents/<name>.md */
export function agentPath(id: string): string {
  const { plugin, name } = parseArtifactName(id);
  return join(pluginDir(plugin), "agents", `${name}.md`);
}

/** plugins/<plugin>/skills/<name>/ (the directory holding SKILL.md and references/) */
export function skillDir(id: string): string {
  const { plugin, name } = parseArtifactName(id);
  return join(pluginDir(plugin), "skills", name);
}

/** plugins/<plugin>/evals/<name>/ — where an artifact's cases, eval file and fixtures live. */
export function artifactEvalDir(id: string): string {
  const { plugin, name } = parseArtifactName(id);
  return join(pluginDir(plugin), "evals", name);
}

const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

/** Every plugin directory under plugins/ (a directory with a .claude-plugin/plugin.json or any agents/skills). */
export function listPlugins(): string[] {
  if (!isDir(PLUGINS_DIR)) return [];
  return readdirSync(PLUGINS_DIR)
    .filter((d) => isDir(join(PLUGINS_DIR, d)))
    .filter(
      (d) =>
        existsSync(join(PLUGINS_DIR, d, ".claude-plugin", "plugin.json")) ||
        isDir(join(PLUGINS_DIR, d, "agents")) ||
        isDir(join(PLUGINS_DIR, d, "skills")),
    )
    .sort();
}

/** Every skill as `<plugin>:<name>` (directories under plugins/<plugin>/skills/ holding a SKILL.md). */
export function listSkills(): string[] {
  const out: string[] = [];
  for (const p of listPlugins()) {
    const dir = join(PLUGINS_DIR, p, "skills");
    if (!isDir(dir)) continue;
    for (const s of readdirSync(dir)) {
      if (isDir(join(dir, s)) && existsSync(join(dir, s, "SKILL.md"))) out.push(`${p}:${s}`);
    }
  }
  return out.sort();
}

/** Every agent as `<plugin>:<name>` (plugins/<plugin>/agents/*.md, README.md excluded). */
export function listAgents(): string[] {
  const out: string[] = [];
  for (const p of listPlugins()) {
    const dir = join(PLUGINS_DIR, p, "agents");
    if (!isDir(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".md") && f !== "README.md") out.push(`${p}:${f.replace(/\.md$/, "")}`);
    }
  }
  return out.sort();
}

/** True when the artifact has at least one *.eval.ts under plugins/<plugin>/evals/<name>/. */
export function hasEvals(id: string): boolean {
  const dir = artifactEvalDir(id);
  return isDir(dir) && readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}
