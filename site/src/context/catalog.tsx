// Loads catalog.json once and shares it. Pages go through <RequireCatalog>, which renders the loading
// and error states, so a page component can call useCatalog() and rely on the data being there.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet } from "react-router";
import type { Catalog } from "../lib/catalog";
import { loadCatalog } from "../lib/load-catalog";
import { t } from "../i18n";

export type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; catalog: Catalog };

interface CatalogContextValue {
  state: CatalogState;
  reload: () => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Skips the request; used by tests that render with a fixture catalog. */
  initial?: Catalog;
  /** Replaces the network loader (tests). */
  loader?: () => Promise<Catalog>;
}

export function CatalogProvider({ children, initial, loader = loadCatalog }: ProviderProps) {
  const [state, setState] = useState<CatalogState>(initial ? { status: "ready", catalog: initial } : { status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    loader().then(
      (catalog) => !cancelled && setState({ status: "ready", catalog }),
      (error: unknown) => !cancelled && setState({ status: "error", message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [initial, loader, attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  const value = useMemo(() => ({ state, reload }), [state, reload]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export const useCatalogState = (): CatalogContextValue => {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalogState must be used inside <CatalogProvider>");
  return ctx;
};

/** The loaded catalog. Only valid below <RequireCatalog>. */
export const useCatalog = (): Catalog => {
  const { state } = useCatalogState();
  if (state.status !== "ready") throw new Error("useCatalog called before the catalog was loaded");
  return state.catalog;
};

/** Layout route: shows the loading / error state, or the matched child route once the catalog is ready. */
export function RequireCatalog() {
  const { state, reload } = useCatalogState();
  if (state.status === "ready") return <Outlet />;
  return (
    <main id="main" className="page page--narrow" tabIndex={-1}>
      {state.status === "loading" ? (
        <p className="state-note" role="status" aria-busy="true">
          {t("state.loading")}
        </p>
      ) : (
        <div role="alert">
          <div className="eyebrow">{t("state.error.eyebrow")}</div>
          <h1 className="start-title">{t("state.error.title")}</h1>
          <p className="start-lead">{t("state.error.text", { message: state.message })}</p>
          <div className="narrow-actions">
            <button type="button" className="btn btn--accent btn--lg" onClick={reload}>
              {t("state.error.retry")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
