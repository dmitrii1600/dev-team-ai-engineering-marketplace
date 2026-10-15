// Pure catalog-building logic (no process.exit, no console), so it can be unit-tested.
// The CLI wrapper is ../build-catalog.mjs. Data model: docs/specs/github-pages-catalog.md §4.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { listDirs, parseFrontmatter, readJson } from "../../../.github/scripts/lib/frontmatter.mjs";
import { inlineCode, renderInlineMarkdown, renderJsonBlock, renderMarkdown } from "./markdown.mjs";

export const SCHEMA_VERSION = 1;
export const ARTIFACT_TYPES = ["skill", "agent", "command", "hook", "mcp"];
const SAFE_NAME = /^[A-Za-z0-9][\w.-]*$/;
const SEMVER = "\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?";

const toPosix = (p) => p.split(sep).join("/");

// ---------------------------------------------------------------------------
// CHANGELOG.md (Keep a Changelog)
// ---------------------------------------------------------------------------

const RELEASE_HEADING = new RegExp(`^##\\s+\\[?(${SEMVER})\\]?\\s*[-\\u2013\\u2014]\\s*(\\d{4}-\\d{2}-\\d{2})\\s*$`);
const SUMMARY_ORDER = ["Added", "Changed", "Fixed"];

const isRealDate = (value) => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const compareSemver = (a, b) => {
  const parse = (v) => v.split(/[-+]/)[0].split(".").map(Number);
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  // A pre-release sorts before the plain release.
  return Number(!a.includes("-")) - Number(!b.includes("-"));
};

// Release summary (spec §7.3): the first item of the most important section
// (Added, Changed, Fixed, then the rest) plus "and N more change(s)".
export const summarizeRelease = (sections, version = "") => {
  const names = Object.keys(sections);
  const ordered = [
    ...SUMMARY_ORDER.filter((n) => names.includes(n)),
    ...names.filter((n) => !SUMMARY_ORDER.includes(n)),
  ];
  const total = names.reduce((sum, n) => sum + sections[n].length, 0);
  const lead = ordered.find((n) => sections[n].length > 0);
  if (!lead) return version ? `Release ${version}` : "No details";
  const first = sections[lead][0].replace(/[\s.]+$/, "");
  const more = total - 1;
  if (more <= 0) return first;
  return `${first}, and ${more} more ${more === 1 ? "change" : "changes"}`;
};

// Returns { releases, recognized }. `recognized` is false when the file has
// release-looking headings but none matched `## [x.y.z] - YYYY-MM-DD`.
export const parseChangelog = (source) => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const releases = [];
  let current = null;
  let section = null;
  let lastItem = null;
  let sawOtherRelease = false;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;

    if (/^##\s/.test(line)) {
      current = null;
      section = null;
      lastItem = null;
      if (/^##\s+\[?unreleased\]?/i.test(line)) continue; // ignored by design
      const m = line.match(RELEASE_HEADING);
      if (m && isRealDate(m[2])) {
        current = { version: m[1], date: m[2], sections: {} };
        releases.push(current);
      } else {
        sawOtherRelease = true;
      }
      continue;
    }
    if (!current) continue;

    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1];
      current.sections[section] ??= [];
      lastItem = null;
      continue;
    }
    if (!section) continue;

    const bullet = line.match(/^[-*+]\s+(.*\S)\s*$/);
    if (bullet) {
      lastItem = bullet[1];
      current.sections[section].push(lastItem);
    } else if (lastItem !== null && /^\s+\S/.test(line)) {
      // Continuation or nested line of the previous bullet.
      const text = line.trim().replace(/^[-*+]\s+/, "");
      const items = current.sections[section];
      items[items.length - 1] = `${items[items.length - 1]} ${text}`;
      lastItem = items[items.length - 1];
    } else if (line.trim() === "") {
      lastItem = null;
    }
  }

  for (const r of releases) r.summary = summarizeRelease(r.sections, r.version);
  releases.sort((a, b) => b.date.localeCompare(a.date) || compareSemver(b.version, a.version));
  return { releases, recognized: releases.length > 0 || !sawOtherRelease };
};

// ---------------------------------------------------------------------------
// Artifact extraction
// ---------------------------------------------------------------------------

const firstLine = (text) => text.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";

const asAuthor = (author) => {
  if (!author) return undefined;
  if (typeof author === "string") return { name: author };
  if (typeof author.name !== "string" || !author.name) return undefined;
  return author.url ? { name: author.name, url: author.url } : { name: author.name };
};

const normalizeDependency = (dep) => {
  if (typeof dep === "string") return dep;
  if (dep && typeof dep.name === "string") return dep.marketplace ? `${dep.name}@${dep.marketplace}` : dep.name;
  return null;
};

const mcpDescription = (server) => {
  if (typeof server?.url === "string") return server.url;
  if (typeof server?.command === "string") return [server.command, ...(server.args ?? [])].join(" ");
  return "MCP server";
};

const hookDescription = (event, entries) => {
  const matchers = [...new Set((Array.isArray(entries) ? entries : []).map((e) => e?.matcher).filter(Boolean))];
  return matchers.length ? `${event} hook (matcher: ${matchers.join(", ")})` : `${event} hook`;
};

// Adds the HTML the browser shows: a one-line summary (code spans only, because it sits inside links)
// and the items of every section as sanitized inline markdown.
const withHtml = (release, ctx) => ({
  ...release,
  summaryHtml: inlineCode(release.summary),
  sectionsHtml: Object.fromEntries(
    Object.entries(release.sections).map(([name, items]) => [name, items.map((i) => renderInlineMarkdown(i, ctx))]),
  ),
});

export function buildCatalog({ root, config, env = process.env, now = new Date(), commit }) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);
  const rel = (p) => toPosix(relative(root, p));
  const readJsonSafe = (p) => readJson(p, (e) => err(`${rel(p)}: invalid JSON (${e.message})`));

  const repoUrl = `https://github.com/${config.repo}`;
  const branch = config.defaultBranch ?? "main";
  const blob = (path) => `${repoUrl}/blob/${branch}/${path}`;
  const tree = (path) => `${repoUrl}/tree/${branch}/${path}`;
  const blobBase = `${repoUrl}/blob/${branch}`;

  const marketplacePath = join(root, ".claude-plugin", "marketplace.json");
  const marketplace = existsSync(marketplacePath) ? readJsonSafe(marketplacePath) : null;
  if (!existsSync(marketplacePath)) err(`.claude-plugin/marketplace.json is missing`);

  const catalog = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    commit: commit ?? env.GITHUB_SHA ?? "local",
    marketplace: {
      name: marketplace?.name ?? config.marketplaceName,
      description: marketplace?.description ?? "",
      repo: config.repo,
      owner: asAuthor(marketplace?.owner) ?? { name: config.repo.split("/")[0] },
    },
    stats: { plugins: 0, byType: Object.fromEntries(ARTIFACT_TYPES.map((t) => [t, 0])), byCategory: {} },
    plugins: [],
    artifacts: [],
  };
  if (!marketplace) return { catalog, errors, warnings };

  const marketplaceName = catalog.marketplace.name;
  const seenIds = new Set();

  for (const entry of marketplace.plugins ?? []) {
    if (typeof entry.source !== "string" || !entry.source.startsWith("./")) {
      warn(`marketplace.json › ${entry.name}: non-local source, not included in the catalog`);
      continue;
    }
    const pluginDir = join(root, entry.source);
    const pluginPath = toPosix(relative(root, pluginDir));
    const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      err(`${entry.source}/.claude-plugin/plugin.json is missing`);
      continue;
    }
    const manifest = readJsonSafe(manifestPath);
    if (!manifest) continue;
    if (manifest.name !== entry.name) {
      err(`marketplace.json › ${entry.name}: entry name differs from plugin.json name "${manifest.name}"`);
      continue;
    }
    if (typeof manifest.version !== "string") {
      err(`${rel(manifestPath)}: "version" is required`);
      continue;
    }
    const pluginName = entry.name;

    // -- artifacts ----------------------------------------------------------
    const artifacts = [];
    const add = (type, name, fields) => {
      if (!SAFE_NAME.test(name)) {
        err(`${fields.path}: ${type} name "${name}" is not URL-safe (letters, digits, "." "_" "-")`);
        return;
      }
      const id = `${pluginName}/${type}/${name}`;
      if (seenIds.has(id)) {
        err(`${fields.path}: duplicate artifact id ${id}`);
        return;
      }
      seenIds.add(id);
      const { invocation, argumentHint, model, tools, frontmatter, ...rest } = fields;
      const artifact = {
        id,
        type,
        plugin: pluginName,
        name,
        displayName: name,
        description: rest.description,
        ...(invocation ? { invocation } : {}),
        ...(argumentHint ? { argumentHint } : {}),
        ...(model ? { model } : {}),
        ...(tools?.length ? { tools } : {}),
        frontmatter,
        body: rest.body,
        // Sanitized at build time; the browser bundle has no markdown parser.
        bodyHtml:
          type === "hook" || type === "mcp"
            ? renderJsonBlock(rest.body)
            : renderMarkdown(rest.body, { repoBlobUrl: blobBase, dir: posix.dirname(rest.path) }),
        path: rest.path,
        sourceUrl: blob(rest.path),
        capabilities: [], // security badges are milestone M2
      };
      artifacts.push(artifact);
    };

    const readMarkdown = (file, { frontmatterRequired }) => {
      const path = rel(file);
      const text = readFileSync(file, "utf8");
      const fm = parseFrontmatter(text);
      if (!fm && frontmatterRequired) {
        err(`${path}: missing or invalid frontmatter`);
        return null;
      }
      return {
        path,
        fields: fm?.fields ?? {},
        lists: fm?.lists ?? {},
        body: (fm ? fm.body : text.replace(/\r\n/g, "\n")).replace(/^\n+/, ""),
      };
    };
    const common = (md) => ({
      argumentHint: md.fields["argument-hint"],
      model: md.fields.model,
      tools: md.lists.tools ?? md.lists["allowed-tools"],
      frontmatter: md.fields,
      body: md.body,
      path: md.path,
    });

    for (const dir of listDirs(join(pluginDir, "skills")).sort()) {
      const file = join(pluginDir, "skills", dir, "SKILL.md");
      if (!existsSync(file)) {
        err(`${rel(file)}: missing`);
        continue;
      }
      const md = readMarkdown(file, { frontmatterRequired: true });
      if (!md) continue;
      const description = md.fields.description ?? md.fields.when_to_use;
      if (!description) {
        err(`${md.path}: frontmatter needs a description`);
        continue;
      }
      const name = md.fields.name || dir;
      add("skill", name, { ...common(md), description, invocation: `/${pluginName}:${name}` });
    }

    const mdFiles = (sub) => {
      const dir = join(pluginDir, sub);
      return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
    };

    for (const file of mdFiles("agents")) {
      const md = readMarkdown(join(pluginDir, "agents", file), { frontmatterRequired: true });
      if (!md) continue;
      if (!md.fields.name) {
        err(`${md.path}: frontmatter needs a name`);
        continue;
      }
      const description = md.fields.description ?? md.fields.when_to_use;
      if (!description) {
        err(`${md.path}: frontmatter needs a description`);
        continue;
      }
      add("agent", md.fields.name, { ...common(md), description, invocation: `@${pluginName}:${md.fields.name}` });
    }

    for (const file of mdFiles("commands")) {
      const md = readMarkdown(join(pluginDir, "commands", file), { frontmatterRequired: false });
      const name = file.replace(/\.md$/, "");
      const description = md.fields.description ?? md.fields.when_to_use ?? firstLine(md.body);
      if (!description) {
        err(`${md.path}: command needs a description (frontmatter or a first line)`);
        continue;
      }
      add("command", name, { ...common(md), description, invocation: `/${pluginName}:${name}` });
    }

    const hooksFile = join(pluginDir, "hooks", "hooks.json");
    if (existsSync(hooksFile)) {
      const data = readJsonSafe(hooksFile);
      const events = data?.hooks ?? data ?? {};
      for (const [event, entries] of Object.entries(events)) {
        if (typeof entries !== "object" || entries === null) continue;
        add("hook", event, {
          description: hookDescription(event, entries),
          frontmatter: {},
          body: JSON.stringify({ [event]: entries }, null, 2),
          path: rel(hooksFile),
        });
      }
    }

    const mcpFile = join(pluginDir, ".mcp.json");
    if (existsSync(mcpFile)) {
      const data = readJsonSafe(mcpFile);
      const servers = data?.mcpServers ?? data ?? {};
      for (const [key, server] of Object.entries(servers)) {
        if (typeof server !== "object" || server === null) continue;
        add("mcp", key, {
          description: mcpDescription(server),
          frontmatter: {},
          body: JSON.stringify({ [key]: server }, null, 2),
          path: rel(mcpFile),
        });
      }
    }

    // -- changelog ----------------------------------------------------------
    let releases = [];
    const changelogFile = join(pluginDir, "CHANGELOG.md");
    if (existsSync(changelogFile)) {
      const parsed = parseChangelog(readFileSync(changelogFile, "utf8"));
      releases = parsed.releases.map((r) => withHtml(r, { repoBlobUrl: blobBase, dir: pluginPath }));
      if (!parsed.recognized)
        warn(`${rel(changelogFile)}: no releases recognized (expected "## [x.y.z] - YYYY-MM-DD"); the changelog is not shown`);
      else if (releases.length && releases[0].version !== manifest.version)
        warn(`${rel(changelogFile)}: latest release ${releases[0].version} differs from plugin.json version ${manifest.version}`);
    } else {
      warn(`${pluginPath}/CHANGELOG.md is missing`);
    }

    // -- plugin -------------------------------------------------------------
    const readmeFile = join(pluginDir, "README.md");
    const readme = existsSync(readmeFile) ? readFileSync(readmeFile, "utf8").replace(/\r\n/g, "\n") : undefined;
    const tags = [...new Set([...(entry.tags ?? []), ...(manifest.keywords ?? [])])];
    const dependencies = (manifest.dependencies ?? []).map(normalizeDependency).filter(Boolean);
    const author = asAuthor(manifest.author) ?? asAuthor(entry.author);
    const displayName = manifest.displayName ?? entry.displayName;
    const category = entry.category ?? manifest.category;

    catalog.plugins.push({
      name: pluginName,
      ...(displayName ? { displayName } : {}),
      version: manifest.version,
      description: manifest.description ?? entry.description ?? "",
      ...(category ? { category } : {}),
      tags,
      ...(author ? { author } : {}),
      path: pluginPath,
      sourceUrl: tree(pluginPath),
      ...(readme === undefined
        ? {}
        : { readme, readmeHtml: renderMarkdown(readme, { repoBlobUrl: blobBase, dir: pluginPath }) }),
      compatibility: `Claude Code ≥ ${config.minClaudeCodeVersion}`,
      ...(dependencies.length ? { dependencies } : {}),
      installCommand: `claude plugin install ${pluginName}@${marketplaceName}`,
      artifactIds: artifacts.map((a) => a.id),
      capabilities: [], // security badges are milestone M2
      releases,
      ...(releases.length ? { updatedAt: releases[0].date } : {}),
    });
    catalog.artifacts.push(...artifacts);
  }

  // -- stats ----------------------------------------------------------------
  const stats = catalog.stats;
  stats.plugins = catalog.plugins.length;
  for (const a of catalog.artifacts) stats.byType[a.type]++;
  for (const p of catalog.plugins) if (p.category) stats.byCategory[p.category] = (stats.byCategory[p.category] ?? 0) + 1;
  const dates = catalog.plugins.flatMap((p) => p.releases.map((r) => r.date)).sort();
  if (dates.length) stats.lastRelease = dates[dates.length - 1];

  return { catalog, errors, warnings };
}

// ---------------------------------------------------------------------------
// Consistency with the README / site.config.json (spec §7.7)
// ---------------------------------------------------------------------------

export function checkOnboarding({ readme, catalog, config }) {
  const problems = [];
  const hint = "update README.md or site/site.config.json so they agree";
  const name = catalog.marketplace.name;

  if (name !== config.marketplaceName)
    problems.push(`marketplace.json name "${name}" differs from site.config.json marketplaceName "${config.marketplaceName}"; ${hint}`);

  if (readme === null) return [...problems, "README.md is missing"];

  const lines = readme.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  const expect = [
    `claude plugin marketplace add ${config.repo}`,
    `claude plugin marketplace update ${config.marketplaceName}`,
  ];
  for (const command of expect)
    if (!lines.includes(command))
      problems.push(`README.md has no line "${command}" (shown on /getting-started/); ${hint}`);

  const version = readme.match(/Requires Claude Code\s+\**(\d+\.\d+\.\d+)\**/i)?.[1];
  if (!version) problems.push(`README.md has no "Requires Claude Code <version>" line; ${hint}`);
  else if (version !== config.minClaudeCodeVersion)
    problems.push(
      `README.md says Claude Code ${version} but site.config.json minClaudeCodeVersion is ${config.minClaudeCodeVersion}; ${hint}`,
    );
  return problems;
}
