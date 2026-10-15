/**
 * Delta between two labeled `eval:repeat --label X` series — the "before vs after a change"
 * view, each side backed by N runs. Diffs at three levels: per-test pass rate, per-practice
 * (the primary signal — which practice improved/regressed), and metrics (median change, and
 * whether the candidate median falls outside the baseline's [min, max]).
 *
 *   npm run eval:repeat -- plugins/engineering-paved-path/evals/onion-architecture -n 5 --label baseline   # BEFORE the edit
 *   ...edit...
 *   npm run eval:repeat -- plugins/engineering-paved-path/evals/onion-architecture -n 5 --label candidate  # AFTER
 *   npm run eval:delta -- baseline candidate
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GREEN, RED, DIM, RESET } from "./ansi.js";
import { RESULTS_DIR } from "./artifacts/paths.js";
import {
  formatMetric,
  METRIC_LABELS,
  type MetricKey,
  type NodeAggregate,
  type Series,
  type Stats,
} from "./records/stats.js";

interface RepeatFile {
  label: string;
  git_sha: string;
  dirty: boolean;
  times: number;
  tests: Record<string, NodeAggregate>;
}

function load(label: string): RepeatFile {
  const file = join(RESULTS_DIR, `repeat-${label}.json`);
  if (!existsSync(file)) {
    console.error(`No repeat run for '${label}'. Run: npm run eval:repeat -- <pattern> -n <N> --label ${label}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

const rate = (s?: Series) => (s ? Math.round(s.rate * 100) : null);
const fmtRate = (p: number | null) => (p === null ? "  —" : `${p}`.padStart(3));

/** baseline → candidate with a colored delta; null side renders as `—`. */
function rateRow(indent: string, label: string, a?: Series, b?: Series): void {
  const pa = rate(a);
  const pb = rate(b);
  const d = pa !== null && pb !== null ? pb - pa : null;
  const col = d === null ? DIM : d > 0 ? GREEN : d < 0 ? RED : DIM;
  const dStr = d === null ? "n/a" : d > 0 ? `+${d}` : `${d}`;
  console.log(`${indent}${fmtRate(pa)}% -> ${fmtRate(pb)}%  ${col}Δ ${dStr.padStart(4)}${RESET}  ${label}`);
}

/** Metrics compared by median; older repeat files lack the cost/cache ones (and `median` itself). */
const DELTA_METRICS: MetricKey[] = [
  "apiCalls",
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheCreationTokens",
  "costUsd",
  "numTurns",
  "toolCallCount",
  "durationMs",
];

/**
 * Median change for one metric, plus whether the candidate's median falls outside the baseline's
 * observed [min, max] (a rough noise check: inside the range it could just be run-to-run spread).
 * Skipped when either side has no data for it (e.g. a repeat file saved before the metric existed).
 */
function metricRow(key: MetricKey, a?: Stats, b?: Stats): void {
  if (!a || !b || a.median === undefined || b.median === undefined || a.n === 0 || b.n === 0) return;
  const f = (v: number) => formatMetric(key, v);
  const d = b.median - a.median;
  const col = d === 0 ? DIM : d < 0 ? GREEN : RED; // fewer tokens/turns/ms/dollars is better
  const sign = d > 0 ? "+" : d < 0 ? "-" : "";
  const pct = a.median === 0 ? "n/a" : `${sign}${Math.abs((d / a.median) * 100).toFixed(0)}%`;
  const outside = b.median < a.min || b.median > a.max;
  const verdict = outside ? `${col}outside baseline range${RESET}` : `${DIM}within noise${RESET}`;
  console.log(
    `      ${METRIC_LABELS[key].padEnd(11)}: ${f(a.median)} -> ${f(b.median)}  ` +
      `${col}(${sign}${f(Math.abs(d))}, ${pct})${RESET}  ${verdict} ${DIM}[${f(a.min)}–${f(a.max)}]${RESET}`,
  );
}

function main(): void {
  const [labelA, labelB] = process.argv.slice(2);
  if (!labelA || !labelB) {
    console.error("usage: npm run eval:delta -- <baseline-label> <candidate-label>");
    process.exit(1);
  }
  const a = load(labelA);
  const b = load(labelB);
  console.log(`A = ${labelA}  sha ${a.git_sha}${a.dirty ? "-dirty" : ""}  (${a.times} runs)`);
  console.log(`B = ${labelB}  sha ${b.git_sha}${b.dirty ? "-dirty" : ""}  (${b.times} runs)`);

  // Pair tests by CASE NAME, not full nodeid: the nodeid embeds the file and the artifact
  // (`agent:architecture-reviewer > …` vs `agent:architecture-reviewer-lite > …`), so an A/B of two
  // artifacts sharing one case list would otherwise never line up.
  const byCase = (tests: RepeatFile["tests"]) =>
    Object.fromEntries(Object.entries(tests).map(([id, t]) => [id.split(" > ").slice(-1)[0], t]));
  const testsA = byCase(a.tests);
  const testsB = byCase(b.tests);
  const names = [...new Set([...Object.keys(testsA), ...Object.keys(testsB)])].sort();
  for (const shortId of names) {
    const ta = testsA[shortId];
    const tb = testsB[shortId];
    rateRow("\n  ", shortId, ta?.pass, tb?.pass);

    const practiceTexts = [...new Set([...Object.keys(ta?.practices ?? {}), ...Object.keys(tb?.practices ?? {})])];
    for (const text of practiceTexts) {
      const t = text.length > 70 ? text.slice(0, 67) + "…" : text;
      rateRow("      ", t, ta?.practices[text], tb?.practices[text]);
    }
    if (ta && tb) {
      for (const key of DELTA_METRICS) metricRow(key, ta.metrics[key], tb.metrics[key]);
    }
  }
}

main();
