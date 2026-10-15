import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import en from "../src/i18n/en.json" with { type: "json" };

const messages: Record<string, unknown> = en;

/**
 * Fills `%i18n:<key>%` placeholders in index.html from src/i18n/en.json, so the static shell
 * (title, description, <noscript>) uses the same single copy file as the components.
 */
export function i18nHtml(): Plugin {
  return {
    name: "catalog:i18n-html",
    transformIndexHtml(html) {
      return html.replace(/%i18n:([\w.]+)%/g, (_match, key: string) => {
        const value = messages[key];
        if (typeof value !== "string") throw new Error(`index.html: unknown i18n key "${key}"`);
        return value;
      });
    },
  };
}

/**
 * Production only: a Content-Security-Policy meta tag. Everything is served from the site's own
 * origin (fonts are self-hosted, no inline scripts or styles), so `default-src 'self'` is enough.
 * The dev server is skipped because it injects inline scripts (HMR preamble) of its own.
 */
export function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "catalog:csp",
    apply: "build",
    transformIndexHtml() {
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }];
    },
  };
}

/**
 * GitHub Pages has no server-side rewrites: an unknown path such as /plugins/dev-workflow/ is
 * answered with 404.html. Copying the SPA shell to 404.html makes every deep link load the app,
 * which then routes on the URL.
 */
export function spaFallback404(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "catalog:404-fallback",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const index = join(outDir, "index.html");
      if (existsSync(index)) copyFileSync(index, join(outDir, "404.html"));
    },
  };
}

export interface CatalogDevOptions {
  /** The site/ directory. */
  siteDir: string;
  /** Repository root to watch (and to build from; CATALOG_ROOT overrides it, like in build-catalog.mjs). */
  repoRoot: string;
  debounceMs?: number;
}

/**
 * Dev server only: watches ../plugins/** and ../.claude-plugin/**, re-runs the catalog build after a
 * quiet period and reloads the page. A failed build keeps the last good public/catalog.json
 * (the script writes nothing unless the whole build is valid); its `::error::` lines are printed.
 */
export function catalogDev({ siteDir, repoRoot, debounceMs = 300 }: CatalogDevOptions): Plugin {
  return {
    name: "catalog:dev-rebuild",
    apply: "serve",
    configureServer(server) {
      const root = resolve(process.env.CATALOG_ROOT ?? repoRoot);
      const watched = [join(root, "plugins"), join(root, ".claude-plugin")];
      server.watcher.add(watched);

      const log = (message: string) => server.config.logger.info(`[catalog] ${message}`);
      const isWatched = (file: string) => watched.some((dir) => resolve(file).startsWith(dir + sep));

      let timer: NodeJS.Timeout | undefined;
      let running = false;
      let pending = false;

      const rebuild = () => {
        if (running) {
          pending = true;
          return;
        }
        running = true;
        log("change detected, rebuilding catalog.json ...");
        const child = spawn(process.execPath, [join(siteDir, "scripts", "build-catalog.mjs")], {
          cwd: siteDir,
          env: process.env,
        });
        let output = "";
        child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
        child.on("close", (code) => {
          running = false;
          const lines = output.split(/\r?\n/).filter(Boolean);
          if (code === 0) {
            for (const line of lines) log(line);
            log("catalog rebuilt, reloading.");
            server.ws.send({ type: "full-reload", path: "*" });
          } else {
            // The `::error::` lines are the build's own diagnostics; show them unchanged.
            for (const line of lines) server.config.logger.error(line, { timestamp: true });
            log("rebuild failed, keeping the last good catalog.json.");
          }
          if (pending) {
            pending = false;
            rebuild();
          }
        });
      };

      server.watcher.on("all", (_event, file) => {
        if (!isWatched(file)) return;
        clearTimeout(timer);
        timer = setTimeout(rebuild, debounceMs);
      });
      server.httpServer?.once("close", () => clearTimeout(timer));
      log(`watching ${watched.join(" and ")}`);
    },
  };
}
