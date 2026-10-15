import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeed, listReleases } from "../scripts/lib/feed.mjs";

const release = (version, date, summary) => ({ version, date, sections: { Added: [summary, "Second & <third>"] }, summary });
const catalog = {
  generatedAt: "2026-10-15T12:00:00.000Z",
  marketplace: { name: "acme-market", description: "Fixture & co", repo: "acme/market", owner: { name: "Acme" } },
  plugins: [
    { name: "alpha", displayName: "Alpha", author: { name: "Ada" }, releases: [release("1.1.0", "2026-10-10", "Newer"), release("1.0.0", "2026-09-01", "First")] },
    { name: "beta", releases: [release("0.1.0", "2026-10-10", "Beta first")] },
  ],
};
const site = { siteUrl: "https://acme.github.io", basePath: "/market/" };

test("lists releases newest first, ties broken by plugin name, and flags each plugin's first release", () => {
  const list = listReleases(catalog);
  assert.deepEqual(list.map((r) => `${r.plugin.name}@${r.version}`), ["alpha@1.1.0", "beta@0.1.0", "alpha@1.0.0"]);
  assert.deepEqual(list.map((r) => r.isNew), [false, true, true]);
});

test("builds an Atom feed with one entry per release and absolute links under the base path", () => {
  const xml = buildFeed(catalog, site);
  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.equal(xml.match(/<entry>/g).length, 3);
  assert.match(xml, /<link rel="self" type="application\/atom\+xml" href="https:\/\/acme\.github\.io\/market\/feed\.xml"\/>/);
  assert.match(xml, /<link rel="alternate" type="text\/html" href="https:\/\/acme\.github\.io\/market\/plugins\/alpha"\/>/);
  assert.match(xml, /<id>tag:acme\.github\.io,2026-10-10:alpha@1\.1\.0<\/id>/);
  assert.match(xml, /<title>Alpha v1\.1\.0<\/title>/);
  assert.match(xml, /<title>beta v0\.1\.0<\/title>/); // no displayName: falls back to the name
  assert.match(xml, /<updated>2026-10-10T00:00:00Z<\/updated>/);
  assert.match(xml, /<author><name>Acme<\/name><\/author>/); // plugin without an author: the owner
});

test("escapes XML in titles, summaries and the HTML content", () => {
  const xml = buildFeed(catalog, site);
  assert.match(xml, /<subtitle>Fixture &amp; co<\/subtitle>/);
  // The content is HTML inside XML: the item text is escaped twice.
  assert.match(xml, /&lt;li&gt;Second &amp;amp; &amp;lt;third&amp;gt;&lt;\/li&gt;/);
  assert.doesNotMatch(xml, /<third>/);
});

test("an empty catalog still yields a valid feed", () => {
  const xml = buildFeed({ ...catalog, plugins: [] }, site);
  assert.match(xml, /<updated>2026-10-15T12:00:00Z<\/updated>/);
  assert.equal(xml.match(/<entry>/g), null);
});
