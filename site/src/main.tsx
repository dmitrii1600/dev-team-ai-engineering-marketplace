import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { CatalogProvider } from "./context/catalog";
import { ToastProvider } from "./context/toast";
import { UiProvider } from "./context/ui";

// Vite's base (/dev-team-ai-engineering-marketplace/) is the router's basename.
const basename = import.meta.env.BASE_URL.replace(/\/+$/, "");

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <CatalogProvider>
        <ToastProvider>
          <UiProvider>
            <App />
          </UiProvider>
        </ToastProvider>
      </CatalogProvider>
    </BrowserRouter>
  </StrictMode>,
);
