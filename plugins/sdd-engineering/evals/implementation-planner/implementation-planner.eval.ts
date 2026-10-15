import { describeAgent, runAgentCases } from "../../../../evals/src/index.js";
import { cases } from "./implementation-planner.cases.js";

describeAgent("sdd-engineering:implementation-planner", () =>
  runAgentCases("sdd-engineering:implementation-planner", cases),
);
