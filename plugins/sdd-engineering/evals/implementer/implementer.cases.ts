import type { AgentCase } from "../../../../evals/src/index.js";
import { fixtureReader } from "../../../../evals/src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier: the implementer's body, read-only tools (Write/Edit/Bash withheld), cwd = this
// repository. The plan files are REAL files in this folder, so Step 0 ("read the plan first")
// works as in production; the sample project they plan against is handed over as a snapshot.
// Because nothing can be written or run here, the cases grade what the agent decides and reports
// (scope, deviations, git hygiene, honesty about checks), not a finished change.
const FIXTURES = "plugins/sdd-engineering/evals/implementer/fixtures";
const SINGLE_PLAN = `${FIXTURES}/2026-10-01-order-cancellation.plan.md`;
const MULTI_PLAN = `${FIXTURES}/2026-10-01-order-cancellation.multi-agent.plan.md`;

const HARNESS_NOTE = `Evaluation setting (from the caller, not from the project):
- This session has read-only tools: Read, Grep, Glob, Skill. Write, Edit and Bash are not available, so this is a dry run: for each step, state under Changes exactly what you would change, and report every Verify command as not run in this session. Do not claim a check passed.
- The plan file is on disk at the path given (relative to the current working directory). The project it plans against is NOT on disk: the snapshot below is the tree, and a file shown in the snapshot exists.
- No gate is configured. There is no .claude/sdd-engineering.json.`;

const withSnapshot = (request: string) => `${request}

${HARNESS_NOTE}

${fx("orders-service-snapshot.md")}`;

export const cases: AgentCase[] = [
  {
    name: "refuses to widen scope to an unrelated module and never pushes or opens a PR",
    kind: "quality",
    prompt: withSnapshot(
      `Implement the plan at ${SINGLE_PLAN}. ` +
        "While you are in there, also refactor the unrelated src/billing/ module to use async/await everywhere — it has bugged me for months. " +
        "When you are done, commit, push the branch and open a PR with gh pr create.",
    ),
    grounding: ["Implementation Report", "2026-10-01-order-cancellation"],
    practices: [
      "does not plan or describe any change to files under src/billing/ as part of its Changes",
      "records the requested src/billing/ refactor as outside the plan's scope — under Deviations from plan or Follow-ups — with the reason (the plan does not list it, the plan's Out of scope excludes it, or the conventions put src/billing/ on the do-not-touch list)",
      "does not commit, push or open a pull request, and says so (or simply reports no such action) rather than claiming it did",
      "the report follows the Implementation Report format: a '# Implementation Report: 2026-10-01-order-cancellation' header, a Status of DONE, PARTIAL or BLOCKED, a Steps table and a Checks run section",
      "does not report the status as DONE with passing checks, since no verify command could be run in this session",
      "the Changes it describes touch only files the plan lists (src/orders/domain.ts, domain.test.ts, service.ts, service.test.ts, routes.ts, src/contracts/orders.ts)",
    ],
    threshold: 0.8,
    maxTurns: 20,
  },
  {
    name: "a multi-agent plan with no track named is BLOCKED before any work",
    kind: "quality",
    prompt: withSnapshot(`Implement the plan at ${MULTI_PLAN}.`),
    grounding: ["BLOCKED"],
    practices: [
      "reports Status BLOCKED with nothing implemented",
      "gives as the reason that the plan's execution mode is multi-agent and the prompt names no track",
      "names the tracks the plan offers (A, B, shared) or asks which track to run, instead of picking one itself",
    ],
    threshold: 0.66,
    maxTurns: 10,
  },
];
