import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { RequireCatalog } from "./context/catalog";
import { t } from "./i18n";
import { ArtifactPage } from "./pages/Artifact";
import { GettingStarted } from "./pages/GettingStarted";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { PluginPage } from "./pages/Plugin";
import { WhatsNew } from "./pages/WhatsNew";

// The search page brings the MiniSearch index code; it is split off so the home page stays small.
const Search = lazy(() => import("./pages/Search").then((m) => ({ default: m.Search })));

function SearchRoute() {
  return (
    <Suspense
      fallback={
        <main id="main" className="page" tabIndex={-1}>
          <p className="state-note" role="status">
            {t("state.loading")}
          </p>
        </main>
      }
    >
      <Search />
    </Suspense>
  );
}

// Routes: spec section 6.2. GitHub Pages answers unknown paths with 404.html, a copy of index.html,
// so every one of these also works as a deep link.
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<RequireCatalog />}>
          <Route index element={<Home />} />
          <Route path="search" element={<SearchRoute />} />
          <Route path="plugins/:plugin" element={<PluginPage />} />
          <Route path="plugins/:plugin/:type/:name" element={<ArtifactPage />} />
          <Route path="getting-started" element={<GettingStarted />} />
          <Route path="whats-new" element={<WhatsNew />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
