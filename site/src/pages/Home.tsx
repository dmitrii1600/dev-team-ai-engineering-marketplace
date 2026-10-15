import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import siteConfig from "../../site.config.json";
import { Html } from "../components/Html";
import { useCatalog } from "../context/catalog";
import { t } from "../i18n";
import { tr } from "../i18n/rich";
import { KINDS, countOfKind, getReleases, pluginPath, pluginTitle, repoUrl, topTags, type EntryKind } from "../lib/catalog";
import { useDocumentTitle } from "../lib/page";
import { storage } from "../lib/storage";
import { toSearchString, EMPTY_STATE } from "../lib/search-state";

const STAT_TILES = ["plugin", "skill", "agent", "command", "mcp"] as const satisfies readonly EntryKind[];
const LATEST_RELEASES = 4;
const BANNER_KEY = "banner-dismissed";

export function Home() {
  const catalog = useCatalog();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [bannerDismissed, setBannerDismissed] = useState(() => storage.get(BANNER_KEY) === "1");
  useDocumentTitle(t("meta.homeTitle", { name: catalog.marketplace.name }));

  const { stats } = catalog;
  const empty = catalog.plugins.length === 0;
  const chips = topTags(catalog, 7);
  const latest = getReleases(catalog).slice(0, LATEST_RELEASES);
  const categories = Object.entries(stats.byCategory).sort((a, b) => a[0].localeCompare(b[0]));

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    void navigate({ pathname: "/search", search: toSearchString({ ...EMPTY_STATE, q: query }) });
  };

  return (
    <main id="main" className="page" tabIndex={-1}>
      <section className="hero">
        <div className="eyebrow">{t("home.hero.eyebrow")}</div>
        <h1>
          {t("home.hero.titleLine1")}
          <br />
          {t("home.hero.titleLine2")}
        </h1>
        <p>{t("home.hero.subtitle")}</p>
        <form className="hero-search" role="search" onSubmit={onSearch}>
          <span className="search-glyph" aria-hidden="true">
            ⌕
          </span>
          <input
            type="text"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
            aria-label={t("header.searchLabel")}
            placeholder={t("home.hero.searchPlaceholder")}
          />
        </form>
        {chips.length > 0 && (
          <div className="chip-row">
            {chips.map((tag) => (
              <Link className="chip" key={tag} to={{ pathname: "/search", search: toSearchString({ ...EMPTY_STATE, kws: [tag] }) }}>
                #{tag}
              </Link>
            ))}
          </div>
        )}
      </section>

      {empty ? (
        <section className="empty-catalog">
          <div className="emoji" aria-hidden="true">
            📦
          </div>
          <h2>{t("home.empty.title")}</h2>
          <p>{t("home.empty.text")}</p>
          <div className="actions">
            <Link className="btn btn--accent btn--lg" to="/getting-started">
              {t("home.empty.getStarted")}
            </Link>
            <a
              className="btn btn--lg"
              href={`${repoUrl(catalog)}/blob/${siteConfig.defaultBranch}/CONTRIBUTING.md`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("home.empty.contributing")}
            </a>
          </div>
        </section>
      ) : (
        <>
          {!bannerDismissed && (
            <div className="banner">
              <Link className="banner-link" to="/getting-started">
                <span className="dot" aria-hidden="true"></span>
                <span>{tr("home.banner", {}, { strong: (c) => <strong>{c}</strong> })}</span>
              </Link>
              <button
                type="button"
                className="banner-close"
                aria-label={t("home.bannerDismiss")}
                onClick={() => {
                  storage.set(BANNER_KEY, "1");
                  setBannerDismissed(true);
                }}
              >
                ×
              </button>
            </div>
          )}

          <section className="home-section--stats" aria-label={t("home.statsLabel")}>
            <div className="stats">
              {STAT_TILES.map((kind) => {
                const n = countOfKind(catalog, kind);
                return (
                  <Link
                    key={kind}
                    className={n === 0 ? "stat is-zero" : "stat"}
                    to={{ pathname: "/search", search: `?type=${kind}` }}
                  >
                    <span className="stat-count">{n}</span>
                    <span className="stat-label">{t(`stat.${kind}`, { count: n })}</span>
                  </Link>
                );
              })}
            </div>
            <p className="stats-meta">
              {stats.lastRelease
                ? t("home.statsMetaRelease", { date: stats.lastRelease, commit: catalog.commit.slice(0, 7) })
                : t("home.statsMeta", { commit: catalog.commit.slice(0, 7) })}
            </p>
            {categories.length > 0 && (
              <div className="category-row">
                <span className="label">{t("home.byCategory")}</span>
                {categories.map(([name, n]) => (
                  <Link className="chip" key={name} to={{ pathname: "/search", search: `?category=${encodeURIComponent(name)}` }}>
                    {t("home.categoryChip", { name, count: n })}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="home-section">
            <div className="section-head">
              <h2>{t("home.whatsNew")}</h2>
              <Link to="/whats-new">{t("home.fullFeed")}</Link>
            </div>
            {latest.length === 0 ? (
              <p className="empty-note">{t("whatsNew.empty")}</p>
            ) : (
              <div className="release-list">
                {latest.map((r) => (
                  <Link className="release-row" key={`${r.plugin.name}@${r.version}`} to={pluginPath(r.plugin.name)}>
                    <span className="badge k-plugin">{t("common.version", { version: r.version })}</span>
                    <span className="body">
                      <span className="name">{pluginTitle(r.plugin)}</span>
                      <Html as="span" className="summary" html={r.summaryHtml} />
                    </span>
                    <span className="date">{r.date}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="section-title section-title--lg">{t("home.browseByType")}</h2>
            <div className="type-row">
              {KINDS.map((kind) => (
                <Link
                  className={`type-chip k-${kind}`}
                  key={kind}
                  to={{ pathname: "/search", search: `?type=${kind}` }}
                >
                  <span className="dot dot--lg" aria-hidden="true"></span>
                  <span className="label">{t(`kind.plural.${kind}`)}</span>
                  <span className="count">{countOfKind(catalog, kind)}</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
