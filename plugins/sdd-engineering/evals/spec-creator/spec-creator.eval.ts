import { describeAgent, runAgentCases } from "../../../../evals/src/index.js";
import { cases } from "./spec-creator.cases.js";

describeAgent("sdd-engineering:spec-creator", () => runAgentCases("sdd-engineering:spec-creator", cases));
