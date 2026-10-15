import { useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Card } from "../components/Card";
import { useCatalog } from "../context/catalog";
import { t } from "../i18n";
import { KINDS, repoUrl } from "../lib/catalog";
import { pageTitle, useDocumentTitle } from "../lib/page";
import { searchEngineFor } from "../lib/search";
import {
  EMPTY_STATE,
  activeFilterCount,
  facetCount,
  filterEntries,
  parseSearchParams,
  toSearchString,
  toggle,
  uniqueAuthors,
  uniqueKeywords,
  type SearchState,
  type Sort,
} from "../lib/search-state";

export function Search() {
  const catalog = useCatalog();
  const navigate = useNavigate();
  const { pathname, search: currentSearch } = useLocation();
  const [params] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const engine = searchEngineFor(catalog);
  const entries = engine.entries;
  const state = useMemo(() => parseSearchParams(params), [params]);
  const query = state.q.trim();

  const result = useMemo(() => (query ? engine.search(query) : null), [engine, query]);
  const scores = result ? result.scores : null;
  const visible = useMemo(() => filterEntries(entries, state, scores), [entries, state, scores]);

  const keywords = useMemo(() => uniqueKeywords(entries), [entries]);
  const authors = useMemo(() => uniqueAuthors(entries), [entries]);

  useDocumentTitle(pageTitle(query ? t("search.heading.query", { q: query }) : t("search.title")));

  // Every change of a filter is a history entry, so Back undoes it; the URL is the single source of state.
  const update = (patch: Partial<SearchState>) => {
    const search = toSearchString({ ...state, ...patch });
    if (search === currentSearch) return;
    void navigate({ pathname, search });
  };
  const reset = () => update({ ...EMPTY_STATE, sort: state.sort });

  const active = activeFilterCount(state);
  const partial = result?.partial ?? false;
  const countText = partial
    ? t("search.countPartial", { count: visible.length })
    : t("search.count", { count: visible.length });
  const issuesUrl = `${repoUrl(catalog)}/issues/new`;
  const requestTitle = t("search.requestTitle", { q: query });
  const requestHref = `${issuesUrl}?template=skill-request.yml&title=${encodeURIComponent(requestTitle)}`;

  const chips: Array<{ label: string; clear: () => void }> = [];
  if (state.plugin) chips.push({ label: t("search.activeFilter.plugin", { value: state.plugin }), clear: () => update({ plugin: "" }) });
  if (state.category)
    chips.push({ label: t("search.activeFilter.category", { value: state.category }), clear: () => update({ category: "" }) });

  return (
    <main id="main" className="page page--search" tabIndex={-1}>
      <aside className="filters" aria-label={t("search.filters")}>
        <button
          type="button"
          className="btn filters-toggle"
          aria-expanded={filtersOpen}
          aria-controls="filters-panel"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {t("search.filtersToggle", { count: active })}
        </button>
        <div className="filters-panel" id="filters-panel" data-collapsed={!filtersOpen}>
          <div className="filters-head">
            <span className="filters-title">{t("search.filters")}</span>
            <button type="button" className="filters-reset" onClick={reset}>
              {t("search.reset")}
            </button>
          </div>

          <h2 className="facet-title">{t("search.facet.type")}</h2>
          <div className="facet-list">
            {KINDS.map((kind) => (
              <button
                type="button"
                key={kind}
                className={`facet-item k-${kind}`}
                aria-pressed={state.types.includes(kind)}
                onClick={() => update({ types: toggle(state.types, kind) })}
              >
                <span className="dot" aria-hidden="true"></span>
                <span className="label label--cap">{t(`kind.plural.${kind}`)}</span>
                <span className="count">{facetCount(entries, state, scores, "type", kind)}</span>
              </button>
            ))}
          </div>

          <h2 className="facet-title">{t("search.facet.keywords")}</h2>
          <div className="kw-row">
            {keywords.map((kw) => (
              <button
                type="button"
                key={kw}
                className="kw-chip"
                aria-pressed={state.kws.includes(kw)}
                onClick={() => update({ kws: toggle(state.kws, kw) })}
              >
                {kw}
              </button>
            ))}
          </div>

          {authors.length > 0 && (
            <>
              <h2 className="facet-title">{t("search.facet.author")}</h2>
              <div className="facet-list facet-list--authors">
                {authors.map((author) => (
                  <button
                    type="button"
                    key={author}
                    className="facet-item"
                    aria-pressed={state.author === author}
                    onClick={() => update({ author: state.author === author ? "" : author })}
                  >
                    <span className="label">{author}</span>
                    <span className="count">{facetCount(entries, state, scores, "author", author)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>

      <section aria-labelledby="results-heading">
        <div className="results-head">
          <div>
            <h1 id="results-heading">{query ? t("search.heading.query", { q: query }) : t("search.heading.browse")}</h1>
            <div className="results-count" aria-live="polite" aria-atomic="true">
              {countText}
            </div>
          </div>
          <label className="sort-label">
            {t("search.sort")}
            <select value={state.sort} onChange={(e) => update({ sort: e.target.value as Sort })}>
              <option value="relevance">{t("search.sort.relevance")}</option>
              <option value="name">{t("search.sort.name")}</option>
              <option value="updated">{t("search.sort.updated")}</option>
            </select>
          </label>
        </div>

        {chips.length > 0 && (
          <div className="active-filters">
            {chips.map((chip) => (
              <button
                type="button"
                key={chip.label}
                className="active-filter"
                aria-label={t("search.removeFilter", { label: chip.label })}
                onClick={chip.clear}
              >
                {chip.label} ×
              </button>
            ))}
          </div>
        )}

        {entries.length === 0 ? (
          <div className="no-results">
            <div className="emoji" aria-hidden="true">
              📦
            </div>
            <h2>{t("home.empty.title")}</h2>
            <p>{t("search.emptyCatalog")}</p>
          </div>
        ) : visible.length > 0 ? (
          <div className="card-grid">
            {visible.map((entry) => (
              <Card entry={entry} key={entry.id} />
            ))}
          </div>
        ) : (
          <div className="no-results">
            <div className="emoji" aria-hidden="true">
              🔍
            </div>
            <h2>{t("search.nothing.title")}</h2>
            <p>{t("search.nothing.text")}</p>
            <div className="actions">
              <button type="button" className="btn" onClick={reset}>
                {t("search.nothing.reset")}
              </button>
              <a className="btn" href={requestHref} target="_blank" rel="noopener noreferrer">
                {t("search.nothing.request")}
              </a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
