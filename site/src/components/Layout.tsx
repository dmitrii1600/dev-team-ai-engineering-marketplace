import { Suspense, lazy, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { Header } from "./Header";
import { Hotkeys } from "./Hotkeys";
import { useUi } from "../context/ui";
import { t } from "../i18n";
import { useTrackNavigation } from "../lib/page";

// The palette (and with it the search index code) is only fetched the first time it is opened.
const loadPalette = () => import("./Palette").then((m) => ({ default: m.Palette }));
const Palette = lazy(loadPalette);

// After a route change the page starts at the top and keyboard / screen-reader focus moves to <main>.
function RouteChange() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useTrackNavigation();
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo?.(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

export function Layout() {
  const { paletteOpen } = useUi();

  // Fetch the palette in the background shortly after load, so the first Ctrl+K opens it instantly.
  useEffect(() => {
    const id = window.setTimeout(() => void loadPalette(), 1500);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">
        {t("common.skipToContent")}
      </a>
      <Header />
      <Outlet />
      {paletteOpen && (
        <Suspense fallback={null}>
          <Palette />
        </Suspense>
      )}
      <Hotkeys />
      <RouteChange />
    </>
  );
}
