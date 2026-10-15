/**
 * The three ways to run a case. Each composes runtime + artifacts; nothing here talks to the
 * SDK directly.
 *
 *   skillTask / agentTask — inject the artifact's content as system prompt, load NO plugins and
 *     NO on-disk config → measures the artifact's CONTENT in isolation.
 *   workflowTask — load the marketplace plugins through the Agent SDK's `plugins` option (the
 *     same `--plugin-dir` mechanism Claude Code uses) → measures the SYSTEMIC effect: does a
 *     skill activate, does a subagent dispatch, do namespaced cross-plugin references resolve.
 *
 * Artifacts are addressed by namespaced name: `<plugin>:<name>`.
 */

import { IS_BASELINE, WORKFLOW_ALLOWED_TOOLS } from "./config.js";
import { runClaude, type RunOptions } from "./runtime/run-claude.js";
import { runContent } from "./runtime/dispatch.js";
import { skillContent, agentContent, agentTools } from "./artifacts/load.js";
import { listPlugins } from "./artifacts/paths.js";

/**
 * Run a prompt with a skill's content injected (the 'candidate' condition). Under
 * EVAL_CONFIG=baseline the artifact is NOT injected — that is the benchmark's without-skill
 * baseline, i.e. the raw model, used to measure the skill's lift.
 *
 * @param skillName namespaced: `<plugin>:<skill>` → plugins/<plugin>/skills/<skill>/SKILL.md
 */
export function skillTask(prompt: string, skillName: string, opts: RunOptions = {}) {
  const systemPrompt = IS_BASELINE ? undefined : skillContent(skillName);
  return runContent(prompt, { ...opts, systemPrompt });
}

/**
 * Run a prompt with a subagent's definition injected as the system prompt (baseline: none).
 *
 * A subagent is a TOOL-USING artifact — its whole method is "read the docs, grep the code".
 * Running it content-only (no tools) both contradicts its own body and trips runClaude's
 * "you have NO tools" directive, which makes a doc-grounded agent refuse or hedge every claim.
 * So we hand it the read-only subset of the tools it declares in frontmatter and let it run from
 * REPO_ROOT (runClaude's default cwd). Both conditions (candidate + baseline) get the same tools
 * so the measured lift stays fair.
 *
 * @param agentName namespaced: `<plugin>:<agent>` → plugins/<plugin>/agents/<agent>.md
 */
export function agentTask(prompt: string, agentName: string, opts: RunOptions = {}) {
  const systemPrompt = IS_BASELINE ? undefined : agentContent(agentName);
  const allowedTools = agentTools(agentName);
  return runClaude(prompt, { allowedTools, ...opts, systemPrompt });
}

/**
 * Run a prompt with the marketplace plugins loaded, the way an installed user session sees them.
 * By default every plugin under plugins/ is loaded (so cross-plugin dependencies resolve); pass
 * `opts.plugins` to load a subset. No project/user settings are loaded unless `opts.settingSources`
 * asks for them. Ignores EVAL_CONFIG — the workflow tier has its own control-vs-treatment design.
 *
 * Safety: keep allowedTools a read-only allow-list (no Bash/Write/Edit) — a fresh session
 * with bypassPermissions could otherwise take real actions in the repo. Plugin MCP servers are
 * never started (skipMcpDiscovery).
 */
export function workflowTask(prompt: string, opts: RunOptions = {}) {
  return runClaude(prompt, {
    allowedTools: WORKFLOW_ALLOWED_TOOLS,
    plugins: listPlugins(),
    ...opts,
  });
}
