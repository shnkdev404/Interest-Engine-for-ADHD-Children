import { describe, expect, it } from "vitest";

import { ARJUN, ARJUN_MISSIONS } from "@/db/seed/arjun";
import { addWeeks } from "@/lib/dates";

import { scoreEngagement, scoreInterest, type InterestInfo, type MissionOutcome } from "./score";

const WEEK = "2026-10-05"; // evaluated (last completed) week
const weekOf = (i: number) => addWeeks(WEEK, i - 2);

const interests: InterestInfo[] = ARJUN.interests.map((i) => ({
  id: i.key,
  label: i.label,
  status: "active",
  startedAt: addWeeks(WEEK, -i.weeksAgoStarted),
}));

const outcomes: MissionOutcome[] = ARJUN_MISSIONS.map((m) => ({
  weekStart: weekOf(m.week),
  interestId: m.interest,
  format: m.format,
  status: m.outcome.status,
  minutes: m.outcome.minutes,
  note: m.outcome.note,
}));

describe("Arjun seed", () => {
  const report = scoreEngagement(interests, outcomes, WEEK);
  const mc = report.interests.find((i) => i.id === "minecraft")!;
  const ck = report.interests.find((i) => i.id === "cricket")!;

  it("Minecraft is fading by 41% from the logged minutes", () => {
    expect(mc.minutes.map((m) => m.minutes)).toEqual([125, 80, 60]);
    expect(mc.baseline).toBe(102.5);
    expect(mc.changePct).toBe(-41);
    expect(mc.negativeNote).toBe(true);
    expect(mc.state).toBe("fading");
  });

  it("cricket is holding", () => {
    expect(ck.minutes.map((m) => m.minutes)).toEqual([75, 75, 80]);
    expect(ck.state).toBe("holding");
  });

  it("short missions work; long reading and the quiz format are to avoid", () => {
    expect(report.formatsThatWork).toContain("short_mission");
    expect(report.formatsThatWork).not.toContain("reading_long");
    expect(report.formatsToAvoid).toEqual(expect.arrayContaining(["reading_long", "quiz"]));
  });
});

describe("scoreInterest edge cases", () => {
  const base: InterestInfo = { id: "x", label: "X", status: "active", startedAt: "2026-01-05" };
  const o = (week: number, minutes: number, status: MissionOutcome["status"] = "done", note?: string): MissionOutcome => ({
    weekStart: weekOf(week), interestId: "x", format: "build", status, minutes, note,
  });

  it("needs both baseline weeks", () => {
    expect(scoreInterest(base, [o(1, 40), o(2, 5)], WEEK).state).toBe("insufficient");
  });

  it("ignores tiny baselines", () => {
    expect(scoreInterest(base, [o(0, 10), o(1, 10), o(2, 0)], WEEK).state).toBe("insufficient");
  });

  it("a big drop without a completion drop or negative note is only dipping", () => {
    expect(scoreInterest(base, [o(0, 60), o(1, 60), o(2, 20)], WEEK).state).toBe("dipping");
  });

  it("a big drop with lower completion is fading", () => {
    const s = scoreInterest(base, [o(0, 60), o(1, 60), o(2, 20), o(2, 0, "skipped")], WEEK);
    expect(s.state).toBe("fading");
  });

  it("new interests are on trial for two weeks", () => {
    const fresh = { ...base, startedAt: addWeeks(WEEK, -1) };
    expect(scoreInterest(fresh, [o(0, 60), o(1, 60), o(2, 0, "skipped", "boring")], WEEK).state).toBe("trial");
  });

  it("skipped and hard-moment minutes don't count", () => {
    const s = scoreInterest(base, [o(0, 40), o(1, 40), o(2, 30, "meltdown"), o(2, 10)], WEEK);
    expect(s.minutes.at(-1)!.minutes).toBe(10);
  });
});
