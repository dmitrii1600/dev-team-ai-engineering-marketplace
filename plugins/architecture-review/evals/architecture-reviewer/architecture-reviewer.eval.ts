import { describeAgent, runAgentCases } from "../../../../evals/src/index.js";
import { cases } from "./architecture-reviewer.cases.js";

describeAgent("architecture-review:architecture-reviewer", () =>
  runAgentCases("architecture-review:architecture-reviewer", cases),
);
