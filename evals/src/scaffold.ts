/**
 * Discover the skills/agents of every plugin in this marketplace and scaffold eval files for one
 * of them, so a plugin author adds tests without hand-copying the file trio.
 *
 *   npm run eval:scaffold                               # list every skill/agent and whether it has evals
 *   npm run eval:scaffold -- <plugin>:<skill>           # create plugins/<plugin>/evals/<skill>/{<skill>.eval.ts, .cases.ts, fixtures/}
 *   npm run eval:scaffold -- --agent <plugin>:<agent>   # same for an agent
 *
 * Refuses to overwrite existing files.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { GREEN, DIM, YELLOW, RESET } from "./ansi.js";
import {
  PLUGINS_DIR,
  REPO_ROOT,
  artifactEvalDir,
  hasEvals,
  listAgents,
  listSkills,
  parseArtifactName,
} from "./artifacts/paths.js";

const rel = (p: string) => relative(REPO_ROOT, p).replace(/\\/g, "/");

function list(): void {
  console.log(`\n${"=".repeat(64)}\nSkills (${rel(PLUGINS_DIR)}/*/skills)\n${"=".repeat(64)}`);
  for (const s of listSkills()) {
    const mark = hasEvals(s) ? `${GREEN}✓ evals${RESET}` : `${DIM}— no evals${RESET}`;
    console.log(`  ${s.padEnd(48)} ${mark}`);
  }
  console.log(`\n${"=".repeat(64)}\nAgents (${rel(PLUGINS_DIR)}/*/agents)\n${"=".repeat(64)}`);
  for (const a of listAgents()) {
    const mark = hasEvals(a) ? `${GREEN}✓ evals${RESET}` : `${DIM}— no evals${RESET}`;
    console.log(`  ${a.padEnd(48)} ${mark}`);
  }
  console.log(
    `\nScaffold one:  npm run eval:scaffold -- <plugin>:<skill>   |   npm run eval:scaffold -- --agent <plugin>:<agent>`,
  );
}

// Eval files live at plugins/<plugin>/evals/<name>/ — four levels below the repo root.
const HARNESS_IMPORT = "../../../../evals/src/index.js";

function casesTemplate(kind: "Skill" | "Agent"): string {
  return `import type { ${kind}Case } from "${HARNESS_IMPORT}";

// To inline a fixture file into a prompt, uncomment these two lines and drop the file in
// fixtures/, then use fx("your-fixture.ext") inside a prompt string:
//   import { fixtureReader } from "${HARNESS_IMPORT}";
//   const fx = fixtureReader(import.meta.url);

export const cases: ${kind}Case[] = [
  {
    name: "TODO describe the good behavior this checks",
    kind: "quality",
    prompt: "TODO the user/task prompt the ${kind.toLowerCase()} should handle",
    practices: [
      "TODO a specific, binary, citable thing the answer must do",
      "TODO another one — keep each verifiable from a verbatim quote",
    ],
    // grounding: ["exact-substring-that-must-appear-before-judging"], // optional cheap gate
    // threshold: 0.6,
    // maxTurns: 8,
  },
  // Keep it minimal — one or two cases is enough to start.
];
`;
}

function evalTemplate(tier: "skills" | "agents", id: string, name: string): string {
  const describe = tier === "skills" ? "describeSkill" : "describeAgent";
  const run = tier === "skills" ? "runSkillCases" : "runAgentCases";
  return `import { ${describe}, ${run} } from "${HARNESS_IMPORT}";
import { cases } from "./${name}.cases.js";

${describe}("${id}", () => ${run}("${id}", cases));
`;
}

function scaffold(tier: "skills" | "agents", id: string): void {
  const kind = tier === "skills" ? "Skill" : "Agent";
  const { name } = parseArtifactName(id);
  const available = tier === "skills" ? listSkills() : listAgents();
  if (!available.includes(id)) {
    console.error(`${YELLOW}warning:${RESET} '${id}' not found among ${tier} in plugins/ — scaffolding anyway.`);
    console.error(`  available ${tier}: ${available.join(", ") || "(none)"}`);
  }

  const dir = artifactEvalDir(id);
  const files: [string, string][] = [
    [join(dir, `${name}.eval.ts`), evalTemplate(tier, id, name)],
    [join(dir, `${name}.cases.ts`), casesTemplate(kind)],
    [join(dir, "fixtures", ".gitkeep"), ""],
  ];

  const existing = files.filter(([f]) => existsSync(f)).map(([f]) => rel(f));
  if (existing.length) {
    console.error(`${YELLOW}refusing to overwrite:${RESET}\n  ${existing.join("\n  ")}`);
    process.exit(1);
  }

  mkdirSync(join(dir, "fixtures"), { recursive: true });
  for (const [f, content] of files) writeFileSync(f, content);

  console.log(`${GREEN}scaffolded ${id}:${RESET}`);
  for (const [f] of files) console.log(`  ${rel(f)}`);
  console.log(`\nNext: fill in ${name}.cases.ts, then run  npm run eval -- ${rel(dir)}`);
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0) return list();
  const agentIdx = argv.indexOf("--agent");
  if (agentIdx !== -1) {
    const id = argv[agentIdx + 1];
    if (!id) return void console.error("usage: npm run eval:scaffold -- --agent <plugin>:<agent>");
    return scaffold("agents", id);
  }
  scaffold("skills", argv[0]);
}

main();
