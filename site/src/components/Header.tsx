import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router";
import siteConfig from "../../site.config.json";
import { useUi } from "../context/ui";
import { t } from "../i18n";
import { EMPTY_STATE, parseSearchParams, toSearchString } from "../lib/search-state";
import { useTheme } from "../lib/theme";

const repoUrl = `https://github.com/${siteConfig.repo}`;
const isMac = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const LIVE_SEARCH_DEBOUNCE_MS = 100;

/**
 * The header field. On /search it is the query box of the page: results update while typing (100 ms
 * debounce, replacing the history entry). Anywhere else, submitting opens /search?q=...
 */
function HeaderSearch() {
  const navigate = useNavigate();
  const { pathname, search: currentSearch } = useLocation();
  const [params] = useSearchParams();
  const onSearchPage = pathname === "/search";
  const urlQuery = onSearchPage ? (params.get("q") ?? "") : "";

  const [value, setValue] = useState(urlQuery);
  // The last value this field wrote to the URL; lets us tell our own update from a back/forward or a reset.
  const committed = useRef(urlQuery);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (urlQuery !== committed.current) {
      committed.current = urlQuery;
      setValue(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (query: string, replace: boolean) => {
    committed.current = query;
    const state = onSearchPage ? { ...parseSearchParams(params), q: query } : { ...EMPTY_STATE, q: query };
    const search = toSearchString(state);
    if (onSearchPage && search === currentSearch) return;
    void navigate({ pathname: "/search", search }, { replace });
  };

  const onChange = (next: string) => {
    setValue(next);
    if (!onSearchPage) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(next, true), LIVE_SEARCH_DEBOUNCE_MS);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    window.clearTimeout(timer.current);
    commit(value, false);
  };

  return (
    <form className="header-search" role="search" onSubmit={onSubmit}>
      <span className="search-glyph" aria-hidden="true">
        ⌕
      </span>
      <input
        id="site-search"
        type="text"
        name="q"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("header.searchPlaceholder")}
        aria-label={t("header.searchLabel")}
        autoComplete="off"
        enterKeyHint="search"
      />
    </form>
  );
}

/** Mobile menu: closes on outside click, Escape and navigation. */
function NavMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const menu = ref.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details className="nav-menu" ref={ref}>
      <summary className="icon-btn" aria-label={t("header.menu")}>
        ☰
      </summary>
      <div className="nav-menu-panel">
        <NavLink to="/search">{t("nav.browse")}</NavLink>
        <NavLink to="/getting-started">{t("nav.gettingStarted")}</NavLink>
        <NavLink to="/whats-new">{t("nav.whatsNew")}</NavLink>
        <a href={repoUrl} target="_blank" rel="noopener noreferrer">
          {t("header.github")}
        </a>
      </div>
    </details>
  );
}

export function Header() {
  const { openPalette } = useUi();
  const { theme, toggle } = useTheme();

  return (
    <header className="site-header">
      <Link className="brand" to="/">
        <span className="brand-mark" aria-hidden="true">
          ◆
        </span>
        <span className="brand-name">{t("brand.name")}</span>
        <span className="brand-badge" title={siteConfig.marketplaceName}>
          {siteConfig.marketplaceName}
        </span>
      </Link>

      <HeaderSearch />
      <span className="header-spacer"></span>

      <nav className="header-nav" aria-label={t("nav.label")}>
        <NavLink to="/getting-started">{t("nav.gettingStarted")}</NavLink>
        <NavLink to="/whats-new">{t("nav.whatsNew")}</NavLink>
      </nav>

      <button type="button" className="icon-btn icon-btn--kbd" onClick={openPalette} aria-label={t("header.openPalette")}>
        <span>{isMac() ? t("header.kbdMac") : t("header.kbdOther")}</span>
      </button>
      <button type="button" className="icon-btn search-icon-btn" onClick={openPalette} aria-label={t("header.searchLabel")}>
        ⌕
      </button>
      <button type="button" className="icon-btn" onClick={toggle} aria-label={t("header.toggleTheme")}>
        {theme === "light" ? "☀" : "☾"}
      </button>
      <a className="header-github header-github--inline" href={repoUrl} target="_blank" rel="noopener noreferrer">
        {t("header.github")}
      </a>

      <NavMenu />
    </header>
  );
}
