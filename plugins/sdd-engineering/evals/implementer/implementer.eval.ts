import { describeAgent, runAgentCases } from "../../../../evals/src/index.js";
import { cases } from "./implementer.cases.js";

describeAgent("sdd-engineering:implementer", () => runAgentCases("sdd-engineering:implementer", cases));
