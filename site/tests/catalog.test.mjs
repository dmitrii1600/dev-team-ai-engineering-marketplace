import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildCatalog, checkOnboarding } from "../scripts/lib/catalog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(HERE, "..", "schema", "catalog.schema.json"), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const config = {
  repo: "acme/market",
  marketplaceName: "acme-market",
  minClaudeCodeVersion: "2.1.300",
  defaultBranch: "main",
};
const now = new Date("2026-10-15T12:00:00Z");
const tmp = mkdtempSync(join(tmpdir(), "catalog-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const write = (root, path, content) => {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
};

// A repository with one plugin containing every artifact type.
const makeRepo = (name, { plugins = ["demo"] } = {}) => {
  const root = join(tmp, name);
  write(root, ".claude-plugin/marketplace.json", {
    name: "acme-market",
    description: "Test marketplace",
    owner: { name: "Acme", url: "https://github.com/acme" },
    plugins: plugins.map((p) => ({ name: p, source: `./plugins/${p}`, category: "development", tags: ["alpha", "beta"] })),
  });
  for (const p of plugins) {
    const base = `plugins/${p}`;
    write(root, `${base}/.claude-plugin/plugin.json`, {
      name: p,
      displayName: "Demo Plugin",
      version: "1.2.0",
      description: "A demo plugin",
      author: { name: "Acme", url: "https://github.com/acme" },
      keywords: ["beta", "gamma"],
      dependencies: ["other", { name: "third", marketplace: "elsewhere" }],
    });
    write(root, `${base}/README.md`, "# Demo\n");
    write(
      root,
      `${base}/CHANGELOG.md`,
      "# Changelog\n\n## [1.2.0] - 2026-10-01\n\n### Added\n\n- One.\n- Two.\n\n## [1.0.0] - 2026-09-01\n\n### Added\n\n- First.\n",
    );
    // Skill without `name`: the directory name is used.
    write(
      root,
      `${base}/skills/make-thing/SKILL.md`,
      '---\ndescription: Makes a thing.\nargument-hint: "[x]"\nallowed-tools: Bash(git diff *), Bash(git log *)\n---\n\n# Make thing\n',
    );
    write(root, `${base}/skills/named/SKILL.md`, "---\nname: custom-name\nwhen_to_use: Use it.\n---\nBody\n");
    write(
      root,
      `${base}/agents/reviewer.md`,
      "---\nname: reviewer\ndescription: Reviews.\ntools: Read, Grep\nmodel: inherit\n---\nPrompt\n",
    );
    write(root, `${base}/commands/deploy.md`, "---\ndescription: Deploys.\n---\nRun deploy\n");
    write(root, `${base}/commands/plain.md`, "# Plain command\n\nNo frontmatter here.\n");
    write(root, `${base}/hooks/hooks.json`, {
      hooks: {
        PreToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command: "echo hi" }] }],
        Stop: [{ hooks: [] }],
      },
    });
    write(root, `${base}/.mcp.json`, {
      mcpServers: { remote: { url: "https://example.com/mcp" }, local: { command: "node", args: ["server.js"] } },
    });
  }
  return root;
};

test("extracts every artifact type with the naming and invocation rules", () => {
  const root = makeRepo("full");
  const { catalog, errors } = buildCatalog({ root, config, now, commit: "abc1234" });
  assert.deepEqual(errors, []);

  const byId = Object.fromEntries(catalog.artifacts.map((a) => [a.id, a]));
  assert.deepEqual(Object.keys(byId).sort(), [
    "demo/agent/reviewer",
    "demo/command/deploy",
    "demo/command/plain",
    "demo/hook/PreToolUse",
    "demo/hook/Stop",
    "demo/mcp/local",
    "demo/mcp/remote",
    "demo/skill/custom-name",
    "demo/skill/make-thing",
  ]);

  const skill = byId["demo/skill/make-thing"];
  assert.equal(skill.name, "make-thing", "skill name falls back to the directory name");
  assert.equal(skill.invocation, "/demo:make-thing");
  assert.equal(skill.argumentHint, "[x]");
  assert.deepEqual(skill.tools, ["Bash(git diff *)", "Bash(git log *)"]);
  assert.equal(skill.body, "# Make thing\n");
  assert.equal(skill.sourceUrl, "https://github.com/acme/market/blob/main/plugins/demo/skills/make-thing/SKILL.md");

  assert.equal(byId["demo/skill/custom-name"].description, "Use it.", "when_to_use is the description fallback");
  assert.equal(byId["demo/agent/reviewer"].invocation, "@demo:reviewer");
  assert.equal(byId["demo/agent/reviewer"].model, "inherit");
  assert.equal(byId["demo/command/plain"].description, "Plain command", "command description falls back to the first line");
  assert.equal(byId["demo/command/deploy"].invocation, "/demo:deploy");
  assert.equal(byId["demo/hook/PreToolUse"].description, "PreToolUse hook (matcher: Edit|Write)");
  assert.equal(byId["demo/hook/PreToolUse"].invocation, undefined);
  assert.deepEqual(Object.keys(JSON.parse(byId["demo/hook/PreToolUse"].body)), ["PreToolUse"]);
  assert.equal(byId["demo/mcp/remote"].description, "https://example.com/mcp");
  assert.equal(byId["demo/mcp/local"].description, "node server.js");
});

test("builds the plugin entry: tags union, install command, releases, stats, schema", () => {
  const root = makeRepo("plugin");
  const { catalog } = buildCatalog({ root, config, now, commit: "abc1234" });
  const [plugin] = catalog.plugins;
  assert.deepEqual(plugin.tags, ["alpha", "beta", "gamma"]);
  assert.equal(plugin.installCommand, "claude plugin install demo@acme-market");
  assert.equal(plugin.compatibility, "Claude Code ≥ 2.1.300");
  assert.deepEqual(plugin.dependencies, ["other", "third@elsewhere"]);
  assert.equal(plugin.updatedAt, "2026-10-01");
  assert.equal(plugin.releases[0].summary, "One, and 1 more change");
  assert.equal(plugin.artifactIds.length, 9);
  assert.deepEqual(catalog.stats.byType, { skill: 2, agent: 1, command: 2, hook: 2, mcp: 2 });
  assert.deepEqual(catalog.stats.byCategory, { development: 1 });
  assert.equal(catalog.stats.lastRelease, "2026-10-01");
  assert.equal(catalog.generatedAt, "2026-10-15T12:00:00.000Z");
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors));
});

test("broken frontmatter and missing fields are reported as errors", () => {
  const root = makeRepo("broken");
  write(root, "plugins/demo/skills/bad/SKILL.md", "no frontmatter at all\n");
  write(root, "plugins/demo/skills/nodesc/SKILL.md", "---\nname: nodesc\n---\nBody\n");
  write(root, "plugins/demo/agents/noname.md", "---\ndescription: x\n---\n");
  const { errors } = buildCatalog({ root, config, now });
  assert.ok(errors.some((e) => e.endsWith("skills/bad/SKILL.md: missing or invalid frontmatter")), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes("skills/nodesc/SKILL.md: frontmatter needs a description")));
  assert.ok(errors.some((e) => e.includes("agents/noname.md: frontmatter needs a name")));
});

test("an unrecognized CHANGELOG is a warning, not an error", () => {
  const root = makeRepo("changelog");
  write(root, "plugins/demo/CHANGELOG.md", "# Changelog\n\n## Whenever\n\n- stuff\n");
  const { catalog, errors, warnings } = buildCatalog({ root, config, now });
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.deepEqual(catalog.plugins[0].releases, []);
  assert.equal(catalog.plugins[0].updatedAt, undefined);
});

test("an empty marketplace yields a valid empty catalog", () => {
  const root = makeRepo("empty", { plugins: [] });
  const { catalog, errors } = buildCatalog({ root, config, now });
  assert.deepEqual(errors, []);
  assert.equal(catalog.plugins.length, 0);
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors));
});

test("the schema rejects malformed catalogs", () => {
  const root = makeRepo("schema");
  const { catalog } = buildCatalog({ root, config, now });
  const bad = structuredClone(catalog);
  bad.plugins[0].version = "one";
  delete bad.artifacts[0].description;
  bad.artifacts[1].type = "widget";
  assert.equal(validate(bad), false);
  assert.ok(validate.errors.length >= 3);
});

test("checkOnboarding compares README commands and the minimum version with the config", () => {
  const root = makeRepo("onboarding");
  const { catalog } = buildCatalog({ root, config, now });
  const readme = [
    "Requires Claude Code **2.1.300** or newer.",
    "```bash",
    "claude plugin marketplace add acme/market",
    "claude plugin marketplace update acme-market",
    "```",
  ].join("\n");
  assert.deepEqual(checkOnboarding({ readme, catalog, config }), []);

  const problems = checkOnboarding({
    readme: readme.replace("acme/market", "other/repo").replace("2.1.300", "2.0.0"),
    catalog,
    config,
  });
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => p.includes("claude plugin marketplace add acme/market")));
  assert.ok(problems.some((p) => p.includes("2.0.0") && p.includes("2.1.300")));

  assert.ok(checkOnboarding({ readme: "nothing", catalog, config }).length >= 3);
  assert.ok(checkOnboarding({ readme, catalog, config: { ...config, marketplaceName: "x" } }).length >= 1);
});

test("renders markdown to sanitized HTML at build time (bodyHtml, readmeHtml, release HTML)", () => {
  const root = makeRepo("html");
  write(root, "plugins/demo/README.md", "# Demo\n\nSee [guide](docs/guide.md).\n\n<script>alert(1)</script>\n");
  write(
    root,
    "plugins/demo/CHANGELOG.md",
    "## [1.2.0] - 2026-10-01\n\n### Added\n\n- Skill `make-thing`: does <b>things</b>.\n",
  );
  const { catalog, errors } = buildCatalog({ root, config, now, commit: "abc1234" });
  assert.deepEqual(errors, []);
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors));

  const [plugin] = catalog.plugins;
  assert.match(plugin.readmeHtml, /<h3>Demo<\/h3>/);
  assert.match(plugin.readmeHtml, /href="https:\/\/github\.com\/acme\/market\/blob\/main\/plugins\/demo\/docs\/guide\.md"/);
  assert.doesNotMatch(plugin.readmeHtml, /<script/);

  const byId = Object.fromEntries(catalog.artifacts.map((a) => [a.id, a]));
  assert.match(byId["demo/skill/make-thing"].bodyHtml, /<h3>Make thing<\/h3>/);
  assert.match(byId["demo/hook/PreToolUse"].bodyHtml, /^<pre class="code-block"><code>.*tok-key/s);
  assert.match(byId["demo/mcp/remote"].bodyHtml, /tok-str/);

  const [release] = plugin.releases;
  assert.equal(release.summaryHtml, "Skill <code>make-thing</code>: does &lt;b&gt;things&lt;/b&gt;.".replace(/\.$/, "") + "");
  assert.deepEqual(Object.keys(release.sectionsHtml), Object.keys(release.sections));
  assert.doesNotMatch(release.sectionsHtml.Added[0], /<b>/);
  assert.match(release.sectionsHtml.Added[0], /<code>make-thing<\/code>/);
});

test("a plugin without README.md has no readme or readmeHtml", () => {
  const root = makeRepo("noreadme");
  rmSync(join(root, "plugins/demo/README.md"), { force: true });
  const { catalog } = buildCatalog({ root, config, now });
  assert.equal(catalog.plugins[0].readme, undefined);
  assert.equal(catalog.plugins[0].readmeHtml, undefined);
});
