// Test fixtures only: this data is never imported by the app. The real catalog is public/catalog.json,
// generated from the repository by scripts/build-catalog.mjs.
import type { Artifact, ArtifactType, Catalog, Plugin } from "../../src/lib/catalog";

const marketplace = {
  name: "acme-market",
  description: "Fixture marketplace",
  repo: "acme/market",
  owner: { name: "Acme", url: "https://github.com/acme" },
};

const artifact = (plugin: string, type: ArtifactType, name: string, description: string, extra: Partial<Artifact> = {}): Artifact => ({
  id: `${plugin}/${type}/${name}`,
  type,
  plugin,
  name,
  displayName: name,
  description,
  invocation: type === "skill" || type === "command" ? `/${plugin}:${name}` : type === "agent" ? `@${plugin}:${name}` : undefined,
  frontmatter: {},
  body: `${description}\n`,
  bodyHtml: `<p>${description}</p>\n`,
  path: `plugins/${plugin}/${type}s/${name}.md`,
  sourceUrl: `https://github.com/acme/market/blob/main/plugins/${plugin}/${type}s/${name}.md`,
  capabilities: [],
  ...extra,
});

const plugin = (name: string, fields: Partial<Plugin>, artifacts: Artifact[]): Plugin => ({
  name,
  version: "1.0.0",
  description: `${name} description`,
  tags: [],
  path: `plugins/${name}`,
  sourceUrl: `https://github.com/acme/market/tree/main/plugins/${name}`,
  installCommand: `claude plugin install ${name}@acme-market`,
  artifactIds: artifacts.map((a) => a.id),
  capabilities: [],
  releases: [],
  ...fields,
});

const release = (version: string, date: string, text: string) => ({
  version,
  date,
  sections: { Added: [text] },
  sectionsHtml: { Added: [text] },
  summary: text,
  summaryHtml: text,
});

const statsOf = (plugins: Plugin[], artifacts: Artifact[]): Catalog["stats"] => {
  const byType: Catalog["stats"]["byType"] = { skill: 0, agent: 0, command: 0, hook: 0, mcp: 0 };
  for (const a of artifacts) byType[a.type]++;
  const byCategory: Record<string, number> = {};
  for (const p of plugins) if (p.category) byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
  const dates = plugins.flatMap((p) => p.releases.map((r) => r.date)).sort();
  return { plugins: plugins.length, byType, byCategory, ...(dates.length ? { lastRelease: dates[dates.length - 1] } : {}) };
};

const build = (plugins: Plugin[], artifacts: Artifact[]): Catalog => ({
  schemaVersion: 1,
  generatedAt: "2026-10-15T12:00:00.000Z",
  commit: "abcdef1234567",
  marketplace,
  stats: statsOf(plugins, artifacts),
  plugins,
  artifacts,
});

const alphaArtifacts = [
  artifact("alpha-tools", "skill", "commit-message", "Writes a Conventional Commits message for staged changes."),
  artifact("alpha-tools", "skill", "release-notes", "Drafts release notes from merged pull requests."),
  artifact("alpha-tools", "agent", "code-reviewer", "Reviews a diff for correctness bugs and security issues.", {
    model: "inherit",
    tools: ["Read", "Grep"],
  }),
];
const betaArtifacts = [
  artifact("beta-tools", "skill", "db-migrate", "Plans a safe database migration."),
  artifact("beta-tools", "command", "deploy", "Deploys the current branch to staging."),
  artifact("beta-tools", "hook", "PreToolUse", "PreToolUse hook (matcher: Bash)", { bodyHtml: '<pre class="code-block"><code>{}</code></pre>' }),
];

const alpha = plugin(
  "alpha-tools",
  {
    displayName: "Alpha Tools",
    description: "Git and review helpers.",
    category: "development",
    tags: ["git", "review"],
    author: { name: "Ada" },
    updatedAt: "2026-10-01",
    readme: "# Alpha\n",
    readmeHtml: "<h3>Alpha</h3>",
    releases: [release("1.0.0", "2026-10-01", "First release of alpha")],
  },
  alphaArtifacts,
);
const beta = plugin(
  "beta-tools",
  {
    displayName: "Beta Tools",
    description: "Database and deploy helpers.",
    category: "operations",
    tags: ["database", "git"],
    author: { name: "Bob" },
    updatedAt: "2026-10-10",
    releases: [release("1.1.0", "2026-10-10", "Second release of beta"), release("1.0.0", "2026-09-20", "First release of beta")],
  },
  betaArtifacts,
);

/** Two plugins, 3 skills, 1 agent, 1 command, 1 hook, 0 MCP servers. */
export const fixtureCatalog = (): Catalog => build([alpha, beta], [...alphaArtifacts, ...betaArtifacts]);

/** One plugin with one skill, one agent, no commands and no MCP servers: all singular forms. */
export const singlePluginCatalog = (): Catalog => {
  const artifacts = alphaArtifacts.filter((a) => a.name !== "release-notes");
  return build([plugin("alpha-tools", { ...alpha, artifactIds: artifacts.map((a) => a.id) }, artifacts)], artifacts);
};

export const emptyCatalog = (): Catalog => build([], []);
