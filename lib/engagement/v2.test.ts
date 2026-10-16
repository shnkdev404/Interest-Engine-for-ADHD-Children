import { describe, expect, it } from "vitest";

import { addWeeks } from "@/lib/dates";

import { scoreInterest, scoreInterestV1, type InterestInfo, type MissionOutcome } from "./score";
import { cusumShortfall, probCompletionDrop, theilSen } from "./stats";

const WEEK = "2026-10-05";
const I: InterestInfo = { id: "x", label: "X", status: "active", startedAt: "2026-01-05" };

// weeks: oldest first, each [assigned, done, minutesPerDone, note?]
function series(weeks: [number, number, number, string?][]): MissionOutcome[] {
  return weeks.flatMap(([assigned, done, mins, note], i) => {
    const weekStart = addWeeks(WEEK, i - weeks.length + 1);
    return Array.from({ length: assigned }, (_, k) => ({
      weekStart,
      interestId: "x",
      format: "build" as const,
      status: k < done ? ("done" as const) : ("skipped" as const),
      minutes: k < done ? mins : 0,
      note: k === 0 ? (note ?? null) : null,
    }));
  });
}

describe("stats", () => {
  it("probCompletionDrop is high for a clear drop and low for none", () => {
    expect(probCompletionDrop({ done: 9, assigned: 10 }, { done: 2, assigned: 10 })).toBeGreaterThan(0.95);
    expect(probCompletionDrop({ done: 8, assigned: 10 }, { done: 8, assigned: 10 })).toBeLessThan(0.2);
  });

  it("CUSUM ignores one bad week but flags a sustained shortfall", () => {
    expect(cusumShortfall([25, 12, 25, 25], 25)).toBeLessThan(0.35);
    expect(cusumShortfall([18, 15, 12], 25)).toBeGreaterThan(0.35);
  });

  it("Theil–Sen is robust to one outlier", () => {
    expect(theilSen([10, 10, 10, 100, 10, 10])).toBe(0);
    expect(theilSen([40, 30, 20, 10])).toBe(-10);
  });
});

describe("fading v2 vs v1", () => {
  it("one bad week: v1 flags fading, v2 does not", () => {
    const o = series([[4, 4, 20], [4, 4, 20], [4, 4, 20], [4, 4, 20], [4, 3, 6, "didn't want to"]]);
    expect(scoreInterestV1(I, o, WEEK).state).toBe("fading");
    expect(scoreInterest(I, o, WEEK).state).not.toBe("fading");
  });

  it("gradual decline over several weeks is fading with high confidence", () => {
    const o = series([[4, 4, 25], [4, 4, 22], [4, 3, 17], [4, 3, 13], [4, 2, 10, "bored"]]);
    const s = scoreInterest(I, o, WEEK);
    expect(s.state).toBe("fading");
    expect(s.confidence).toBe("high");
    expect(s.trendPerWeek).toBeLessThan(0);
  });

  it("a break week is skipped instead of looking like a drop", () => {
    // Week 4 had no missions because of a holiday; marked as a break.
    const o = series([[4, 4, 20], [4, 4, 20], [4, 4, 20], [0, 0, 0], [4, 4, 20]]);
    const paused = new Set([addWeeks(WEEK, -1)]);
    const s = scoreInterest(I, o, WEEK, paused);
    expect(s.state).toBe("holding");
    expect(s.minutes.map((m) => m.weekStart)).not.toContain(addWeeks(WEEK, -1));
  });

  it("recovery after a dip reads as holding", () => {
    const o = series([[4, 4, 20], [4, 4, 20], [4, 2, 10], [4, 4, 20], [4, 4, 21]]);
    expect(scoreInterest(I, o, WEEK).state).toBe("holding");
  });
});
