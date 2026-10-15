// Full-text search over plugins and artifacts (spec section 5).
//
// The MiniSearch index is built in the browser from catalog.json instead of being prebuilt into a
// second file: the catalog already carries every searchable field (including `body`), so a prebuilt
// search-index.json would duplicate that text, add a request and could drift from the options used
// to read it. Indexing a few hundred documents takes milliseconds, and it only happens when search
// is first used (the search page or the command palette).
import MiniSearch, { type SearchOptions } from "minisearch";
import type { Catalog, Entry } from "./catalog";
import { getEntries } from "./catalog";

export const SEARCH_FIELDS = ["name", "displayName", "tags", "description", "plugin", "body"];

// Spec section 5: field weights.
export const BOOST: Record<string, number> = {
  name: 3,
  displayName: 3,
  tags: 2,
  description: 1.5,
  plugin: 1,
  body: 0.5,
};

export const searchOptions = (combineWith: "AND" | "OR"): SearchOptions => ({
  prefix: true,
  fuzzy: 0.2,
  combineWith,
  boost: BOOST,
});

export interface SearchResult {
  /** id -> relevance score, only for matching entries. */
  scores: Map<string, number>;
  /** True when nothing matched all words and the results come from the "any word" retry. */
  partial: boolean;
}

export interface SearchEngine {
  /** Entries in catalog order (plugin, then its artifacts). */
  entries: Entry[];
  byId: Map<string, Entry>;
  search(query: string): SearchResult;
}

export const createSearchEngine = (entries: Entry[]): SearchEngine => {
  const index = new MiniSearch({ idField: "id", fields: SEARCH_FIELDS });
  index.addAll(
    entries.map((e) => ({
      id: e.id,
      name: e.name,
      displayName: e.displayName,
      tags: e.tags.join(" "),
      description: e.description,
      plugin: e.plugin,
      body: e.body,
    })),
  );
  const toScores = (hits: Array<{ id: string; score: number }>) => new Map(hits.map((h) => [h.id, h.score]));
  return {
    entries,
    byId: new Map(entries.map((e) => [e.id, e])),
    // All words must match (AND). With no result, retry with OR and flag the results as partial.
    search(query) {
      const q = query.trim();
      if (!q) return { scores: new Map(), partial: false };
      const strict = index.search(q, searchOptions("AND"));
      if (strict.length > 0) return { scores: toScores(strict), partial: false };
      const loose = index.search(q, searchOptions("OR"));
      return { scores: toScores(loose), partial: loose.length > 0 };
    },
  };
};

// One engine per catalog, created the first time search is needed.
const engines = new WeakMap<Catalog, SearchEngine>();
export const searchEngineFor = (catalog: Catalog): SearchEngine => {
  let engine = engines.get(catalog);
  if (!engine) {
    engine = createSearchEngine(getEntries(catalog));
    engines.set(catalog, engine);
  }
  return engine;
};
