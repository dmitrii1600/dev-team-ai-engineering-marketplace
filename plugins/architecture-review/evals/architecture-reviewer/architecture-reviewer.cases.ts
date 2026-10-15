import type { AgentCase } from "../../../../evals/src/index.js";
import { fixtureReader } from "../../../../evals/src/index.js";

const fx = fixtureReader(import.meta.url);

// The fixtures describe a neutral sample project: an orders API with onion rings under
// `src/orders/{domain,ports,application,adapters,http}`, a pure `packages/pricing-core` library and
// a Next.js frontend in `web/`. That project does not exist on disk, so every prompt hands the
// agent (a) the project's conventions file as text and (b) the diff as text, and states the scope
// fully. The agent's Step 0 asks for clarification when "the named paths do not exist" — without
// this framing it would (correctly) ask instead of reviewing.
const scoped = (file: string) => `Review this proposed diff for architectural boundary breaks.

Scope: the diff below is the complete scope. It is a proposed change to a sample project that is NOT present in the working tree, so its files do not exist on disk — that is expected, not a blocker. Review the diff text as given against the project's conventions file below and the architecture skills (engineering-paved-path:onion-architecture, engineering-paved-path:frontend-ui-architecture, engineering-paved-path:skill-routing). If a skill is not in your context and cannot be loaded with the Skill tool, read it from plugins/engineering-paved-path/skills/<name>/SKILL.md in this repository. Do not ask for clarification. verify.checks is not configured: do not run any checks; report machine checks as not run.

conventions (the project's AGENTS.md):

${fx("conventions.md")}

diff:

${fx(file)}`;

// Practices are written against the architecture-reviewer report format:
//   - a finding cites its rule on a `Rule:` line — a rule number or name from the
//     onion-architecture / frontend-ui-architecture skills, or a named rule from the project's
//     conventions file (`core-purity`, `discount-cap-gate`, …);
//   - severity is CRITICAL | WARNING | SUGGESTION;
//   - the verdict is CLEAN | CONCERNS | BLOCKING-RISK (advisory).

const REVIEW_PROMPT = scoped("checkout-service.diff");

// The discriminating case for rule citation. Both violations map onto PROJECT-SPECIFIC rule
// names from the conventions file (`core-purity`, `discount-cap-gate`) that a competent model
// describes in prose but does not reliably name unless the agent forces a citation.
const PRICING_CORE_PROMPT = scoped("pricing-core-gate.diff");

// A diff that violates NO documented rule (a local-variable rename). A grounded reviewer reports
// zero findings; a reviewer freed from "every finding names a rule" tends to fabricate a
// best-practice finding here.
const BENIGN_PROMPT = scoped("benign-refactor.diff");

export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (src/orders/domain/checkout.ts) importing a type from 'fastify' as a boundary break — an inner ring depending on the transport framework",
      "flags the `new PgCheckoutRepository()` call inside checkout-service.ts as a boundary break — the application service constructs a concrete infrastructure class instead of receiving a port through its constructor",
      "names the specific documented rule for EVERY finding on a `Rule:` line (an onion-architecture rule number or name, or a named rule from the conventions file) rather than describing the problem only in prose",
      "assigns a severity of CRITICAL, WARNING or SUGGESTION to each finding",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "states an overall verdict of CLEAN, CONCERNS or BLOCKING-RISK",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not raise a runtime-bug, null-safety, or security finding about the optional `reply?: FastifyReply` parameter — citing it as part of the same fastify-in-an-inner-ring layering violation is correct and expected, not a fabrication",
      "stays scoped to structural/layering/dependency-injection findings and does not comment on naming, style, or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the project-specific rule identifiers for pricing-core violations",
    kind: "quality",
    prompt: PRICING_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from \"node:fs\"` added to packages/pricing-core/src/quote.ts as a violation (pricing-core is a pure library and must not do file I/O)",
      "flags that buildQuote now returns `merged` directly, skipping the mandatory `applyDiscountCaps()` step before returning the quote",
      "names the exact documented rule identifier `core-purity` for the fs-import finding rather than only describing it in prose",
      "names the exact documented rule identifier `discount-cap-gate` for the skipped-step finding rather than only describing it in prose",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "states an overall verdict of CLEAN, CONCERNS or BLOCKING-RISK",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no boundary-break findings for the benign rename (or only SUGGESTION-level, non-blocking notes) — it does not invent a CRITICAL or WARNING finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the overall verdict is CLEAN",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
