/**
 * The headless turn-loop driver. Runs one Claude Agent SDK session on the subscription and
 * extracts what the session ACTUALLY did (tools, subagents, skills, reads) — not its prose.
 */

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { EVAL_MODEL, MAX_TURNS, MUTATING_TOOLS, SPAWN_TOOLS } from "../config.js";
import { isAbsolute } from "node:path";
import { REPO_ROOT, pluginDir } from "../artifacts/paths.js";
import { subscriptionEnv } from "./env.js";

export interface Metrics {
  durationMs: number;
  /** Uncached input tokens (cache reads/writes are reported separately below). */
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the prompt cache. */
  cacheReadTokens: number;
  /** Input tokens written to the prompt cache. */
  cacheCreationTokens: number;
  /** Distinct API responses in the session (NOT the same as numTurns, which counts messages). */
  apiCalls: number;
  /** Total tool_use blocks seen (NOT deduplicated — a measure of work done). */
  toolCallCount: number;
  /**
   * Cost in USD as reported by the SDK. On the subscription backend nothing is billed per token,
   * so this is an API-price ESTIMATE, not money charged — use it for relative comparison only.
   */
  costUsd: number;
}

export interface Result {
  text: string;
  toolsUsed: string[];
  subagents: string[];
  /** Skills activated via the Skill tool (workflow mode); name may be "plugin:skill". */
  skillsInvoked: string[];
  filesRead: string[];
  numTurns: number;
  isError: boolean;
  metrics: Metrics;
}

export interface RunOptions {
  systemPrompt?: string;
  allowedTools?: string[];
  maxTurns?: number;
  cwd?: string;
  model?: string;
  /** ["project"] loads on-disk CLAUDE.md + settings; default [] keeps the run isolated. */
  settingSources?: Array<"user" | "project" | "local">;
  /**
   * Plugins to load for the session: a plugin name under plugins/ (e.g. "sdd-engineering") or an
   * absolute path to a plugin directory. Passed to the Agent SDK as `{ type: "local", path }`
   * with MCP discovery disabled. Default: none (content-tier isolation).
   */
  plugins?: string[];
  /**
   * Early-stop hook. Called after every tool_use with the trace collected SO FAR; return true to
   * end the session immediately. Lets a dispatch/trace case stop the moment its evidence is in
   * (e.g. the subagent was launched) instead of waiting for a heavy nested subagent to finish.
   * On an early stop the run is NOT an error and metrics reflect only what ran before the stop.
   */
  stopWhen?: (partial: Pick<Result, "subagents" | "filesRead" | "skillsInvoked" | "toolsUsed">) => boolean;
}

/** Run one headless Claude turn-loop and extract what it ACTUALLY did (not its prose). */
export async function runClaude(prompt: string, opts: RunOptions = {}): Promise<Result> {
  const allowedTools = opts.allowedTools ?? [];
  // With no tools, a subagent/skill prompt that says "read files" will loop on denied tool
  // calls until max-turns. For these content-only evals the input is already in the prompt,
  // so tell the model to answer directly.
  let systemPrompt = opts.systemPrompt;
  if (allowedTools.length === 0) {
    const directive =
      "\n\nYou have NO tools available in this session. Do not attempt any tool calls. " +
      "Answer directly and completely from the information given in the prompt.";
    systemPrompt = (systemPrompt ?? "") + directive;
  }

  const options: Options = {
    model: opts.model ?? EVAL_MODEL,
    maxTurns: opts.maxTurns ?? MAX_TURNS,
    permissionMode: "bypassPermissions",
    systemPrompt,
    allowedTools,
    // `allowedTools` only PRE-APPROVES the listed tools — under bypassPermissions every other tool
    // stays usable. Observed on a logged-in machine: a workflow session used Edit to append to
    // a project notes file, and other sessions used the account's claude.ai connectors (Claude Docs,
    // Artifact) to create private artifacts in the user's account. So the session gets EXACTLY
    // the allow-listed built-ins (`tools`), mutating ones are refused even if a nested definition
    // asks for them, and no MCP server or account connector is loaded.
    tools: allowedTools,
    disallowedTools: MUTATING_TOOLS.filter((t) => !allowedTools.includes(t)),
    mcpServers: {},
    strictMcpConfig: true,
    cwd: opts.cwd ?? REPO_ROOT,
    // Default: do NOT load on-disk config — isolates the injected artifact. workflowTask overrides.
    settingSources: opts.settingSources ?? [],
    // Marketplace plugins for the workflow tier; never their MCP servers (same reason as above).
    plugins: (opts.plugins ?? []).map((p) => ({
      type: "local" as const,
      path: isAbsolute(p) ? p : pluginDir(p),
      skipMcpDiscovery: true,
    })),
    env: subscriptionEnv(),
  };

  const textParts: string[] = [];
  const tools: string[] = [];
  const subagents: string[] = [];
  const skills: string[] = [];
  const reads: string[] = [];
  let resultText = "";
  let isError = false;
  let numTurns = 0;
  let toolCallCount = 0;
  // Resource metrics, read defensively off the result message (field names verified against the
  // installed SDK's types). total_cost_usd is an API-price ESTIMATE on the subscription backend
  // (nothing is billed per token there) — not money charged, but comparable between runs. Fall
  // back to 0 whenever a field is absent — never throw.
  let durationMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let costUsd = 0;
  let stoppedEarly = false;
  let resultReceived = false;
  // The SDK streams one `assistant` message per content block, and blocks of one API response
  // share `message.id` (each repeating that response's usage). Keep the latest usage per id, so
  // the number of keys is the number of API calls and summing the values never double-counts.
  // A message without an id counts as its own call.
  const usageById = new Map<string, any>();
  let anonCalls = 0;
  // Wall-clock fallback: on an early stop we break before the result message that carries
  // duration_ms/usage, so those stay 0. Stamp duration ourselves, and sum token usage off the
  // assistant messages, so an early-stopped case still reports meaningful metrics.
  const startedAt = Date.now();

  // The SDK throws on an error result (e.g. max-turns). We still want the partial output
  // and the tool/subagent trace we collected, so catch and fall through with isError=true.
  try {
    loop: for await (const msg of query({ prompt, options })) {
      if (msg.type === "assistant") {
        numTurns++;
        const id = (msg.message as any).id;
        if (id) usageById.set(id, (msg.message as any).usage ?? {});
        else usageById.set(`anon-${anonCalls++}`, (msg.message as any).usage ?? {});
        for (const block of msg.message.content as any[]) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "tool_use") {
            tools.push(block.name);
            toolCallCount++;
            const input = block.input ?? {};
            if (SPAWN_TOOLS.has(block.name)) {
              const sub = input.subagent_type ?? input.agent_type ?? input.name;
              if (sub) subagents.push(sub);
            }
            if (block.name === "Read") {
              const fp = input.file_path ?? input.path;
              // Forward slashes on every OS — cases match repo-relative paths like
              // "skills/run-plan/SKILL.md", which never match a Windows backslash path.
              if (fp) reads.push(String(fp).replace(/\\/g, "/"));
            }
            if (block.name === "Skill") {
              const s = input.skill ?? input.command;
              if (s) skills.push(s);
            }
            // Evidence is in — break the loop before a heavy nested subagent runs to completion.
            // Breaking the async iterator triggers its return()/abort, tearing down the subprocess.
            if (
              opts.stopWhen?.({
                subagents: [...new Set(subagents)],
                filesRead: reads,
                skillsInvoked: [...new Set(skills)],
                toolsUsed: [...new Set(tools)],
              })
            ) {
              stoppedEarly = true;
              break loop;
            }
          }
        }
      } else if (msg.type === "result") {
        isError = msg.subtype !== "success";
        const m = msg as any;
        numTurns = m.num_turns ?? 0;
        durationMs = m.duration_ms ?? 0;
        costUsd = m.total_cost_usd ?? 0;
        // `usage` covers the MAIN agent loop only; `modelUsage` also includes Task subagents and
        // internal calls, so prefer it for token accounting and fall back to `usage` when absent.
        const perModel = Object.values(m.modelUsage ?? {}) as any[];
        if (perModel.length > 0) {
          const sum = (k: string) => perModel.reduce((a, u) => a + (u?.[k] ?? 0), 0);
          inputTokens = sum("inputTokens");
          outputTokens = sum("outputTokens");
          cacheReadTokens = sum("cacheReadInputTokens");
          cacheCreationTokens = sum("cacheCreationInputTokens");
        } else {
          inputTokens = m.usage?.input_tokens ?? 0;
          outputTokens = m.usage?.output_tokens ?? 0;
          cacheReadTokens = m.usage?.cache_read_input_tokens ?? 0;
          cacheCreationTokens = m.usage?.cache_creation_input_tokens ?? 0;
        }
        resultReceived = true;
        if (m.result) resultText = m.result;
      }
    }
  } catch (err) {
    isError = true;
    if (!resultText && textParts.length === 0) {
      throw err; // nothing usable collected — surface the failure
    }
  }

  // Early stop never reached the result message, so fall back to the wall-clock duration.
  if (stoppedEarly && durationMs === 0) durationMs = Date.now() - startedAt;
  // No result message (early stop, or the SDK threw first): tokens come from the assistant
  // messages seen so far, so they cover only what ran before the stop.
  if (!resultReceived) {
    for (const u of usageById.values()) {
      inputTokens += u.input_tokens ?? 0;
      outputTokens += u.output_tokens ?? 0;
      cacheReadTokens += u.cache_read_input_tokens ?? 0;
      cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
    }
  }

  return {
    text: resultText || textParts.join("\n"),
    toolsUsed: [...new Set(tools)],
    subagents: [...new Set(subagents)],
    skillsInvoked: [...new Set(skills)],
    filesRead: reads,
    numTurns,
    isError,
    metrics: {
      durationMs,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      apiCalls: usageById.size,
      toolCallCount,
      costUsd,
    },
  };
}
