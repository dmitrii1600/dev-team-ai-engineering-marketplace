import type { AgentCase } from "../../../../evals/src/index.js";
import { fixtureReader } from "../../../../evals/src/index.js";

const fx = fixtureReader(import.meta.url);

// The agent runs in the content tier: its body plus the preloaded sdd-engineering:spec-writing
// skill, read-only tools (Write/Edit/Bash/Agent are withheld), cwd = this repository. The sample
// orders-service project is not on disk, so the prompt carries its snapshot and states how to hand
// back what the agent would normally write to a file. The spec-writing references (template,
// lifecycle) ARE on disk inside the plugin, so the agent can read them as in production.
const today = new Date().toISOString().slice(0, 10);

const HARNESS_NOTE = `Evaluation setting (from the caller, not from the project):
- This session has read-only tools: Read, Grep, Glob, Skill. Write, Edit, Bash and Agent are not available.
- The project is NOT on disk. The snapshot below is the whole tree you can cite; cite it as path:line.
- Today's date is ${today}. specsDir is specs/ and holds no specs yet. No insights file is configured. There is no .claude/sdd-engineering.json.
- Where your instructions say to Write the spec, put the complete spec file in your reply inside one fenced markdown block instead, then end with the Spec Report. Where they say to run the lint, report it as not run in this session.
- No researcher is available: if you truly need research, return the Research needed block.`;

const withSnapshot = (request: string) => `${request}

${HARNESS_NOTE}

${fx("orders-service-snapshot.md")}`;

export const cases: AgentCase[] = [
  {
    name: "vague idea returns a Need clarification block instead of a spec",
    kind: "quality",
    prompt: withSnapshot("Write a spec: add tags to orders."),
    grounding: ["Need clarification"],
    practices: [
      "the response is a 'Need clarification before specifying' block and does not contain a spec: no `Spec ID:` line, no acceptance criteria, no Traceability table",
      "states in one sentence what it understood and in one sentence what blocks a useful spec (for example: no user, no problem, or no observable outcome is named)",
      "asks at most five numbered questions, each offering concrete options (for example who sets tags, whether customers see them, what tags are used for)",
      "ends with a 'Default if you would rather I just go' line that states a single precise interpretation it would specify against",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "clear idea produces a draft spec with EARS criteria, Spec ID and Traceability",
    kind: "quality",
    prompt: withSnapshot(
      "Write a spec for self-service order cancellation. Users: customers of the orders API. " +
        "Problem: today a customer who wants to cancel must email support, and a support agent cancels the order " +
        "with a manual UPDATE in the production database, which takes up to a day and has caused wrong orders to be cancelled. " +
        "Outcome: a customer can cancel their own order while it is still `pending` or `paid` (not yet shipped); " +
        "the order then has status `cancelled` and records when it was cancelled. Shipped orders cannot be cancelled. " +
        "Refunds for paid orders are handled by billing later and are out of scope.",
    ),
    grounding: ["Spec ID: SPEC-", "Status: draft", "Traceability", "shall"],
    practices: [
      `the spec has a \`Spec ID: SPEC-${today}-<short-name>\` line (today's date followed by two to four lowercase words) and a \`Status: draft\` line`,
      "acceptance criteria use EARS wording with 'shall' — at least one event-driven criterion of the form 'WHEN <event>, the system shall …'",
      "at least one edge case uses the unwanted-behaviour form 'IF <condition>, THEN the system shall …' — for example cancelling an order that is already shipped or already cancelled, or cancelling another customer's order",
      "each acceptance criterion and edge case carries a `traces:` reference and a `verify:` lane",
      "contains a Traceability table with one row per acceptance criterion, edge case and NFR",
      "keeps refunds out of scope (listed as a non-goal) rather than specifying refund behaviour",
      "does not drift into a plan: it does not name files to edit, functions to add, or test APIs as the way to implement the feature",
      "ends with a Spec Report whose header is '# Spec Report: SPEC-…' and that states Status: draft",
    ],
    threshold: 0.75,
    maxTurns: 20,
  },
  {
    name: "a design link without an exported image is a clarification, not a guessed design review",
    kind: "quality",
    prompt: withSnapshot(
      "Spec the order history screen for customers from our Figma file: https://www.figma.com/file/AbCdEf/order-history. " +
        "Customers want to see their past orders with status and total.",
    ),
    grounding: ["Need clarification"],
    practices: [
      "returns a 'Need clarification before specifying' block instead of a spec",
      "explains that it cannot open the design-tool link and asks for a PNG export or a markdown mockup under the specs designs folder",
      "does not invent screen contents, states or components that would be in the design",
    ],
    threshold: 0.66,
    maxTurns: 10,
  },
];
