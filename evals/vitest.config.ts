import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

// Eval cases live next to the plugin they test (plugins/<plugin>/evals/<name>/*.eval.ts), so test
// discovery is rooted at the repository, not at this package. The harness (src/) and its
// node_modules stay here; plugin eval files import it by relative path.
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  test: {
    dir: REPO_ROOT,
    // *.eval.ts = model-backed evals; evals/src/**/*.test.ts = the pure stats unit tests.
    include: ["plugins/*/evals/**/*.eval.ts", "evals/**/*.eval.ts", "evals/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/fixtures/**", "site/**"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room. A long agent
    // report plus the judge can take several minutes on a small model.
    testTimeout: 480_000,
    hookTimeout: 480_000,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    reporters: ["default", new TrendReporter()],
  },
  server: {
    // Plugin eval files sit outside this package; allow vite to read them.
    fs: { allow: [REPO_ROOT] },
  },
});
