// Atom feed (spec section 7.3): one entry per release of every plugin, newest first.
// Entry ids are `<plugin>@<version>` wrapped in a tag: URI, because Atom requires absolute IRIs
// and the W3C validator rejects bare strings.

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const stamp = (date) => `${date}T00:00:00Z`;

// All releases of all plugins, newest first (same order as the What's new page).
export const listReleases = (catalog) =>
  catalog.plugins
    .flatMap((plugin) => plugin.releases.map((r, i) => ({ ...r, plugin, isNew: i === plugin.releases.length - 1 })))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.plugin.name.localeCompare(b.plugin.name) ||
        b.version.localeCompare(a.version, undefined, { numeric: true }),
    );

/**
 * @param {object} catalog validated catalog
 * @param {{ siteUrl: string, basePath: string }} site e.g. https://dmitrii1600.github.io and /dev-team-ai-engineering-marketplace/
 */
export const buildFeed = (catalog, { siteUrl, basePath }) => {
  const absolute = (path = "") => new URL(`${basePath.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`, siteUrl).href;
  const host = new URL(siteUrl).hostname;
  const releases = listReleases(catalog);
  const updated = releases[0] ? stamp(releases[0].date) : catalog.generatedAt.replace(/\.\d+Z$/, "Z");
  const repoUrl = `https://github.com/${catalog.marketplace.repo}`;

  const entries = releases
    .map((r) => {
      const items = Object.entries(r.sections)
        .filter(([, list]) => list.length > 0)
        .map(([name, list]) => `<h3>${esc(name)}</h3><ul>${list.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`)
        .join("");
      return `  <entry>
    <id>tag:${host},${r.date}:${esc(r.plugin.name)}@${esc(r.version)}</id>
    <title>${esc(r.plugin.displayName ?? r.plugin.name)} v${esc(r.version)}</title>
    <link rel="alternate" type="text/html" href="${esc(absolute(`plugins/${r.plugin.name}`))}"/>
    <updated>${stamp(r.date)}</updated>
    <author><name>${esc(r.plugin.author?.name ?? catalog.marketplace.owner.name)}</name></author>
    <category term="${esc(r.plugin.name)}"/>
    <summary type="text">${esc(r.summary)}</summary>
    <content type="html">${esc(items)}</content>
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:${host},2026:${esc(catalog.marketplace.name)}</id>
  <title>${esc(catalog.marketplace.name)}: what's new</title>
  <subtitle>${esc(catalog.marketplace.description)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${esc(absolute("feed.xml"))}"/>
  <link rel="alternate" type="text/html" href="${esc(absolute("whats-new"))}"/>
  <updated>${updated}</updated>
  <author><name>${esc(catalog.marketplace.owner.name)}</name><uri>${esc(catalog.marketplace.owner.url ?? repoUrl)}</uri></author>
${entries}
</feed>
`;
};
