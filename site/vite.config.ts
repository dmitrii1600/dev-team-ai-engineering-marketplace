import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import siteConfig from "./site.config.json" with { type: "json" };
import { catalogDev, contentSecurityPolicy, i18nHtml, spaFallback404 } from "./vite/plugins.ts";

const siteDir = dirname(fileURLToPath(import.meta.url));

// The site is published as a GitHub Pages *project* site, so every URL lives under the base
// (site.config.json `basePath`, i.e. /dev-team-ai-engineering-marketplace/).
export default defineConfig({
  base: siteConfig.basePath,
  plugins: [
    react(),
    i18nHtml(),
    contentSecurityPolicy(),
    spaFallback404(),
    catalogDev({ siteDir, repoRoot: resolve(siteDir, "..") }),
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    // Fonts and images stay files: the CSP only allows 'self' (and no inline styles).
    assetsInlineLimit: 0,
  },
  test: {
    environment: "jsdom",
    include: ["tests/ui/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
});
