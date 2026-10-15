/**
 * Load a skill / agent artifact from disk as text, to inject as a system prompt. This is what
 * makes skillTask/agentTask measure the artifact's CONTENT in isolation.
 *
 * Artifacts are addressed by namespaced name (`<plugin>:<name>`); see ./paths.ts.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { agentPath, parseArtifactName, pluginDir, skillDir } from "./paths.js";

function stripFrontmatter(md: string): string {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(end + 4).replace(/^\n+/, "");
  }
  return md;
}

function frontmatterOf(md: string): string {
  const fmEnd = md.startsWith("---") ? md.indexOf("\n---", 3) : -1;
  return fmEnd !== -1 ? md.slice(0, fmEnd) : "";
}

/**
 * A comma-separated or YAML-list frontmatter field (`tools: Read, Grep` / `skills:` followed by
 * `  - plugin:skill` lines) as trimmed, unquoted entries. Returns null when the field is absent.
 */
function frontmatterList(frontmatter: string, key: string): string[] | null {
  const lines = frontmatter.split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i === -1) return null;
  const inline = lines[i].slice(key.length + 1).trim();
  let raw: string[];
  if (inline) {
    raw = inline.replace(/^\[|\]$/g, "").split(",");
  } else {
    raw = [];
    for (const l of lines.slice(i + 1)) {
      const m = l.match(/^\s+-\s*(.*)$/);
      if (!m) break;
      raw.push(m[1]);
    }
  }
  return raw.map((t) => t.trim().replace(/^["']|["']$/g, "")).filter((t) => t.length > 0);
}

const readAgent = (agentName: string): string => {
  const f = agentPath(agentName);
  if (!existsSync(f)) throw new Error(`agent not found: ${f}`);
  return readFileSync(f, "utf8");
};

const fwd = (p: string) => p.replace(/\\/g, "/");

/**
 * Expand the variables Claude Code substitutes in plugin skill / agent bodies, so an injected
 * artifact points at real files (e.g. `node "${CLAUDE_SKILL_DIR}/scripts/lint.mjs"`).
 */
function expandVars(text: string, id: string, dir?: string): string {
  let out = text.split("${CLAUDE_PLUGIN_ROOT}").join(fwd(pluginDir(parseArtifactName(id).plugin)));
  if (dir) out = out.split("${CLAUDE_SKILL_DIR}").join(fwd(dir));
  return out;
}

/** `<plugin>:<skill>` → SKILL.md plus every references/*.md — the full payload the harness would assemble. */
export function skillContent(skillName: string): string {
  const dir = skillDir(skillName);
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) throw new Error(`SKILL.md not found: ${skillMd}`);
  const parts = [readFileSync(skillMd, "utf8")];
  const refs = join(dir, "references");
  if (existsSync(refs)) {
    for (const f of readdirSync(refs).filter((f) => f.endsWith(".md")).sort()) {
      parts.push(`\n\n## Reference: ${f}\n\n${readFileSync(join(refs, f), "utf8")}`);
    }
  }
  return expandVars(parts.join("\n"), skillName, dir);
}

/**
 * Skills an agent PRELOADS through its `skills:` frontmatter. Claude Code injects their full
 * content into the subagent's context at startup, so the content tier does the same. Entries are
 * namespaced (`<plugin>:<skill>`); a bare name is resolved against the agent's own plugin.
 */
export function agentPreloadedSkills(agentName: string): string[] {
  const list = frontmatterList(frontmatterOf(readAgent(agentName)), "skills") ?? [];
  const { plugin } = parseArtifactName(agentName);
  return list.map((s) => (s.includes(":") ? s : `${plugin}:${s}`));
}

/**
 * `<plugin>:<agent>` → the agent definition with its frontmatter stripped (the behavioral
 * prompt), followed by the SKILL.md body of every skill it preloads via `skills:` frontmatter —
 * the same payload Claude Code assembles when it starts the subagent. Reference files stay on
 * disk (the agent reads them on demand, as in production); the skill directory is named so its
 * relative links resolve.
 */
export function agentContent(agentName: string): string {
  const parts = [expandVars(stripFrontmatter(readAgent(agentName)), agentName)];
  for (const skill of agentPreloadedSkills(agentName)) {
    const dir = skillDir(skill);
    const skillMd = join(dir, "SKILL.md");
    if (!existsSync(skillMd)) throw new Error(`preloaded skill ${skill} of ${agentName} not found: ${skillMd}`);
    const body = expandVars(stripFrontmatter(readFileSync(skillMd, "utf8")), skill, dir);
    parts.push(`\n\n---\n\n# Preloaded skill: ${skill}\n\nSkill directory: ${fwd(dir)}\n\n${body}`);
  }
  return parts.join("");
}

// Tools the eval refuses to hand a subagent: evals run with bypassPermissions against the LIVE
// repo, so a mutating tool could take real actions. An agent that declares these still runs — it
// just runs read-only, which is all an eval ever needs. Spawn tools are dropped too: the content
// tier measures ONE artifact, and a nested subagent would both blur that and multiply the cost.
const DROPPED_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Agent", "Task"]);
const READONLY_FALLBACK = ["Read", "Grep", "Glob"];

/**
 * The tools an agent DECLARES in its frontmatter (`tools: Read, Glob, Grep`, or a YAML list), so
 * the eval can run a tool-using agent the way production does instead of crippling it to
 * content-only. Derived per agent from its own declaration — no per-agent wiring. Returns [] when
 * the agent declares no tools (genuine content-only agent). Mutating and spawn tools are stripped
 * for safety; a `*` / "All tools" grant collapses to the read-only fallback. A scoped grant such
 * as `Bash(git diff *)` is reduced to its tool name before filtering.
 */
export function agentTools(agentName: string): string[] {
  const raw = frontmatterList(frontmatterOf(readAgent(agentName)), "tools");
  if (!raw) return [];
  if (raw.some((t) => t === "*" || /all tools/i.test(t))) return [...READONLY_FALLBACK];
  const names = raw.map((t) => t.replace(/\(.*\)$/, "").trim()).filter((t) => t.length > 0 && !DROPPED_TOOLS.has(t));
  return [...new Set(names)];
}
