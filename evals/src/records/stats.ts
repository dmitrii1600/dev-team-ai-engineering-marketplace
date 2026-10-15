/**
 * Pure statistics over persisted records — no model, no I/O beyond reading records.jsonl.
 * The math lives here and is unit-tested in stats.test.ts; repeat/delta/benchmark only assemble
 * their own output shapes on top of these primitives.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RESULTS_DIR } from "../artifacts/paths.js";
import { FLAKY_LOW, FLAKY_HIGH, COST_REGRESSION_RATIO } from "../config.js";

const RECORDS = join(RESULTS_DIR, "records.jsonl");

export interface Stats {
  mean: number;
  /** Middle value (mean of the two middle values for even n) — robust to a single outlier run. */
  median: number;
  stddev: number;
  min: number;
  max: number;
  n: number;
}

/** Sample standard deviation (n−1). Empty → all zeros with n=0; consumers decide by `n`. */
export function calcStats(values: number[]): Stats {
  const n = values.length;
  if (n === 0) return { mean: 0, median: 0, stddev: 0, min: 0, max: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const stddev = n < 2 ? 0 : Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return { mean, median, stddev, min, max, n };
}

export interface PracticeVerdict {
  practice: string;
  passed: boolean;
  evidence: string;
}

export interface EvalRecord {
  schema: number;
  run_id: string;
  git_sha: string;
  dirty: boolean;
  config: string;
  nodeid: string;
  label: string;
  outcome: boolean;
  score?: number;
  threshold?: number;
  practices: PracticeVerdict[];
  grounded?: number;
  num_turns: number;
  /** The cache/apiCalls/costUsd fields are absent in records written before they were tracked. */
  metrics: {
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    apiCalls?: number;
    toolCallCount: number;
    costUsd?: number;
  };
  trace: { tools: string[]; subagents: string[]; skills: string[]; reads: string[] };
  output_file: string;
}

/** Count the lines currently in records.jsonl — a marker to slice "new since a run started". */
export function recordCount(): number {
  if (!existsSync(RECORDS)) return 0;
  return readFileSync(RECORDS, "utf8").split("\n").filter(Boolean).length;
}

/** Load records, optionally only those appended after `sinceLine`. */
export function loadRecords(sinceLine = 0): EvalRecord[] {
  if (!existsSync(RECORDS)) return [];
  return readFileSync(RECORDS, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(sinceLine)
    .map((l) => JSON.parse(l) as EvalRecord);
}

export interface Series {
  passed: number;
  total: number;
  rate: number;
}

const series = (passed: number, total: number): Series => ({ passed, total, rate: total ? passed / total : 0 });

export interface NodeAggregate {
  nodeid: string;
  label: string;
  pass: Series;
  /** Per practice text → pass series across the runs. Empty for workflow (no judge). */
  practices: Record<string, Series>;
  metrics: Record<MetricKey, Stats>;
}

/** Every per-run metric that `aggregate` summarizes, in display order. */
export const METRIC_KEYS = [
  "numTurns",
  "apiCalls",
  "toolCallCount",
  "durationMs",
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheCreationTokens",
  "costUsd",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Short display names for console output. */
export const METRIC_LABELS: Record<MetricKey, string> = {
  numTurns: "turns",
  apiCalls: "api_calls",
  toolCallCount: "tool_calls",
  durationMs: "duration",
  inputTokens: "tok_in",
  outputTokens: "tok_out",
  cacheReadTokens: "cache_read",
  cacheCreationTokens: "cache_write",
  costUsd: "cost_usd",
};

/** Render one metric value: cost with 4 decimals (`$0.0123`), everything else as a rounded integer. */
export function formatMetric(key: MetricKey, value: number): string {
  return key === "costUsd" ? `$${value.toFixed(4)}` : value.toFixed(0);
}

/** One record's value for a metric; a field missing from an older record counts as 0. */
function metricValue(r: EvalRecord, key: MetricKey): number {
  const v = key === "numTurns" ? r.num_turns : r.metrics?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Aggregate a flat record list into per-nodeid stats. Pass a single config's records. */
export function aggregate(records: EvalRecord[]): Record<string, NodeAggregate> {
  const byNode = new Map<string, EvalRecord[]>();
  for (const r of records) {
    const arr = byNode.get(r.nodeid) ?? [];
    arr.push(r);
    byNode.set(r.nodeid, arr);
  }

  const out: Record<string, NodeAggregate> = {};
  for (const [nodeid, rows] of byNode) {
    const passed = rows.filter((r) => r.outcome).length;

    // Per-practice: count only rows where that practice was actually judged.
    const pPassed = new Map<string, number>();
    const pTotal = new Map<string, number>();
    for (const r of rows) {
      for (const pv of r.practices) {
        pTotal.set(pv.practice, (pTotal.get(pv.practice) ?? 0) + 1);
        if (pv.passed) pPassed.set(pv.practice, (pPassed.get(pv.practice) ?? 0) + 1);
      }
    }
    const practices: Record<string, Series> = {};
    for (const [text, total] of pTotal) practices[text] = series(pPassed.get(text) ?? 0, total);

    out[nodeid] = {
      nodeid,
      label: rows[rows.length - 1].label,
      pass: series(passed, rows.length),
      practices,
      metrics: Object.fromEntries(
        METRIC_KEYS.map((k) => [k, calcStats(rows.map((r) => metricValue(r, k)))]),
      ) as Record<MetricKey, Stats>,
    };
  }
  return out;
}

/** Split a record list by its `config` tag. */
export function byConfig(records: EvalRecord[]): Record<string, EvalRecord[]> {
  const out: Record<string, EvalRecord[]> = {};
  for (const r of records) (out[r.config] ??= []).push(r);
  return out;
}

export type Flag = "non_discriminating" | "always_failing" | "flaky" | "cost_regression" | "missing_data";

/**
 * Deterministic analyst flags for one candidate/baseline pair (a test or a practice). Empty
 * (n=0) and a measured zero are never conflated: n=0 → missing_data; n>0 rate 0 → always_failing.
 */
export function computeFlags(
  cand: Series | undefined,
  base: Series | undefined,
  opts: { candTokens?: number; baseTokens?: number } = {},
): Flag[] {
  const flags: Flag[] = [];
  const cn = cand?.total ?? 0;
  const bn = base?.total ?? 0;

  if (cn === 0 || bn === 0) flags.push("missing_data");

  const cr = cn ? cand!.rate : undefined;
  const br = bn ? base!.rate : undefined;
  if (cr !== undefined && br !== undefined) {
    if (cr === 1 && br === 1) flags.push("non_discriminating");
    if (cr === 0 && br === 0) flags.push("always_failing");
  }
  for (const r of [cr, br]) {
    if (r !== undefined && r > FLAKY_LOW && r < FLAKY_HIGH && !flags.includes("flaky")) flags.push("flaky");
  }
  const { candTokens, baseTokens } = opts;
  if (candTokens && baseTokens && candTokens > baseTokens * COST_REGRESSION_RATIO) flags.push("cost_regression");

  return flags;
}
