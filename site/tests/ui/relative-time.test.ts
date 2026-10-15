import { describe, expect, it } from "vitest";
import { relativeDate } from "../../src/lib/relative-time";

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime();

describe("relativeDate", () => {
  it("reads a release dated today as today, late in the day too", () => {
    expect(relativeDate("2026-10-15", at(2026, 10, 15, 0))).toBe("today");
    expect(relativeDate("2026-10-15", at(2026, 10, 15, 23))).toBe("today");
  });

  it("counts calendar days, not elapsed hours", () => {
    expect(relativeDate("2026-10-14", at(2026, 10, 15, 1))).toBe("yesterday");
    expect(relativeDate("2026-10-12", at(2026, 10, 15, 12))).toBe("3 days ago");
  });

  it("returns the input for future or malformed dates", () => {
    expect(relativeDate("2026-10-16", at(2026, 10, 15, 12))).toBe("2026-10-16");
    expect(relativeDate("not a date")).toBe("not a date");
  });
});
