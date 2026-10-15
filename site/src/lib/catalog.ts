// Types of public/catalog.json (schema: schema/catalog.schema.json, spec section 4) and helpers
// that derive the views the pages need. Pure functions, no I/O: the catalog is passed in.

export type ArtifactType = "skill" | "agent" | "command" | "hook" | "mcp";
export type EntryKind = "plugin" | ArtifactType;

export interface Person {
  name: string;
  url?: string;
}
export interface Release {
  version: string;
  date: string;
  sections: Record<string, string[]>;
  /** Items of `sections` as sanitized inline HTML, same keys. */
  sectionsHtml: Record<string, string[]>;
  summary: string;
  /** `summary` as HTML (escaped text with code spans). */
  summaryHtml: string;
}
export interface Plugin {
  name: string;
  displayName?: string;
  version: string;
  description: string;
  category?: string;
  tags: string[];
  author?: Person;
  path: string;
  sourceUrl: string;
  readme?: string;
  /** Sanitized HTML of `readme`, rendered at build time. */
  readmeHtml?: string;
  compatibility?: string;
  dependencies?: string[];
  installCommand: string;
  artifactIds: string[];
  capabilities: string[];
  releases: Release[];
  updatedAt?: string;
}
export interface Artifact {
  id: string;
  type: ArtifactType;
  plugin: string;
  name: string;
  displayName: string;
  description: string;
  invocation?: string;
  argumentHint?: string;
  model?: string;
  tools?: string[];
  frontmatter: Record<string, string>;
  body: string;
  /** Sanitized HTML of `body` (highlighted JSON for hooks and MCP servers), rendered at build time. */
  bodyHtml: string;
  path: string;
  sourceUrl: string;
  capabilities: string[];
}
export interface Catalog {
  schemaVersion: 1;
  generatedAt: string;
  commit: string;
  marketplace: { name: string; description: string; repo: string; owner: Person };
  stats: {
    plugins: number;
    byType: Record<ArtifactType, number>;
    byCategory: Record<string, number>;
    lastRelease?: string;
  };
  plugins: Plugin[];
  artifacts: Artifact[];
}

export const KINDS: readonly EntryKind[] = ["plugin", "skill", "agent", "command", "hook", "mcp"];
export const ARTIFACT_TYPES: readonly ArtifactType[] = ["skill", "agent", "command", "hook", "mcp"];

export const isArtifactType = (value: string): value is ArtifactType => (ARTIFACT_TYPES as readonly string[]).includes(value);

// One card / search document: a plugin or one of its artifacts.
export interface Entry {
  id: string;
  kind: EntryKind;
  name: string;
  displayName: string;
  description: string;
  plugin: string;
  pluginDisplayName: string;
  version: string;
  tags: string[];
  author: string;
  category?: string;
  updated?: string;
  invocation?: string;
  installCommand: string;
  /** Router path, e.g. `/plugins/dev-workflow/skill/commit-message`. */
  to: string;
  /** Text that is searched but not shown: the markdown of the README / the artifact. */
  body: string;
}

export const pluginPath = (plugin: string) => `/plugins/${plugin}`;
export const artifactPath = (a: Pick<Artifact, "plugin" | "type" | "name">) => `/plugins/${a.plugin}/${a.type}/${a.name}`;
export const pluginTitle = (p: Pick<Plugin, "name" | "displayName">) => p.displayName ?? p.name;
export const repoUrl = (catalog: Catalog) => `https://github.com/${catalog.marketplace.repo}`;

export const findPlugin = (catalog: Catalog, name: string): Plugin | undefined => catalog.plugins.find((p) => p.name === name);

export const findArtifact = (catalog: Catalog, plugin: string, type: string, name: string): Artifact | undefined =>
  catalog.artifacts.find((a) => a.plugin === plugin && a.type === type && a.name === name);

export const pluginArtifacts = (catalog: Catalog, plugin: Plugin): Artifact[] =>
  plugin.artifactIds.map((id) => catalog.artifacts.find((a) => a.id === id)).filter((a): a is Artifact => Boolean(a));

// Each plugin followed by its artifacts, in catalog order.
export const getEntries = (catalog: Catalog): Entry[] => {
  const entries: Entry[] = [];
  for (const p of catalog.plugins) {
    const author = p.author?.name ?? "";
    const shared = {
      plugin: p.name,
      pluginDisplayName: pluginTitle(p),
      version: p.version,
      tags: p.tags,
      author,
      category: p.category,
      updated: p.updatedAt,
      installCommand: p.installCommand,
    };
    entries.push({
      ...shared,
      id: `plugin/${p.name}`,
      kind: "plugin",
      name: p.name,
      displayName: pluginTitle(p),
      description: p.description,
      to: pluginPath(p.name),
      body: p.readme ?? "",
    });
    for (const a of pluginArtifacts(catalog, p)) {
      entries.push({
        ...shared,
        id: a.id,
        kind: a.type,
        name: a.name,
        displayName: a.displayName,
        description: a.description,
        invocation: a.invocation,
        to: artifactPath(a),
        body: a.body,
      });
    }
  }
  return entries;
};

export interface ReleaseEntry extends Release {
  plugin: Plugin;
  /** The plugin's first release. */
  isNew: boolean;
}

// All releases of all plugins, newest first.
export const getReleases = (catalog: Catalog): ReleaseEntry[] => {
  const out: ReleaseEntry[] = [];
  for (const plugin of catalog.plugins)
    plugin.releases.forEach((r, i) => out.push({ ...r, plugin, isNew: i === plugin.releases.length - 1 }));
  return out.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.plugin.name.localeCompare(b.plugin.name) ||
      b.version.localeCompare(a.version, undefined, { numeric: true }),
  );
};

// Hero chips: the most frequent tags (one count per plugin, not per artifact).
export const topTags = (catalog: Catalog, limit = 7): string[] => {
  const counts = new Map<string, number>();
  for (const p of catalog.plugins) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
};

export const countOfKind = (catalog: Catalog, kind: EntryKind): number =>
  kind === "plugin" ? catalog.stats.plugins : catalog.stats.byType[kind];
