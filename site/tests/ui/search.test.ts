import { describe, expect, test } from "vitest";
import { getEntries } from "../../src/lib/catalog";
import { createSearchEngine } from "../../src/lib/search";
import {
  EMPTY_STATE,
  activeFilterCount,
  facetCount,
  filterEntries,
  parseSearchParams,
  toSearchString,
  type SearchState,
} from "../../src/lib/search-state";
import { fixtureCatalog } from "../fixtures/catalog";

const entries = getEntries(fixtureCatalog());
const engine = createSearchEngine(entries);
const state = (patch: Partial<SearchState> = {}): SearchState => ({ ...EMPTY_STATE, ...patch });
const ids = (list: ReturnType<typeof filterEntries>) => list.map((e) => e.id);

describe("search engine", () => {
  test("indexes plugins and artifacts", () => {
    expect(entries).toHaveLength(2 + 6);
    expect(entries.filter((e) => e.kind === "plugin")).toHaveLength(2);
  });

  test("finds an artifact by a word of its name, its description or its plugin", () => {
    expect([...engine.search("commit").scores.keys()][0]).toBe("alpha-tools/skill/commit-message");
    expect([...engine.search("review").scores.keys()]).toContain("alpha-tools/agent/code-reviewer");
    expect([...engine.search("beta-tools").scores.keys()]).toContain("plugin/beta-tools");
  });

  test("requires every word, then falls back to any word and says so", () => {
    const strict = engine.search("commit message");
    expect(strict.partial).toBe(false);
    expect([...strict.scores.keys()]).toEqual(["alpha-tools/skill/commit-message"]);

    const loose = engine.search("commit database");
    expect(loose.partial).toBe(true);
    expect(loose.scores.size).toBeGreaterThan(1);
  });

  test("returns nothing for gibberish and for an empty query", () => {
    expect(engine.search("zzzz").scores.size).toBe(0);
    expect(engine.search("   ").scores.size).toBe(0);
  });

  test("name matches outrank body matches (field boosts)", () => {
    const scores = engine.search("deploy").scores;
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe("beta-tools/command/deploy");
  });
});

describe("filters, sort and facets", () => {
  test("type, keyword (OR), author and plugin filters", () => {
    expect(ids(filterEntries(entries, state({ types: ["agent"] }), null))).toEqual(["alpha-tools/agent/code-reviewer"]);
    expect(filterEntries(entries, state({ kws: ["database"] }), null).every((e) => e.plugin === "beta-tools")).toBe(true);
    expect(filterEntries(entries, state({ kws: ["review", "database"] }), null)).toHaveLength(8);
    expect(filterEntries(entries, state({ author: "Ada" }), null).every((e) => e.author === "Ada")).toBe(true);
    expect(filterEntries(entries, state({ plugin: "beta-tools", types: ["skill"] }), null)).toHaveLength(1);
    expect(filterEntries(entries, state({ category: "operations" }), null).every((e) => e.plugin === "beta-tools")).toBe(true);
  });

  test("query scores restrict and order the results", () => {
    const { scores } = engine.search("commit");
    const result = filterEntries(entries, state({ q: "commit" }), scores);
    expect(result[0].id).toBe("alpha-tools/skill/commit-message");
    expect(result.every((e) => scores.has(e.id))).toBe(true);
  });

  test("sorts by name and by recent update", () => {
    const byName = filterEntries(entries, state({ sort: "name", types: ["skill"] }), null).map((e) => e.displayName);
    expect(byName).toEqual(["commit-message", "db-migrate", "release-notes"]);
    const updated = filterEntries(entries, state({ sort: "updated", types: ["skill"] }), null);
    expect(updated[0].plugin).toBe("beta-tools"); // updated 2026-10-10, newer than alpha's 2026-10-01
  });

  test("facet counters ignore the facet's own selection", () => {
    const s = state({ types: ["agent"] });
    expect(facetCount(entries, s, null, "type", "skill")).toBe(3);
    expect(facetCount(entries, s, null, "type", "agent")).toBe(1);
    expect(facetCount(entries, state({ author: "Ada" }), null, "author", "Bob")).toBe(4);
    expect(facetCount(entries, state({ types: ["hook"] }), null, "kw", "git")).toBe(1);
  });

  test("counts active filters", () => {
    expect(activeFilterCount(state())).toBe(0);
    expect(activeFilterCount(state({ types: ["a", "b"], kws: ["x"], author: "Ada", plugin: "p", category: "c" }))).toBe(6);
  });
});

describe("URL state", () => {
  test("round-trips through the query string with readable commas", () => {
    const s = state({ q: "code review", types: ["agent", "skill"], kws: ["git"], author: "Ada", sort: "updated", plugin: "alpha-tools" });
    const search = toSearchString(s);
    expect(search).toBe("?q=code+review&type=agent,skill&kw=git&author=Ada&sort=updated&plugin=alpha-tools");
    expect(parseSearchParams(new URLSearchParams(search))).toEqual(s);
  });

  test("the default state has an empty query string; unknown sort values fall back", () => {
    expect(toSearchString(state())).toBe("");
    expect(parseSearchParams(new URLSearchParams("sort=bogus")).sort).toBe("relevance");
  });
});
