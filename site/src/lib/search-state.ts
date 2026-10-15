// State of the search screen (spec section 5): parsed from / written to the URL query string, plus the
// pure filtering, sorting and facet-count logic. No React in here, so it is easy to test.
import type { Entry } from "./catalog";

export type Sort = "relevance" | "name" | "updated";

export interface SearchState {
  q: string;
  types: string[];
  kws: string[];
  author: string;
  sort: Sort;
  plugin: string;
  category: string;
}

export const EMPTY_STATE: SearchState = { q: "", types: [], kws: [], author: "", sort: "relevance", plugin: "", category: "" };

const list = (value: string | null): string[] =>
  value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

export const parseSearchParams = (p: URLSearchParams): SearchState => {
  const sort = p.get("sort");
  return {
    q: p.get("q") ?? "",
    types: list(p.get("type")),
    kws: list(p.get("kw")),
    author: p.get("author") ?? "",
    sort: sort === "name" || sort === "updated" ? sort : "relevance",
    plugin: p.get("plugin") ?? "",
    category: p.get("category") ?? "",
  };
};

/** `?q=review&type=agent,skill` (commas stay readable), or "" for the default state. */
export const toSearchString = (s: SearchState): string => {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.types.length) p.set("type", s.types.join(","));
  if (s.kws.length) p.set("kw", s.kws.join(","));
  if (s.author) p.set("author", s.author);
  if (s.sort !== "relevance") p.set("sort", s.sort);
  if (s.plugin) p.set("plugin", s.plugin);
  if (s.category) p.set("category", s.category);
  const qs = p.toString().replace(/%2C/gi, ",");
  return qs ? `?${qs}` : "";
};

export type FacetName = "type" | "kw" | "author";

const matches = (e: Entry, s: SearchState, scores: Map<string, number> | null, skip?: FacetName): boolean =>
  (!scores || scores.has(e.id)) &&
  (skip === "type" || s.types.length === 0 || s.types.includes(e.kind)) &&
  (skip === "kw" || s.kws.length === 0 || s.kws.some((k) => e.tags.includes(k))) &&
  (skip === "author" || !s.author || e.author === s.author) &&
  (!s.plugin || e.plugin === s.plugin) &&
  (!s.category || e.category === s.category);

/** Entries that pass the query (`scores`, or null for no query) and every filter, in display order. */
export const filterEntries = (entries: Entry[], s: SearchState, scores: Map<string, number> | null): Entry[] => {
  const order = new Map(entries.map((e, i) => [e.id, i]));
  const position = (e: Entry) => order.get(e.id) ?? 0;
  const byTitle = (a: Entry, b: Entry) => a.displayName.localeCompare(b.displayName) || position(a) - position(b);
  const score = (e: Entry) => scores?.get(e.id) ?? 0;
  return entries
    .filter((e) => matches(e, s, scores))
    .sort((a, b) => {
      if (s.sort === "name") return byTitle(a, b);
      if (s.sort === "updated") return (b.updated ?? "").localeCompare(a.updated ?? "") || byTitle(a, b);
      return scores ? score(b) - score(a) || byTitle(a, b) : position(a) - position(b);
    });
};

/** Counter next to a facet value: results with that value, ignoring the facet's own selection. */
export const facetCount = (
  entries: Entry[],
  s: SearchState,
  scores: Map<string, number> | null,
  facet: FacetName,
  value: string,
): number =>
  entries.filter((e) => {
    if (!matches(e, s, scores, facet)) return false;
    if (facet === "type") return e.kind === value;
    if (facet === "author") return e.author === value;
    return e.tags.includes(value);
  }).length;

export const activeFilterCount = (s: SearchState): number =>
  s.types.length + s.kws.length + (s.author ? 1 : 0) + (s.plugin ? 1 : 0) + (s.category ? 1 : 0);

export const uniqueKeywords = (entries: Entry[]): string[] =>
  [...new Set(entries.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b));

export const uniqueAuthors = (entries: Entry[]): string[] => [...new Set(entries.map((e) => e.author).filter(Boolean))];

export const toggle = (arr: string[], value: string): string[] =>
  arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
