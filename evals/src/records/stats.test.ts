/**
 * The only non-model tests in the package — pure statistics math on fixed arrays.
 *   npx vitest run src/records/stats.test.ts
 */

import { describe, expect, test } from "vitest";
import { aggregate, calcStats, computeFlags, METRIC_KEYS, type EvalRecord } from "./stats.js";

const series = (passed: number, total: number) => ({ passed, total, rate: total ? passed / total : 0 });

describe("calcStats", () => {
  test("mean / min / max / sample stddev of a known array", () => {
    const s = calcStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.min).toBe(2);
    expect(s.max).toBe(9);
    // sample stddev (n−1) of this classic array ≈ 2.138 (population would be 2.0)
    expect(s.stddev).toBeCloseTo(2.138, 3);
    expect(s.n).toBe(8);
  });

  test("empty → zeros with n=0; singleton → stddev 0", () => {
    expect(calcStats([])).toEqual({ mean: 0, median: 0, stddev: 0, min: 0, max: 0, n: 0 });
    expect(calcStats([42])).toEqual({ mean: 42, median: 42, stddev: 0, min: 42, max: 42, n: 1 });
  });

  test("median of an odd count is the middle value, whatever the input order", () => {
    expect(calcStats([9, 1, 5]).median).toBe(5);
    expect(calcStats([100, 1, 2, 3, 4]).median).toBe(3); // an outlier moves the mean, not the median
  });

  test("median of an even count is the mean of the two middle values", () => {
    expect(calcStats([4, 1, 3, 2]).median).toBe(2.5);
    expect(calcStats([10, 20]).median).toBe(15);
  });

  test("median does not mutate its input", () => {
    const values = [3, 1, 2];
    calcStats(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("aggregate", () => {
  const base = {
    schema: 1,
    run_id: "r",
    git_sha: "abc",
    dirty: false,
    config: "candidate",
    nodeid: "f.eval.ts > agent:x > case",
    label: "case",
    outcome: true,
    practices: [],
    trace: { tools: [], subagents: [], skills: [], reads: [] },
    output_file: "outputs/r/case.md",
  };

  test("a record without the newer metric fields aggregates to finite zeros, not NaN", () => {
    // Shape of a record written before cache/apiCalls/costUsd were tracked.
    const old = {
      ...base,
      num_turns: 3,
      metrics: { durationMs: 1000, inputTokens: 10, outputTokens: 20, toolCallCount: 2 },
    } as EvalRecord;
    const agg = aggregate([old])[base.nodeid];
    for (const k of METRIC_KEYS) {
      for (const v of Object.values(agg.metrics[k])) expect(Number.isFinite(v)).toBe(true);
    }
    expect(agg.metrics.costUsd.median).toBe(0);
    expect(agg.metrics.apiCalls.n).toBe(1);
    expect(agg.metrics.outputTokens.median).toBe(20);
  });

  test("old and new records mix; medians cover every metric", () => {
    const mk = (cost: number | undefined, cacheRead: number | undefined, num_turns: number): EvalRecord =>
      ({
        ...base,
        num_turns,
        metrics: {
          durationMs: 1000,
          inputTokens: 10,
          outputTokens: 20,
          toolCallCount: 1,
          cacheReadTokens: cacheRead,
          cacheCreationTokens: 5,
          apiCalls: 2,
          costUsd: cost,
        },
      }) as EvalRecord;
    const agg = aggregate([mk(0.01, 100, 2), mk(0.03, 300, 4), mk(undefined, undefined, 3)])[base.nodeid];
    expect(agg.metrics.costUsd.median).toBe(0.01); // [0, 0.01, 0.03]
    expect(agg.metrics.cacheReadTokens.median).toBe(100); // [0, 100, 300]
    expect(agg.metrics.numTurns).toMatchObject({ median: 3, min: 2, max: 4 });
    expect(agg.metrics.apiCalls.median).toBe(2);
    expect(Object.keys(agg.metrics).sort()).toEqual([...METRIC_KEYS].sort());
  });
});

describe("computeFlags", () => {
  test("non_discriminating: 100% in both", () => {
    expect(computeFlags(series(5, 5), series(5, 5))).toContain("non_discriminating");
  });

  test("always_failing (n>0, rate 0) is NOT missing_data", () => {
    const flags = computeFlags(series(0, 5), series(0, 5));
    expect(flags).toContain("always_failing");
    expect(flags).not.toContain("missing_data");
  });

  test("missing_data (n=0) is NOT always_failing", () => {
    const flags = computeFlags(series(0, 0), series(0, 5));
    expect(flags).toContain("missing_data");
    expect(flags).not.toContain("always_failing");
  });

  test("flaky is exclusive of the 20% and 80% boundaries", () => {
    expect(computeFlags(series(1, 2), series(5, 5))).toContain("flaky"); // 50%
    expect(computeFlags(series(1, 5), series(5, 5))).not.toContain("flaky"); // exactly 20%
    expect(computeFlags(series(4, 5), series(5, 5))).not.toContain("flaky"); // exactly 80%
  });

  test("cost_regression when candidate tokens exceed 125% of baseline", () => {
    expect(computeFlags(series(5, 5), series(5, 5), { candTokens: 130, baseTokens: 100 })).toContain(
      "cost_regression",
    );
    expect(computeFlags(series(5, 5), series(5, 5), { candTokens: 120, baseTokens: 100 })).not.toContain(
      "cost_regression",
    );
  });
});
