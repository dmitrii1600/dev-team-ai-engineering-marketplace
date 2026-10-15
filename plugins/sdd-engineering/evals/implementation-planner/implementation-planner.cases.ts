import type { AgentCase } from "../../../../evals/src/index.js";
import { fixtureReader } from "../../../../evals/src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier: the planner's body, read-only tools (Write/Bash withheld), cwd = this repository.
// The sample orders-service project and its approved spec are handed over as text. The routing
// table is the REAL engineering-paved-path:skill-routing skill, passed as a file path inside this
// repository so the planner derives the Skill contract from it exactly as in production.
const ROUTING = "plugins/engineering-paved-path/skills/skill-routing/SKILL.md";
const CHECKS = "npm run lint && npm run typecheck";
const TESTS = "npx vitest run {file}";

const HARNESS_NOTE = `Evaluation setting (from the caller, not from the project):
- This session has read-only tools: Read, Grep, Glob, Skill. Write and Bash are not available.
- The project is NOT on disk. The snapshot below is the whole tree you can cite; cite it as path:line. The spec below is the file specs/2026-10-01-order-cancellation.md of that project.
- plansDir is plans/ and holds no plans yet. No insights file and no gate are configured. There is no .claude/sdd-engineering.json.
- Where your instructions say to Write the plan file, put the complete plan in your reply inside one fenced markdown block instead, then end with the Plan Report.`;

const request = (inputs: string) => `Plan the implementation of specs/2026-10-01-order-cancellation.md.

Project inputs:
${inputs}

${HARNESS_NOTE}

--- spec: specs/2026-10-01-order-cancellation.md ---
${fx("2026-10-01-order-cancellation.md")}
--- end of spec ---

${fx("orders-service-snapshot.md")}`;

const ROUTING_INPUT = `- routing: ${ROUTING} (a file in the current working directory — Read it)`;
const VERIFY_INPUT = `- verify.checks: \`${CHECKS}\`\n- verify.tests: \`${TESTS}\``;

export const cases: AgentCase[] = [
  {
    name: "no execution mode stated returns the Requirements review with the mode question",
    kind: "quality",
    prompt: request(`${VERIFY_INPUT}\n${ROUTING_INPUT}`),
    grounding: ["Requirements review", "single-agent", "multi-agent"],
    practices: [
      "the response is the Requirements review block only: it contains no plan — no '**Plan ID:**' header and no numbered implementation steps",
      "asks the caller to choose the execution mode, describing single-agent (one linear step list, one implementer) and multi-agent (tracks with exclusive file ownership run in parallel)",
      "gives its own mode recommendation for this task with a one-sentence reason",
      "contains a requirements ledger whose rows quote the spec's criteria (AC-1, EC-1, …) and give each a status of clear, ambiguous, contradicts tree or contradicts conventions",
      "reports the verify commands as configured (the checks and tests commands from the prompt) instead of asking for them",
      "ends with a 'Default if you would rather I just go' line naming a mode and the verify commands",
    ],
    threshold: 0.8,
    maxTurns: 15,
  },
  {
    name: "mode and verify commands given produce a plan with header fields and a namespaced Skill contract",
    kind: "quality",
    prompt: request(`- mode: single-agent\n${VERIFY_INPUT}\n${ROUTING_INPUT}`),
    grounding: ["**Plan ID:**", "**Spec:**", "**Execution mode:**", "engineering-paved-path:", "Skill contract"],
    practices: [
      "the plan header carries '**Plan ID:** 2026-10-01-order-cancellation', a '**Spec:**' link to specs/2026-10-01-order-cancellation.md and '**Execution mode:** single-agent'",
      "the Skill contract names skills by namespaced name, e.g. engineering-paved-path:onion-architecture for the domain / service / repository files and engineering-paved-path:fastify-best-practices for the routes file",
      "the Skill contract never lists engineering-paved-path:security as a skill to load for any file group (mentioning that it is review-time only is fine)",
      "every step has a Verify command written out literally from the given commands (`npm run lint && npm run typecheck`, or `npx vitest run <test file>`), and the whole suite runs only once, in the last step",
      "every file path in the steps either exists in the snapshot or is explicitly marked new",
      "has no Tracks section, because the mode is single-agent",
      "keeps refunds and the web client cancel button out of scope instead of planning them",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "missing verify commands are asked for, not invented from package.json",
    kind: "quality",
    prompt: request(`- mode: single-agent\n${ROUTING_INPUT}`),
    grounding: ["Requirements review", "Verify commands"],
    practices: [
      "the response is the Requirements review block only and contains no plan steps",
      "asks for the checks command and the tests command (with {file} where one test file goes)",
      "may propose the commands found in the snapshot's package.json, citing it, but does not adopt them as configured",
      "reports the execution mode as stated by the caller (single-agent) instead of asking for it again",
    ],
    threshold: 0.75,
    maxTurns: 15,
  },
];
