# Specification: marketplace UI catalog on GitHub Pages

| | |
|---|---|
| Status | Draft |
| Author | Dmytro Shevchenko |
| Date | 2026-10-15 |
| Site | `https://dmitrii1600.github.io/dev-team-ai-engineering-marketplace/` |
| Design | The mockup is kept in [`docs/design/catalog-prototype/`](../design/catalog-prototype/index.html) (design source: `docs/design/catalog-prototype/index.html`), see [§6](#6-ui-and-design). The site itself lives in [`site/`](../../site/README.md) |

## 1. Goals and non-goals

### Problem

Today the marketplace catalog exists in only two places: `.claude-plugin/marketplace.json` and a hand-maintained table in `README.md`. To find a particular skill or agent, you need to know its name or read the repository. It is also not visible from there what a component does, which tools it uses, or what changed in the latest version.

### Goal

Build a static GitHub Pages site that:

1. searches all marketplace artifacts (plugins, skills, agents, commands, hooks, MCP servers) and shows results as cards;
2. lets users connect the marketplace and its plugins in about 30 seconds;
3. shows what an artifact does and what access it has, before installation;
4. shows what is new in the marketplace without watching git.

### Constraints

- **No backend.** All data is prepared at build time in GitHub Actions. The browser receives only static files.
- The repository is public, so the full content of artifacts can be published.
- **The UI is in English**, and so are the expected search queries, because artifact metadata and texts are in English. There is no content translation.

### Non-goals

- Any server-side code, authorization, accounts.
- Analytics, install counters, ratings, comments (giscus).
- Semantic / vector search and search in Ukrainian.
- A plugin generator in the browser.
- The `catalog-finder` meta-skill for searching from Claude Code.
- Editing marketplace content through the site.

Items deferred to the future are listed in [§13](#13-future-out-of-scope).

## 2. Users and scenarios

| # | Who | Scenario | Result |
|---|---|---|---|
| S1 | Developer | Types `commit message` in the search | Sees the `commit-message` card, copies the install command |
| S2 | New team member | Opens "Getting started" | Copies 2 commands and has the marketplace connected within 30 s |
| S3 | Team lead | Picks 3 plugins for a project | Gets a ready-made `.claude/settings.json` and commits it |
| S4 | Cautious user | Opens an agent before installing | Sees the "read-only" / "runs shell" badges, the `tools` list and the full prompt text |
| S5 | Anyone | Visits once a week | Sees releases for the period in "What's new" or subscribes to the Atom feed |
| S6 | Developer | Doesn't know where to start | Opens the "Code review workflow" recipe with a curated set of artifacts |
| S7 | Developer | Hesitates between two agents | Compares them side by side: tools, model, badges |
| S8 | Anyone | Didn't find what they needed | Clicks "Request a skill" and lands on a pre-filled GitHub Issue |

## 3. Architecture

Core principle: **the "backend" is build time.** The site is a client-side single-page app (SPA); the only data it needs is one static file, `catalog.json`, which it fetches when it starts.

```
push to main (or a pull request that touches the site or the catalog sources)
   │
   ▼
GitHub Actions: site.yml
   ├─ build job: npm ci → lint → typecheck → test → check → build
   │     site/scripts/build-catalog.mjs
   │       reads marketplace.json, plugin.json, SKILL.md, agents/*.md,
   │       commands/*.md, hooks/hooks.json, .mcp.json, README.md, CHANGELOG.md
   │       → site/public/catalog.json, feed.xml, catalog.schema.json
   │         (JSON Schema validation; markdown rendered to sanitized HTML)
   │     vite build
   │       → site/dist: index.html (+ a copy as 404.html), JS / CSS / fonts, and everything from public/
   │     (on main only) actions/upload-pages-artifact
   └─ deploy job (on main only): actions/deploy-pages
```

### Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Vite + React 19 + TypeScript + React Router** (client-side SPA; exact versions pinned in `site/package.json`) | One small static bundle, no server rendering, no framework to upgrade in lockstep. The catalog is a single JSON file that the app fetches. Permalinks work through the `404.html` fallback (§6.2). |
| Search | **MiniSearch** in the browser | The catalog is small. Supports fuzzy, prefix and field weights. The index is built from `catalog.json` on first use (§5). |
| Markdown | remark / unified + **rehype-sanitize**, **at build time** | Artifact content arrives via PRs, so HTML in markdown is sanitized. The result is stored in `catalog.json` (`readmeHtml`, `bodyHtml`, ...), so the browser bundle has no markdown parser. |
| UI copy | One file, `site/src/i18n/en.json`, and a typed `t(key, params)` helper with interpolation and singular / plural | Copy lives in one place. `t()` is typed from the JSON, ESLint (`react/jsx-no-literals`) forbids string literals in JSX, and a test checks the keys. |
| Styles | CSS custom properties from the mockup (§6.1), no CSS framework | The mockup already defines tokens for two themes and the type colors. |
| Fonts | IBM Plex Sans / IBM Plex Mono, **self-hosted** (`@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`) | The mockup loads Google Fonts, but §10 forbids third-party requests. |
| Tests | `node:test` for the catalog scripts; **Vitest + React Testing Library** for the UI | The data pipeline and the UI are tested separately; `npm test` runs both. |

### Code layout

**Current state.** The `site/` directory is separate from the marketplace (Claude Code reads only `.claude-plugin/` and `plugins/`). Stage 0 published the imported mockup as is; M1 replaced the contents of `site/` with the structure below. The mockup itself (`index.html`, formerly `Catalog.dc.html`, plus its `support.js` runtime; UI copy and mock data translated to English) is kept as the design reference in `docs/design/catalog-prototype/`; it is not published and not part of the site build.

Structure after M1:

```
site/
  package.json, package-lock.json   exact versions
  index.html                        the SPA shell
  vite.config.ts, vite/plugins.ts   base path, dev-time catalog rebuild, CSP meta, 404.html copy
  eslint.config.js, tsconfig.json
  site.config.json                  repo, marketplaceName, minClaudeCodeVersion, siteUrl, basePath
  scripts/build-catalog.mjs         + scripts/lib/{catalog,markdown,feed}.mjs
  schema/catalog.schema.json
  content/recipes.yaml              (M3)
  public/                           favicon.svg, theme-init.js; generated and git-ignored:
                                    catalog.json, feed.xml, catalog.schema.json
  src/
    main.tsx, App.tsx               entry point and routes
    pages/                          Home, Search, Plugin, Artifact, GettingStarted, WhatsNew, NotFound
    components/, context/, lib/     header, palette, cards, toast; catalog loading; search and URL state
    i18n/en.json, i18n/index.ts     all UI copy and the typed t() helper
    styles/                         tokens.css, global.css
  tests/*.test.mjs                  node:test (catalog scripts)
  tests/ui/, tests/fixtures/        Vitest + React Testing Library, fixture catalogs (only place for fixtures)
.github/scripts/lib/frontmatter.mjs shared parser (see below)
.github/workflows/site.yml          "Site": build and deploy (see §9)
```

The site has its own `package.json` in `site/` and does not touch the plugins. The `site/` directory does not end up in the plugin cache, because only `plugins/<name>/` is installed.

The app contains **no mock data**: every plugin, artifact, release and number comes from `catalog.json`. Test fixtures live only under `site/tests/`.

### Reusing existing code

The `readFrontmatter` function from `.github/scripts/check-marketplace.mjs` is extracted into `.github/scripts/lib/frontmatter.mjs`. Both the validator and `build-catalog.mjs` import it. The module is extended to:
- return `body` (the text after the frontmatter);
- parse comma-separated lists (`tools`, `allowed-tools`) into an array.

The plugin traversal (`marketplace.plugins` → `source` → `plugin.json` → `skills/`, `agents/`) repeats the logic of `check-marketplace.mjs`. Shared helpers (`readJson`, `listDirs`) are also moved into `lib/`.

## 4. `catalog.json` data model

The file is generated by `build-catalog.mjs` into `site/public/catalog.json` (git-ignored) and published as `/catalog.json`. It is validated against `site/schema/catalog.schema.json` (JSON Schema 2020-12). If the file fails the schema, the build fails and nothing is written, so a failed rebuild in the dev server keeps the last good file.

Every markdown field is accompanied by a pre-rendered, sanitized HTML twin (`readmeHtml`, `bodyHtml`, `sectionsHtml`, `summaryHtml`). The raw markdown stays in the file because it is what search indexes.

### Structure

```ts
interface Catalog {
  schemaVersion: 1;
  generatedAt: string;          // ISO 8601, build time
  commit: string;               // GITHUB_SHA
  marketplace: {
    name: string;               // "dev-team-ai-engineering-marketplace"
    description: string;
    repo: string;               // "dmitrii1600/dev-team-ai-engineering-marketplace"
    owner: { name: string; url?: string };
  };
  stats: Stats;                 // see §7.6
  plugins: Plugin[];
  artifacts: Artifact[];
}

interface Plugin {
  name: string;                 // install id, kebab-case
  displayName?: string;
  version: string;              // SemVer from plugin.json
  description: string;
  category?: string;            // from the marketplace entry
  tags: string[];               // marketplace tags ∪ plugin.json keywords
  author?: { name: string; url?: string };
  path: string;                 // "plugins/dev-workflow"
  sourceUrl: string;            // link to GitHub tree/main/...
  readme?: string;              // markdown from plugins/<name>/README.md (the README section in the mockup)
  readmeHtml?: string;          // the same, rendered to sanitized HTML at build time (present exactly when readme is)
  compatibility?: string;       // the "✓ Claude Code ≥ …" badge in the mockup; see the note below
  dependencies?: string[];      // the "Dependencies" section in the mockup; see the note below
  installCommand: string;       // "claude plugin install dev-workflow@<marketplace>"
  artifactIds: string[];
  capabilities: Capability[];   // union of the capabilities of the artifacts + the plugin
  releases: Release[];          // from CHANGELOG.md, newest first
  updatedAt?: string;           // date of the latest Release
}

type ArtifactType = "skill" | "agent" | "command" | "hook" | "mcp";

interface Artifact {
  id: string;                   // "<plugin>/<type>/<name>", e.g. "dev-workflow/skill/commit-message"
  type: ArtifactType;
  plugin: string;
  name: string;                 // skill: directory name if the frontmatter has no name
  displayName: string;          // card title; for now = name (there is no separate frontmatter field)
  description: string;
  invocation?: string;          // "/dev-workflow:commit-message", "@dev-workflow:code-reviewer"
  argumentHint?: string;
  model?: string;
  tools?: string[];             // agent `tools` or skill `allowed-tools`
  frontmatter: Record<string, string>;  // all fields as is
  body: string;                 // markdown without frontmatter (for hooks/mcp — a JSON fragment)
  bodyHtml: string;             // rendered at build time: sanitized HTML, or highlighted JSON for hooks/mcp
  path: string;                 // file path in the repo
  sourceUrl: string;            // blob/main/...
  capabilities: Capability[];   // see §7.2
}

interface Release {
  version: string;
  date: string;                 // YYYY-MM-DD
  sections: Record<string, string[]>;  // "Added" | "Changed" | "Fixed" | ... → items
  sectionsHtml: Record<string, string[]>; // same keys; every item as sanitized inline HTML
  summary: string;              // one line for cards and feeds (§7.3)
  summaryHtml: string;          // summary as HTML (escaped text with code spans only: it sits inside links)
}

type Capability =
  | "read-only" | "runs-shell" | "writes-files" | "full-access"
  | "hooks" | "mcp-remote" | "mcp-local" | "needs-secrets";
```

### Extraction rules

| Artifact | Source | name | invocation |
|---|---|---|---|
| skill | `skills/<dir>/SKILL.md` | `frontmatter.name` or `<dir>` | `/<plugin>:<name>` |
| agent | `agents/*.md` | `frontmatter.name` | `@<plugin>:<name>` |
| command | `commands/*.md` | file name without `.md` | `/<plugin>:<name>` |
| hook | `hooks/hooks.json` | one card per event (`PreToolUse`, …) | — |
| mcp | `.mcp.json` | key in `mcpServers` | — |

If the `description` field is missing, `when_to_use` is used. For hook and mcp, the description is the event or matcher, or the server URL/command.

`compatibility` and `dependencies` exist in the mockup, but the current manifests have no such data:
- `compatibility` defaults to `Claude Code ≥ <minClaudeCodeVersion>` from `site.config.json` for all plugins;
- `dependencies` is filled only if the plugin manifest declares dependencies (verify the exact field name against `claude-code-plugin-manifest.json` during implementation). Otherwise the "Dependencies" section is not rendered.

### Example on the current repository (abridged)

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-15T12:00:00Z",
  "commit": "abc1234",
  "marketplace": {
    "name": "dev-team-ai-engineering-marketplace",
    "description": "Claude Code plugins for the dev team: shared skills, agents and workflows for AI-assisted engineering.",
    "repo": "dmitrii1600/dev-team-ai-engineering-marketplace",
    "owner": { "name": "Dmytro Shevchenko", "url": "https://github.com/dmitrii1600" }
  },
  "stats": {
    "plugins": 1,
    "byType": { "skill": 1, "agent": 1, "command": 0, "hook": 0, "mcp": 0 },
    "byCategory": { "development": 1 },
    "lastRelease": "2026-10-15"
  },
  "plugins": [{
    "name": "dev-workflow",
    "displayName": "Dev Workflow",
    "version": "0.1.0",
    "description": "Team development workflow: Conventional Commits messages and a read-only code reviewer agent.",
    "category": "development",
    "tags": ["git", "commits", "code-review"],
    "path": "plugins/dev-workflow",
    "installCommand": "claude plugin install dev-workflow@dev-team-ai-engineering-marketplace",
    "artifactIds": ["dev-workflow/skill/commit-message", "dev-workflow/agent/code-reviewer"],
    "capabilities": ["runs-shell", "read-only"],
    "releases": [{
      "version": "0.1.0",
      "date": "2026-10-15",
      "sections": { "Added": [
        "Skill `commit-message`: commit messages in the Conventional Commits format.",
        "Agent `code-reviewer`: read-only review of changes."
      ]}
    }],
    "updatedAt": "2026-10-15"
  }],
  "artifacts": [
    {
      "id": "dev-workflow/skill/commit-message",
      "type": "skill",
      "plugin": "dev-workflow",
      "name": "commit-message",
      "description": "Writes a Conventional Commits message for the currently staged changes. Use when ...",
      "invocation": "/dev-workflow:commit-message",
      "argumentHint": "[optional scope or extra context]",
      "tools": ["Bash(git diff *)", "Bash(git status *)", "Bash(git log *)"],
      "path": "plugins/dev-workflow/skills/commit-message/SKILL.md",
      "capabilities": ["runs-shell"]
    },
    {
      "id": "dev-workflow/agent/code-reviewer",
      "type": "agent",
      "plugin": "dev-workflow",
      "name": "code-reviewer",
      "description": "Reviews a diff or a set of files for correctness bugs, security issues and maintainability problems. ...",
      "invocation": "@dev-workflow:code-reviewer",
      "model": "inherit",
      "tools": ["Read", "Grep", "Glob", "Bash(git diff *)", "Bash(git log *)", "Bash(git show *)"],
      "path": "plugins/dev-workflow/agents/code-reviewer.md",
      "capabilities": ["read-only"]
    }
  ]
}
```

## 5. Search

### Index

- **The MiniSearch index is built in the browser from `catalog.json`**, the first time search is used (the search page or the ⌘K palette), and cached for the session. There is no separate `search-index.json`. Reasons: `catalog.json` already carries every searchable field (including `body`), so a prebuilt index would duplicate that text, add a second request, and could drift from the options used to read it. Indexing a few hundred documents takes milliseconds. The search code is a separate lazy chunk, so the home page does not load it.
- An index document is an artifact, plus a separate document for each plugin (`type: "plugin"`), so that plugins are found too.

| Field | Weight (boost) |
|---|---|
| `name`, `displayName` | 3 |
| `tags` (of the owning plugin) | 2 |
| `description` | 1.5 |
| `plugin` | 1 |
| `body` | 0.5 |

Parameters: `prefix: true`, `fuzzy: 0.2`, `combineWith: "AND"`. If there are 0 results, we automatically retry with `"OR"` and show the note "Showing partial matches". Tokenization is the default. Hyphens and `:` separate words, so `commit-message` is found by both `commit` and `message`.

### Filters (facets)

The sidebar of the search screen, as in the mockup, with a "Reset" button:
- **Type**: plugins / skills / agents / commands / hooks / MCP. Multi-select, colored type dot, counter.
- **Keywords**: chips for all tags (marketplace tags ∪ `keywords` from plugin.json). Multi-select, OR logic.
- **Author**: single select by `author.name`.
- **Capability** (M2): for example, "read-only only".

The "Plugin" and "Category" filters are available via URL (`plugin=`, `category=`) but have no block of their own in the panel. The counters next to filter values are computed from the current results.

### Sorting

The "Sort" select: **Relevance** (default), **Name**, **Recently updated** (the plugin's `updatedAt`).

### State and UX

- Search lives on a separate `/search` route. Typing in the home page hero field or in the header field navigates to `/search?q=…`.
- State lives in the URL: `/search?q=review&type=agent&kw=git&author=…&sort=updated`. Links can be copied, and the back and forward buttons work.
- Search runs while typing, with a 100 ms debounce. The `/` key focuses the header field.
- **An empty query** with filters shows the heading "Browse the catalog" and all artifacts that pass the filters.
- **Nothing found**: the state from the mockup ("🔍 Nothing found", a "Reset filters" button) plus a "Request a skill" link (§8).
- **Command palette** `⌘K` / `Ctrl+K`, with a button in the header. Quick jump to an artifact or plugin: up to 8 results (with no query, the first 8), arrow-key navigation, `Enter` opens, `Esc` closes. It works on the same index without filters.

## 6. UI and design

**Design source** is `docs/design/catalog-prototype/index.html`, an interactive prototype built on the `docs/design/catalog-prototype/support.js` runtime, with inline styles and mock data. How it is used:
- **Mandatory** for the implementation: the visual language, tokens, components and screen structure. UI copy is English (translated from the mockup).
- **Not carried over**: the mocks (plugins `react-tools`, `security-scan`, etc., the repo `burnjohn/dev-digest-ai-marketplace`, the `dev-digest` badge). They are replaced with real data from `catalog.json` (§4). The `support.js` runtime and the inline styles are not carried over either: the implementation uses React components with CSS classes built on the §6.1 tokens.

The mockup covers M1 and What's new. The M2/M3 screens that it lacks (Team setup, Recipes, Compare, Favorites, security badges) are built from the same tokens and components (§6.3).

### 6.1 Design tokens

The default theme is **dark**. A ☾/☀ toggle in the header; the choice is stored in localStorage. If there is no stored choice, the theme follows `prefers-color-scheme`.

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0b0c0f` | `#f6f7f9` |
| `--bg-elev` | `#101217` | `#ffffff` |
| `--bg-elev2` | `#161920` | `#ffffff` |
| `--bg-hover` | `#1c2029` | `#eef0f4` |
| `--border` | `#23262f` | `#e2e5ea` |
| `--border-strong` | `#33384380` | `#c9cdd6` |
| `--text` | `#e8eaef` | `#161a20` |
| `--text-dim` | `#98a0ae` | `#5a626e` |
| `--text-faint` | `#5f6672` | `#8b93a0` |
| `--accent` | `oklch(0.68 0.15 255)` | `oklch(0.55 0.17 255)` |
| `--accent-fg` | `#fff` | `#fff` |

Artifact type colors (badges, dots in filters and the palette):

| Token | Dark | Light |
|---|---|---|
| `--kind-plugin` | `oklch(0.72 0.15 255)` | `oklch(0.52 0.16 255)` |
| `--kind-skill` | `oklch(0.74 0.14 158)` | `oklch(0.5 0.14 158)` |
| `--kind-agent` | `oklch(0.72 0.15 305)` | `oklch(0.52 0.16 305)` |
| `--kind-command` | `oklch(0.76 0.14 55)` | `oklch(0.55 0.15 55)` |
| `--kind-hook` | `oklch(0.78 0.14 115)` | `oklch(0.52 0.14 132)` |
| `--kind-mcp` | `oklch(0.7 0.16 20)` | `oklch(0.53 0.18 20)` |

- **Accent** is blue (`blue`). The `green` / `violet` / `amber` variants from the mockup are settings of the mockup editor and are not carried into the product.
- **Typography**: IBM Plex Sans 400–700 for text, IBM Plex Mono 400–600 for versions, counters, commands, tags. Base size 14 px, line-height 1.5. Headings use negative letter-spacing (−0.01…−0.025em).
- **Radii**: 7–9 px for buttons and inputs, 10–13 px for cards and panels, 20 px for chips.
- **Type badge**: mono 11 px, color `--kind-*`, background `color-mix(in oklab, var(--kind-*) 15%, transparent)`.
- **Terminal block** (install commands): background `#000` in both themes, mono 13 px, text color `#cfe`, `$` prefix.
- **Animations**: `pop` (0.14–0.16 s) for the palette and the toast, `fade` for the overlay. Disabled under `prefers-reduced-motion`.
- Colors using `oklch()` and `color-mix()` require modern browsers, which matches §10.

### 6.2 Routes and screens

| Path (React Router) | Mockup screen | Stage |
|---|---|---|
| `/` | HOME | M1 |
| `/search` | SEARCH | M1 |
| `/plugins/:plugin` | PLUGIN DETAIL | M1 |
| `/plugins/:plugin/:type/:name` | ARTIFACT DETAIL | M1 |
| `/getting-started` | GETTING STARTED | M1 |
| `/whats-new` | WHAT'S NEW | M1 (the "What's new" block on the home page requires CHANGELOG parsing already in M1) |
| any other path | NOT FOUND (also shown for an unknown plugin or artifact) | M1 |
| `/team-setup` | — (per the design system) | M2 |
| `/recipes`, `/recipes/:slug` | — | M3 |
| `/compare?ids=a,b,c`, `/favorites` | — | M3 |
| `/catalog.json`, `/catalog.schema.json`, `/feed.xml` | machine-readable static files, not routes | M1 |
| `/404.html` | a copy of `index.html`, see below | M1 |

**Base path and deep links.** The site is a GitHub Pages project site, so everything lives under `/dev-team-ai-engineering-marketplace/`: Vite's `base` is set from `site.config.json` (`basePath`), and `BrowserRouter` gets it as `basename` (`import.meta.env.BASE_URL`). Routes are written without a trailing slash; a trailing slash in a typed URL also works. GitHub Pages has no rewrite rules, so `/plugins/dev-workflow/` would be a 404. The build therefore copies `dist/index.html` to `dist/404.html`: Pages serves it for any unknown path, the app boots and routes on the URL. The trade-off is that such deep links are answered with HTTP status 404 and have no content without JavaScript (§10). `vite preview` and `vite dev` have a built-in SPA fallback, so they need nothing extra.

**Header** (sticky, 58 px, semi-transparent background with `backdrop-filter: blur`):
- logo "◆" on an accent square, "Catalog", a mono badge with the marketplace name (`dev-team-ai-engineering-marketplace`, may be shortened);
- a search field "Search the catalog…" (max 520 px);
- buttons `⌘K` (palette) and ☾/☀ (theme), a "GitHub ↗" link.

We add navigation to Getting started, What's new, Team setup and Recipes to the header as compact links (the mockup does not have them). On mobile they collapse into a menu.

#### HOME (`/`)

1. **Hero**, centered, max 720 px:
   - mono-caps eyebrow "Marketplace of plugins · skills · agents";
   - H1 "Find the right artifact and install it with one copy-paste" (40 px);
   - a subtitle about client-side search with no backend;
   - a large search field (52 px). The placeholder is an example: `Describe what you need — e.g. "commit message"`;
   - **hashtag chips** `#tag`: the top 7 tags by frequency; a click opens `/search?kw=<tag>`.
2. **Onboarding banner** (§7.7), above Stats.
3. **Stats tiles** (§7.6): a grid of 5 tiles.
4. **"What's new"**: the 4 latest releases (§7.3) and a "Full feed →" link.
5. **"Browse by type"**: chip buttons with a colored dot, the type name and a counter; a click opens `/search?type=<type>`.
6. **Empty catalog** (`plugins.length === 0`): instead of blocks 3–5, show the "📦 The catalog is empty" state with "Get started" and "CONTRIBUTING.md" buttons.

#### SEARCH (`/search`)

- Two columns: a 230 px filter sidebar (sticky) and the results. Filters are in §5.
- Heading: "Results for “<q>”" or "Browse the catalog". Below it, a counter "N artifacts" with English plural rules (1 artifact, N artifacts).
- A "Sort" select on the right (§5).
- A card grid `repeat(auto-fill, minmax(320px, 1fr))`, gap 14 px.
- The "Nothing found" state (§5).

#### Card (search result)

Plugins and every artifact use the same card:
- **Top**: type badge on the left, mono version `v0.1.0` on the right. Then `displayName` (15 px, 600) and a description clamped to **2 lines**. Below it, up to 3 mono `#tag` tags.
- **Footer** with its own background and a top border: a meta line (`<plugin> · <author>`, for a plugin just `<author>`) and two buttons:
  - **"Copy install"**: after a click the label changes to "Copied ✓" for 2 s and a toast appears;
  - **"Open"**: the accent button.
- **M2**: a row of security badges (§7.2) under the tags, a "+ Team setup" button in the footer.
- **M3**: "★" (favorite) in the top row, a "Compare" checkbox.

#### PLUGIN DETAIL (`/plugins/<plugin>`)

- "← Back": returns to the previous search if there was one, otherwise to the home page.
- Header:
  - a 52 px icon;
  - `displayName` (26 px);
  - a version badge and a compatibility badge "✓ Claude Code ≥ 2.1.300" (§4);
  - the description;
  - a line "<author> · updated <date>".
- Install block: a terminal block with `installCommand`, the buttons "Copy install" (accent) and "View on GitHub ↗".
- **"Plugin contents"**: artifacts grouped by type (dot, group name in caps, counter). Each group has a grid of mini-cards `minmax(240px, 1fr)` with `displayName`, `invocation` in the accent color and a 1-line description.
- **"Dependencies"**: only if `dependencies` exist (§4).
- **"README"**: the rendered and sanitized `plugins/<name>/README.md`.
- **"Changelog"**: release cards with version, date and items.
- **M2**: aggregated security badges under the description, a "+ Team setup" button next to "Copy install".

#### ARTIFACT DETAIL (`/plugins/<plugin>/<type>/<name>`)

- Breadcrumbs: "Catalog / <plugin> / <name>".
- Type badge, `displayName` (24 px), `invocation` in an accent badge (if present), the description.
- **"Tools / permissions"**: chips for `tools` / `allowed-tools`. We also show `model` and `argument-hint`.
- A terminal block with the install command of the **owning plugin** and a "Copy install" button. If there is an `invocation`, a "Copy invocation" button next to it.
- **"Documentation"**: the rendered and sanitized markdown `body`. For hook and mcp, highlighted JSON.
- At the bottom: the full frontmatter (expandable, `<details>`), "View source on GitHub ↗", "Report an issue" (§8).
- **M2**: security badges under the description.

#### GETTING STARTED (`/getting-started`)

See §7.7. Visually: numbered steps with a round accent number, a heading, a description and a terminal block with a "Copy" button. At the bottom, an info panel "marketplace update vs plugin update".

#### WHAT'S NEW (`/whats-new`)

See §7.3. Visually: "← Home", the H1 "What's new" and a "Subscribe · RSS" button (leads to `feed.xml`). Entries are cards with the version and date in a 74 px left column and the plugin name and summary on the right.

#### Loading and error states

The app fetches `catalog.json` when it starts. While the request is running, the page area shows "Loading the catalog…" (the header and the palette are already usable). If it fails (network error, HTTP error, unsupported `schemaVersion`), the page area shows an error with a "Try again" button; the palette says "Search is unavailable right now."

#### Command palette (⌘K / Ctrl+K)

A 600 px modal with a blurred overlay and an input "Jump to an artifact…" with an `ESC` hint. Up to 8 results: type dot, `displayName`, "· <plugin>" (for a plugin, "· plugin"), type on the right. Empty state: "Nothing found". Behavior is described in §5.

#### Toast

Bottom center, "✓ Copied to clipboard", disappears after 1.8 s. Has `role="status"`.

### 6.3 New screens in the design system

The mockup does not contain Team setup, Recipes, Compare, Favorites or security badges. They are built from the same components: `--bg-elev` cards with `--border`, the terminal block for JSON and commands, chips, badges. For security badges we use semantic colors from the type palette:
- `--kind-skill` (green) — read-only;
- `--kind-command` (amber) — runs-shell, writes-files, full-access;
- `--kind-mcp` (red) — hooks, mcp-*, needs-secrets.

Before implementing M2/M3, it is advisable to draw these screens in the mockup.

### 6.4 General requirements

- **Responsive from 360 px.** The mockup is desktop-only, so we define the breakpoints ourselves:
  - ≤ 900 px: the SEARCH filter panel becomes a collapsible "Filters (N)" button above the results;
  - ≤ 720 px: the Stats tiles use 2–3 columns instead of 5; the header search field collapses into an icon that opens the palette; install blocks move their buttons below the terminal block;
  - ≤ 480 px: cards in a single column, hero H1 at 28 px.
- **WCAG 2.1 AA accessibility.** Check the contrast of `--text-faint` on `--bg` in both themes and raise the value if needed. Visible focus. The interactive `div`/`a` elements from the mockup (`onClick` without `href`) are implemented as real `<a href>` / `<button>`. `aria-live` for the results counter. The palette is a `role="dialog"` with a focus trap.
- **Copying** via `navigator.clipboard` with a fallback through a hidden `textarea` (as in the mockup).

## 7. User-facing features

### 7.1 `.claude/settings.json` builder (Team setup)

- The plugin cart is filled with the "Add to team setup" button on cards and pages, or directly on `/team-setup/` with checkboxes. It is stored in localStorage and mirrors its state in the URL (`/team-setup/?plugins=a,b`), so the selection can be shared.
- The page generates three blocks with copy and download buttons:
  1. **`.claude/settings.json`** in the format of the "For the whole team" section of the README:
     ```json
     {
       "extraKnownMarketplaces": {
         "dev-team-ai-engineering-marketplace": {
           "source": { "source": "github", "repo": "dmitrii1600/dev-team-ai-engineering-marketplace" }
         }
       },
       "enabledPlugins": {
         "dev-workflow@dev-team-ai-engineering-marketplace": true
       }
     }
     ```
  2. **A script for yourself**: `claude plugin marketplace add …` plus `claude plugin install …` for each selected plugin.
  3. **Opt-out hint**: an example `.claude/settings.local.json` with `false` to disable a plugin for yourself only.
- "Merge" mode. The user can paste their existing `settings.json`, and the builder adds the keys without touching the rest. If the pasted JSON is invalid, an error message appears and nothing changes.
- `enabledPlugins` keys are sorted by name, JSON is formatted with 2-space indentation.

### 7.2 Security badges (capabilities)

Computed at build time (§4). Rules:

| Capability | Badge | Rule |
|---|---|---|
| `read-only` | 🟢 read-only | The agent has an explicit `tools`, it contains no `Write`, `Edit`, `NotebookEdit`, and all `Bash(...)` entries are in the read-only command allowlist (`git diff/log/show/status`, `ls`, `cat`, …, the list is in `build-catalog.mjs`) |
| `runs-shell` | 🟡 runs shell (`git`) | There is a `Bash(...)` that does not fall under the agent's read-only rule, or the skill has `Bash(...)` in `allowed-tools`. The parentheses list the first words of the commands |
| `writes-files` | 🟠 writes files | `tools` / `allowed-tools` contains `Write`, `Edit` or `NotebookEdit` |
| `full-access` | 🟠 all tools | An agent **without** a `tools` field (inherits all tools) |
| `hooks` | 🔴 hooks | The plugin has `hooks/hooks.json`. Hooks run with the user's permissions outside the sandbox |
| `mcp-remote` | 🔴 MCP: network | A server in `.mcp.json` has `url` |
| `mcp-local` | 🔴 MCP: local process | A server in `.mcp.json` has `command` |
| `needs-secrets` | 🔑 needs secrets | `plugin.json` has `userConfig` with `"sensitive": true` |

- For a skill, `allowed-tools` only pre-approves tools and does not restrict them, so a skill **never** gets the `read-only` badge.
- Each badge has a tooltip with an explanation and a link to the Security section in CONTRIBUTING.
- The plugin page shows the union of the badges of all its artifacts.

Expected result on the current repo: `code-reviewer` → `read-only`, `commit-message` → `runs shell (git)`.

### 7.3 What's new

- The build script parses each plugin's `CHANGELOG.md` in the Keep a Changelog format: `## [x.y.z] - YYYY-MM-DD`, then `### Added|Changed|Fixed|Removed|Deprecated|Security` with lists. The `[Unreleased]` block is ignored.
- `/whats-new` is a chronological feed of all releases of all plugins, newest first. Each entry contains the plugin, version, date and a summary; a click leads to the plugin page. A first release is marked with the **"New plugin"** badge. There is a filter by plugin.
- **Release summary** (`summary`) is a single line for cards: the first item of the most important section (Added → Changed → Fixed → the rest) plus "and N more changes" if there is more than one item (singular: "and 1 more change"). The full list of sections is shown on the plugin page in the "Changelog" block.
- On the home page, the "What's new" block shows the 4 latest releases (§6.2).
- `feed.xml` is an Atom feed, one entry per release. `id` = `<plugin>@<version>`, the link leads to the plugin page.
- On the plugin page, the line "updated <date>" shows relative time ("3 days ago"). It is computed **in the browser** from `updatedAt`, so it doesn't go stale between builds; the exact date is the tooltip. In feeds, dates are mono in `YYYY-MM-DD` format, as in the mockup.
- If the CHANGELOG format is not recognized, the build emits a warning and the releases of that plugin are not shown. The build does not fail.

### 7.4 Recipes

- The file `site/content/recipes.yaml` is curated by the team:
  ```yaml
  - slug: code-review-workflow
    title: Code review workflow
    description: Write clean commits and get a review before opening a PR.
    artifacts:
      - dev-workflow/skill/commit-message
      - dev-workflow/agent/code-reviewer
  ```
- `/recipes/` shows the list of collections, `/recipes/<slug>/` shows the description, artifact cards and an "Add all plugins to team setup" button.
- At build time, each `artifacts[]` entry is checked for existence in `catalog.json`. An unknown id breaks the build, so that collections don't silently go stale.

### 7.5 Comparison and favorites

- **Comparison**: from 2 to 3 artifacts, selected with the "Compare" checkbox on cards. A "Compare (2)" bar appears at the bottom of the screen. The `/compare/?ids=…` page shows a table whose rows are type, plugin, version, description, invocation, model, tools, badges, updated. Differing values are highlighted. Data comes from `catalog.json`.
- **Favorites**: "★" on a card, stored in localStorage. `/favorites/` shows the saved cards. Ids removed from the catalog are silently dropped. If localStorage is unavailable, "★" is hidden.

### 7.6 Stats tiles

- A block on the home page under the hero, as in the mockup: a grid of **5 tiles**: plugins, skills, agents, commands, MCP. Each tile has a large mono number (26 px) and a label. Tiles with zero are muted (`--text-faint`): to gauge the catalog's "health", zero is informative too. Hooks have no tile of their own and are counted in the "Browse by type" block.
- Under the tiles, a small mono line: "Latest release: <date> · build <commit[0:7]>".
- The numbers come from `catalog.stats`, which is computed at build time.
- Each tile is a link-button to a filtered search: "skills" → `/search?type=skill`.
- Optional: a breakdown by category (`byCategory`) as link chips to `/search?category=…`.
- Labels use English singular/plural to agree with the count: "1 plugin" / "2 plugins", "1 skill" / "2 skills", "1 agent" / "2 agents", "1 command" / "2 commands"; "MCP" is invariant.

### 7.7 "Getting started" onboarding

- **Banner** on the home page: "First time here? Connect the marketplace in 30 seconds →". It can be dismissed, and that choice is stored in localStorage. Style: a `--bg-elev` card with an accent dot. The mockup has no banner, but for an empty catalog the mockup shows a "Get started" button.
- **The `/getting-started` page**: heading "Connect the marketplace", subtitle "Three steps…". Numbered steps from the mockup:
  1. **Add the marketplace as a source**: `claude plugin marketplace add dmitrii1600/dev-team-ai-engineering-marketplace`. Above the step, a small note "Requires Claude Code ≥ 2.1.300 (`claude --version`)".
  2. **Install the plugin you need**: `claude plugin install <plugin>@dev-team-ai-engineering-marketplace`. Above the terminal block there is a plugin selector, defaulting to the first alphabetically. Note: after installing, run `/reload-plugins` or restart the session.
  3. **Keep up to date**: `claude plugin marketplace update dev-team-ai-engineering-marketplace`. The second command is `claude plugin update <plugin>@dev-team-ai-engineering-marketplace`. A note about auto-update: for third-party marketplaces it is off by default and is enabled in `/plugin` → Marketplaces.
- A **"CLI / In session"** toggle above the steps switches the command prefix: `claude plugin …` ↔ `/plugin …`. In the mockup the commands use the `/plugin …` form, in the README the `claude plugin …` form. The default is CLI, as in the README.
- Below the steps:
  - the info panel from the mockup: "**marketplace update vs plugin update.** The first refreshes the list of sources; the second updates the code of a specific plugin";
  - a "**For the whole team**" block with a button to `/team-setup/` (M2; until M2, a link to the README section).
- Every command is a terminal block with a "Copy" button, which changes to "✓" for 2 s.
- **Single source of truth.** Commands are generated from `catalog.marketplace` and `site.config.json`, not written by hand. `build-catalog.mjs` checks that the README contains the same `claude plugin marketplace add …` lines and the same minimum version. If they diverge, the build fails with a hint about what to update.

## 8. Cheap extras

- **Request a skill / Report an issue.** Links to `https://github.com/<repo>/issues/new?template=<file>&title=<prefill>`.
  - For "Report an issue" on an artifact page, `title` is prefilled as `[<plugin>/<name>] `.
  - Templates: `.github/ISSUE_TEMPLATE/skill-request.yml` (what needs to be done, an example request, the preferred artifact type) and `.github/ISSUE_TEMPLATE/artifact-bug.yml` (artifact, version, steps, expected behavior).
- **Public `catalog.json`** at `/catalog.json`: the same file the site uses, with `schemaVersion`. The schema is available as `/catalog.schema.json`. Backward compatibility is preserved within a `schemaVersion`.

## 9. Process and CI changes

- **`.github/workflows/site.yml`** (name `Site`) is the only workflow that builds the website. It is separate from the marketplace harness checks in `validate.yml`. Actions are pinned by SHA, Node 24, as in `validate.yml`.
  - triggers: `pull_request`, `push` to `main` and `workflow_dispatch`; the first two are path-filtered to `site/**`, `plugins/**`, `.claude-plugin/**`, `README.md`, `.github/scripts/lib/**` and `.github/workflows/site.yml`;
  - `concurrency`: pull-request runs are cancelled by a newer push; deployments share the group `pages` and are never cancelled;
  - job **`build`** ("Build site"), `permissions: contents: read` (plus `pages: read`, which `actions/configure-pages` needs to look the Pages site up). Steps, in `site/`: `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` (node:test and Vitest) → `npm run check` (catalog build in memory, schema, README consistency) → `npm run build` (catalog files, `vite build`, `404.html`). Only on a push to `main` or a manual run on `main`: `actions/configure-pages` and `actions/upload-pages-artifact` (`site/dist`);
  - job **`deploy`** ("Deploy to GitHub Pages"): `needs: build`, runs only on a push to `main` or a manual run on `main`, `environment: github-pages`, `permissions: pages: write, id-token: write`, `actions/deploy-pages`.
- **`validate.yml`** no longer builds the site: it only checks the marketplace (`claude plugin validate`, `check-marketplace.mjs`, the install smoke test). Broken frontmatter, a CHANGELOG the site cannot parse or a README / onboarding mismatch fail the `Site` check on the PR, not the deploy after merge.
- **`.github/dependabot.yml`**: the `npm` ecosystem for `/site` (monthly), next to the existing `github-actions` entry. Versions in `site/package.json` are pinned exactly and `package-lock.json` is committed.
- **`check-marketplace.mjs`** switches to the shared `lib/frontmatter.mjs`. The validator's behavior does not change.
- **CONTRIBUTING.md**: a new "Catalog site" section. The site updates automatically after merge. Recipes are edited in `site/content/recipes.yaml`. Local preview: `cd site && npm ci && npm run dev` (http://localhost:5173/dev-team-ai-engineering-marketplace/; the dev server rebuilds the catalog when `plugins/` or `.claude-plugin/` change).
- **PR template**: an item "If an artifact was added, I checked its card locally (`npm run dev`)".
- **Repo settings** (manual, once): Settings → Pages → Source: **GitHub Actions**.

## 10. Non-functional requirements

| Requirement | Target |
|---|---|
| Performance | Lighthouse Performance ≥ 90 on the home page (mobile). Home page JS ≤ 100 KB gzip (the search code is a lazy chunk). Search ≤ 50 ms on 500 artifacts |
| Data size | `catalog.json` ≤ 300 KB gzip. It carries the searchable text and its pre-rendered HTML. If the threshold is exceeded, see the risks (§12) |
| Privacy | No cookies, trackers or third-party requests. IBM Plex fonts are self-hosted (the mockup pulls them from Google Fonts, which we replace), scripts only from our own domain |
| Security | Markdown is sanitized **at build time** (rehype-sanitize, no `<script>`, `on*`, `javascript:`, no images). CSP via `<meta>` in production builds: `default-src 'self'` (the early theme script is an external file, so no inline script is needed) |
| Compatibility | The latest 2 versions of Chrome, Firefox, Safari, Edge |
| JavaScript | **Required.** The earlier requirement "the catalog, artifact and plugin pages, onboarding and What's new are readable without JS" is dropped by the move from Astro to a pure SPA. Without JS the page shows a `<noscript>` notice. The data stays available without JS as `/catalog.json` and `/feed.xml`. Trade-offs: no server-rendered HTML for search engines or link previews, deep links are answered with status 404 by GitHub Pages (§6.2), and first paint waits for the bundle and `catalog.json` |
| Build time | ≤ 2 min in CI |

## 11. Acceptance criteria

### Build and data
- [ ] `node site/scripts/build-catalog.mjs` on the current repo produces `site/public/catalog.json` with 1 plugin and 2 artifacts (valid against `catalog.schema.json`), plus `feed.xml` and `catalog.schema.json`. `CATALOG_ROOT` / `--root` points the build at another checkout.
- [ ] Markdown fields have sanitized HTML twins (`readmeHtml`, `bodyHtml`, `sectionsHtml`); the browser bundle contains no markdown parser.
- [ ] `npm run build` in `site/` produces `dist/` with `index.html`, `404.html` (a copy of `index.html`), `catalog.json`, `feed.xml` and `catalog.schema.json`.
- [ ] A skill name missing from the frontmatter `name` is taken from the directory (`commit-message`).
- [ ] Invalid frontmatter, an unknown id in `recipes.yaml` or a README/onboarding mismatch make `--check` fail with `::error::`.
- [ ] `check-marketplace.mjs` after the refactoring gives the same result on the current repo.

### Design
- [ ] The home page, search, plugin and artifact pages, Getting started and What's new visually match `docs/design/catalog-prototype/index.html` in both themes: §6.1 tokens, IBM Plex fonts, type colors, terminal blocks, toast. UI copy is English. We verify with screenshots side by side with the mockup.
- [ ] No mocks from the mockup (`react-tools`, `burnjohn/…`, `dev-digest`) in the built site, and no mock data in shipped code (fixtures only under `site/tests/`).
- [ ] No `fonts.googleapis.com` / `fonts.gstatic.com` in network requests; `dist/` references no external origin except GitHub links and XML / schema identifiers.
- [ ] Pages have no horizontal scroll at 360, 768 and 1280 px.

### Search and cards
- [ ] `npm run build && npm run preview` in `site/` (the shell is served for `/`, `/search`, `/plugins/dev-workflow/`, `/plugins/dev-workflow/agent/code-reviewer/`, `/getting-started/`): the query `commit` finds `commit-message`, `review` finds `code-reviewer`, `dev-workflow` finds the plugin.
- [ ] The filter "Type: agents" leaves only `code-reviewer`. The filter, sort and query are restored from the URL after a reload.
- [ ] The `/` key focuses the search. `Ctrl+K` / `⌘K` opens the palette, `Esc` closes it, `Enter` opens the selected result.
- [ ] The query `zzzz` shows the "Nothing found" state with a "Reset filters" button and a "Request a skill" link.
- [ ] "Copy install" and "Copy invocation" copy the exact strings, the button label changes to "Copied ✓" and a toast appears.

### Features
- [ ] The stats tiles show "1 plugin · 1 skill · 1 agent · 0 commands · 0 MCP" (labels agree with the count), zeros are muted. Clicking the skills tile opens `/search?type=skill`.
- [ ] The hero chips show the tags `#git`, `#commits`, `#code-review`. A click opens search with that tag.
- [ ] The home page shows the release `Dev Workflow v0.1.0 · 2026-10-15` in the "What's new" block. `/whats-new` shows it with the "New plugin" badge. `feed.xml` passes the W3C Feed Validator.
- [ ] If `marketplace.json` has an empty plugin list, the "The catalog is empty" state is shown.
- [ ] `/getting-started` has the 3 steps from the mockup. Each command is copied with a single button. Commands in "CLI" mode match the README, and the "In session" toggle gives the `/plugin …` form.
- [ ] Badges: `code-reviewer` is "read-only", `commit-message` is "runs shell (git)". (M2)
- [ ] Team setup with `dev-workflow` selected generates JSON identical to the README example (after whitespace normalization). Merging with an arbitrary existing `settings.json` preserves foreign keys. (M2)
- [ ] The recipe `code-review-workflow` shows 2 cards, "Add all plugins to team setup" adds `dev-workflow` to the cart. (M3)
- [ ] Comparing `commit-message` and `code-reviewer` shows a table with highlighted differences. Favorites survive a reload. (M3)

### Deploy and quality
- [ ] `site.yml` via `workflow_dispatch` on `main` builds and deploys the site to `https://dmitrii1600.github.io/dev-team-ai-engineering-marketplace/`. All links respect `base`, there are no broken links (link-checker in CI). A deep link such as `/plugins/dev-workflow/` opens the plugin page (through `404.html`).
- [ ] On a pull request `site.yml` runs lint, typecheck, tests, the catalog check and the build, and does not deploy. `validate.yml` does not build the site.
- [ ] `npm run dev` starts at `http://localhost:5173/dev-team-ai-engineering-marketplace/`; editing a file under `plugins/` rebuilds the catalog and reloads the page; a broken file keeps the last good catalog and prints the `::error::` lines.
- [ ] UI copy: `npm run lint` fails on a string literal in JSX; `npm run typecheck` fails on an unknown `t()` key.
- [ ] Lighthouse: Performance ≥ 90, Accessibility ≥ 95.

## 12. Milestones

| Stage | Scope |
|---|---|
| **M1 — Catalog per the mockup** | Shared `lib/frontmatter.mjs`, `build-catalog.mjs` + schema (including CHANGELOG parsing). A React + Vite single-page app on the §6.1 tokens with self-hosted IBM Plex (all UI copy in `en.json`): header, HOME (hero, chips, Stats, "What's new", "Browse by type", empty state), SEARCH (filters, sorting, cards), plugin and artifact pages, ⌘K palette, toast, Getting started, What's new + `feed.xml`, with loading and error states. Also the separate `site.yml` workflow (lint, typecheck, tests, `--check`, build, deploy), the dev server with automatic catalog rebuilds, and Vitest tests |
| **M2 — Trust and team** | Security badges, Team setup (cart, merge), onboarding banner. Draw these screens in the mockup before implementation |
| **M3 — Conveniences** | Recipes, comparison, favorites, Issue templates and links, public `catalog.json` + schema, updating CONTRIBUTING and the PR template |

Each stage is a separate PR, after which the site is deployed and working.

### Risks and open questions

- **Index growth.** A single `catalog.json` (and the index built from it in the browser) is designed for roughly 500 artifacts. Beyond that threshold, split the catalog (per-plugin files fetched on demand), move to Pagefind (a chunked index) or exclude `body` from the index.
- **Source links** point to `main`. Links to a specific tag (`<plugin>--v<version>`) are possible, but only once tagging becomes mandatory.
- **Local branch `master` and remote `main`.** The workflow triggers on `main`, so before the first deploy make sure the repo uses `main`.
- **Mockup dependency on CDNs.** The prototype in `docs/design/catalog-prototype/` pulls React 18.3.1 from unpkg (with SRI) via `support.js`, and its fonts come from Google Fonts. That contradicts §10, so the site does not reuse either: M1 ships React components and self-hosted IBM Plex, and the prototype is no longer published (it is only a design reference).
- **Contrast** of `--text-faint` (`#5f6672` on `#0b0c0f`) is below 4.5:1 (3.4:1; the light value `#8b93a0` is 2.9:1 on `#f6f7f9`). For small text (counters, dates) this fails WCAG AA. M1 raises it to `#7f8796` (dark) and `#626c7b` (light), which reach at least 4.5:1 on every surface token in both themes; this needs sign-off from design. Not changed, but worth a look: white `--accent-fg` on the dark accent is 2.9:1, and a few light-theme type badges (`--kind-command`, `--kind-skill`, `--kind-hook`) are 3.9 to 4.4:1 on their tinted background.
- **SPA trade-offs.** The site is rendered in the browser, so artifact pages have no server-rendered HTML for search engines or link previews, and GitHub Pages answers deep links with status 404 (§6.2, §10). If discoverability becomes a goal, pre-render the routes at build time (the data is already static) or publish a sitemap; the machine-readable `catalog.json` and `feed.xml` are available regardless.
- **Hook and MCP formats** in cards are simplified. If complex configurations appear (several matchers), the hook card format will need to be refined.

## 13. Future (out of scope)

- Semantic search: embeddings computed in CI, the model runs in the browser via transformers.js.
- A generator for a new plugin or skill with in-browser validation.
- Discussions and reactions via giscus.
- The `catalog-finder` meta-skill that searches `catalog.json` from Claude Code.
- Auto-generating the plugin table in the README from `catalog.json`.
- Cookie-free analytics (GoatCounter / Plausible).
