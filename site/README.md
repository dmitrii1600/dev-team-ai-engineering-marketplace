# site/ — catalog website

Website for the marketplace, hosted on GitHub Pages:
https://dmitrii1600.github.io/dev-team-ai-engineering-marketplace/

It is a **React single-page app built with [Vite](https://vite.dev)** (React 19, TypeScript, React Router) with its own `package.json`. This directory is separate from the marketplace itself: Claude Code only reads `.claude-plugin/` and `plugins/`, and nothing here is installed with a plugin.

Specification: [docs/specs/github-pages-catalog.md](../docs/specs/github-pages-catalog.md). Design reference (the original interactive prototype, **not** published): [docs/design/catalog-prototype/](../docs/design/catalog-prototype/index.html).

## How it works

There is no backend, and no mock data anywhere in the app. Everything the site shows is generated from the repository at build time and fetched by the browser at runtime:

```
.claude-plugin/marketplace.json, plugins/*   (frontmatter, plugin.json, README, CHANGELOG)
        │  scripts/build-catalog.mjs   (markdown -> sanitized HTML, validated against schema/catalog.schema.json)
        ▼
public/catalog.json, feed.xml, catalog.schema.json   (generated, git-ignored)
        │  vite build  (+ index.html copied to 404.html)
        ▼
dist/   index.html, 404.html, assets/, catalog.json, feed.xml, catalog.schema.json
```

The app fetches `catalog.json` when it starts (`import.meta.env.BASE_URL + "catalog.json"`) and shows a loading state, or an error state with a "Try again" button. Markdown (plugin READMEs, artifact bodies, CHANGELOG items) is rendered to **sanitized HTML at build time** and stored in the catalog (`readmeHtml`, `bodyHtml`, `sectionsHtml`, `summaryHtml`), so the browser bundle contains no markdown parser. Full-text search builds its MiniSearch index in the browser from the same `catalog.json` the first time search is used (the search page or the ⌘K palette); there is no separate `search-index.json` (see spec §5 for the reasoning).

| Path | Purpose |
|---|---|
| `index.html` | The single HTML shell. `%i18n:<key>%` placeholders are filled from `src/i18n/en.json` by `vite/plugins.ts` |
| `scripts/build-catalog.mjs` | Builds `public/catalog.json`, `public/feed.xml` (Atom) and `public/catalog.schema.json` from the repository. `--check` builds in memory, validates the schema and checks that README install commands and the minimum Claude Code version agree with `site.config.json`; it writes nothing and exits non-zero with `::error::` lines on any problem. Nothing is written unless the whole build is valid |
| `scripts/lib/catalog.mjs` | Extraction logic (artifacts, CHANGELOG parser, consistency checks), unit-tested |
| `scripts/lib/markdown.mjs` | Markdown to sanitized HTML (`unified`, `rehype-sanitize`), build time only |
| `scripts/lib/feed.mjs` | The Atom feed |
| `../.github/scripts/lib/frontmatter.mjs` | Frontmatter parser shared with the repository validator |
| `schema/catalog.schema.json` | JSON Schema (2020-12) of `catalog.json`; also published as `/catalog.schema.json` |
| `site.config.json` | Repository, marketplace name, minimum Claude Code version, site URL and base path |
| `src/main.tsx`, `src/App.tsx` | Entry point and the routes (`BrowserRouter`, `basename` from Vite's base) |
| `src/pages/` | `Home`, `Search`, `Plugin`, `Artifact`, `GettingStarted`, `WhatsNew`, `NotFound` |
| `src/components/`, `src/context/` | Header, command palette, cards, copy buttons, toast; catalog loading state |
| `src/lib/` | Catalog types and derived views, MiniSearch wrapper, search/URL state, helpers |
| `src/i18n/en.json`, `src/i18n/index.ts` | **All UI copy** and the typed `t()` helper |
| `src/styles/` | Design tokens (`tokens.css`, dark default and light theme) and components (`global.css`) |
| `public/` | Static files copied as is (`favicon.svg`, `theme-init.js`); the generated catalog files land here too |
| `vite/plugins.ts` | Vite plugins: dev-time catalog rebuild, production CSP meta tag, `404.html` copy, `%i18n:…%` placeholders in `index.html` |
| `tests/*.test.mjs` | `node:test` unit tests of the catalog scripts |
| `tests/ui/`, `tests/fixtures/` | Vitest + React Testing Library tests and their fixture catalog (fixtures live only here) |

The site makes no third-party requests: IBM Plex is self-hosted through `@fontsource`, and a `Content-Security-Policy` meta tag (`default-src 'self'`) is added to production builds. The early theme script is an external file (`public/theme-init.js`), so no inline script is needed.

## Translations: everything is in `src/i18n/en.json`

No component contains a user-visible string. Copy lives in one flat file, and components call a typed helper:

```tsx
import { t } from "../i18n";

t("common.openName", { name: "code-reviewer" });   // "Open code-reviewer"   ({placeholders})
t("search.count", { count: 1 });                    // "1 artifact"           (plural entries need `count`)
t("search.count", { count: 3 });                    // "3 artifacts"
```

A plural entry is an object with `one` and `other` forms; the form is chosen with `Intl.PluralRules("en")`. Markup inside a message uses simple tags that the caller maps to elements (`tr()` in `src/i18n/rich.tsx`), for example `"<strong>First time here?</strong> Connect…"`; text is never parsed as HTML.

The rules are enforced, not just agreed on:

- `t()` is typed from `en.json`, so an unknown key (or a plural key without `count`) fails `npm run typecheck`.
- ESLint (`npm run lint`) rejects string literals in JSX (`react/jsx-no-literals`) and in user-visible attributes (`aria-label`, `placeholder`, `title`, `alt`). Only symbol-only strings such as `·`, `$`, `×` or `⌘K` are allowed.
- A test (`tests/ui/i18n.test.tsx`) checks that every key used through `t()` / `tr()` exists and that plural entries are complete.

## Develop

Requires Node 22.22+ (CI uses Node 24).

```bash
cd site
npm ci
npm run dev        # regenerates the catalog, then http://localhost:5173/dev-team-ai-engineering-marketplace/
```

While the dev server runs, it watches `../plugins/**` and `../.claude-plugin/**`. After a change it waits 300 ms (so a burst of saves is one rebuild), re-runs `scripts/build-catalog.mjs` and reloads the page, so editing a skill, an agent or a CHANGELOG shows up without restarting. If the rebuild fails (broken frontmatter, an unparsable CHANGELOG, a schema error), the **last good `public/catalog.json` is kept** and the build's `::error::` lines are printed in the terminal; fix the file and save again. Changes to `site.config.json` or `schema/` need a restart.

The dev server is `vite` itself, so hot module replacement works for everything under `src/`.

### Building from another checkout of the repository

By default the catalog is built from the repository that contains `site/`. To build from another tree (for example a clean export of a commit while your working tree has unfinished plugins), set `CATALOG_ROOT` or pass `--root`:

```bash
mkdir /tmp/export && git archive HEAD | tar -x -C /tmp/export
CATALOG_ROOT=/tmp/export npm run build
node scripts/build-catalog.mjs --check --root /tmp/export
```

`CATALOG_ROOT` is also honored by `npm run dev` (it then watches that tree).

## Build and preview

```bash
npm run build      # build-catalog.mjs, then vite build -> site/dist (also writes dist/404.html)
npm run preview    # serves dist/ under the /dev-team-ai-engineering-marketplace/ base path
npm run lint       # ESLint, including the no-literal-strings rule
npm run typecheck  # tsc --noEmit, including the typed translation keys
npm test           # node:test (catalog scripts) and Vitest (UI), both
npm run check      # = node scripts/build-catalog.mjs --check
```

`npm run preview` serves the SPA shell for every path (Vite's SPA fallback). On GitHub Pages the same job is done by `404.html`.

### Base path and routing

The site is a GitHub Pages *project* site, so every URL lives under `/dev-team-ai-engineering-marketplace/`. The base is `basePath` in `site.config.json`, read by `vite.config.ts`; the router uses it as `basename` (`import.meta.env.BASE_URL`), and every asset and `fetch` goes through `BASE_URL`. If the repository or the Pages path ever changes, update `siteUrl`, `basePath` and `repo` in `site.config.json`.

GitHub Pages has no rewrite rules, so a deep link such as `/plugins/dev-workflow/` would be a 404. The build copies `dist/index.html` to `dist/404.html`; Pages serves it for unknown paths and the app then routes on the URL. Trade-off: those pages are served with HTTP status 404 (browsers do not care, search engines do), and the page content exists only after JavaScript runs.

Routes: `/`, `/search`, `/plugins/:plugin`, `/plugins/:plugin/:type/:name`, `/getting-started`, `/whats-new`, and a not-found page. Search state lives in the URL: `/search?q=review&type=agent&kw=git&author=…&sort=updated`.

## Deploy

`.github/workflows/site.yml` ("Site") has two jobs:

- **Build site** runs on pull requests, on pushes to `main` and on manual runs, filtered to `site/**`, `plugins/**`, `.claude-plugin/**`, `README.md`, `.github/scripts/lib/**` and the workflow file. Steps: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run check`, `npm run build`. On `main` it also uploads `site/dist` as the Pages artifact.
- **Deploy to GitHub Pages** runs only on a push to `main` or a manual run on `main`, after the build job, with `pages: write` and `id-token: write`.

The marketplace checks (`claude plugin validate`, `check-marketplace.mjs`) stay in `.github/workflows/validate.yml`, which does not build the site.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

`.nojekyll` is not needed: deployment goes through GitHub Actions, which does not run Jekyll.

## Design prototype

The original mockup is kept in [`docs/design/catalog-prototype/`](../docs/design/catalog-prototype/index.html): `index.html` (a template plus a `class Component` with mock data), its `support.js` runtime, with the UI copy and mock data translated to English. It still loads React from unpkg and fonts from Google Fonts, so it is a design reference only; the site does not use any of its code. To look at it, serve that directory over HTTP (the runtime re-fetches the page's own URL at startup):

```bash
python -m http.server 8765 --directory docs/design/catalog-prototype
```
