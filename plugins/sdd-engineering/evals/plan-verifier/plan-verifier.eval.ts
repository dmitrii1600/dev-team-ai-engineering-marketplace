import { describeAgent, runAgentCases } from "../../../../evals/src/index.js";
import { cases } from "./plan-verifier.cases.js";

describeAgent("sdd-engineering:plan-verifier", () => runAgentCases("sdd-engineering:plan-verifier", cases));
