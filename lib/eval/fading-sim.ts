// Simulated engagement trajectories with known answers, for comparing the
// fading detectors (RESEARCH.md §2). Seeded, so results are reproducible.
import { addWeeks } from "@/lib/dates";
import { scoreInterest, scoreInterestV1, type InterestInfo, type MissionOutcome } from "@/lib/engagement/score";

export type Scenario = {
  name: string;
  fading: boolean; // ground truth
  // Per week, oldest first: [assigned, completion rate 0–1, minutes per done mission, negative note?, break week?]
  weeks: (rng: () => number) => [number, number, number, boolean?, boolean?][];
};

const jitter = (rng: () => number, base: number, spread: number) => Math.max(0, base + (rng() - 0.5) * 2 * spread);

export const SCENARIOS: Scenario[] = [
  {
    name: "stable",
    fading: false,
    weeks: (r) => Array.from({ length: 6 }, () => [4, jitter(r, 0.9, 0.1), jitter(r, 20, 4)]),
  },
  {
    name: "one bad week",
    fading: false,
    weeks: (r) => [
      ...Array.from({ length: 5 }, () => [4, jitter(r, 0.9, 0.1), jitter(r, 20, 3)] as [number, number, number]),
      [4, 0.5, jitter(r, 7, 2), r() < 0.5],
    ],
  },
  {
    name: "sick week marked as break",
    fading: false,
    weeks: (r) => [
      ...Array.from({ length: 5 }, () => [4, jitter(r, 0.9, 0.1), jitter(r, 20, 3)] as [number, number, number]),
      [4, 0.25, 4, true, true],
    ],
  },
  {
    name: "recovery after a dip",
    fading: false,
    weeks: (r) => [
      [4, 0.9, jitter(r, 20, 3)],
      [4, 0.9, jitter(r, 20, 3)],
      [4, 0.9, jitter(r, 20, 3)],
      [4, 0.5, jitter(r, 10, 2)],
      [4, 0.9, jitter(r, 19, 3)],
      [4, 0.9, jitter(r, 21, 3)],
    ],
  },
  {
    name: "gradual decline",
    fading: true,
    weeks: (r) => [24, 22, 20, 15, 12, 9].map((m, i) => [4, jitter(r, 0.95 - i * 0.08, 0.05), jitter(r, m, 2), i === 5 && r() < 0.6]),
  },
  {
    name: "sharp sustained drop",
    fading: true,
    weeks: (r) => [22, 22, 22, 22, 10, 8].map((m, i) => [4, i < 4 ? jitter(r, 0.9, 0.08) : jitter(r, 0.6, 0.1), jitter(r, m, 2), i >= 4 && r() < 0.5]),
  },
];

// mulberry32: tiny seeded PRNG.
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEK = "2026-10-05";
const INTEREST: InterestInfo = { id: "x", label: "X", status: "active", startedAt: "2026-01-05" };

export function materialise(weeks: ReturnType<Scenario["weeks"]>) {
  const outcomes: MissionOutcome[] = [];
  const paused = new Set<string>();
  weeks.forEach(([assigned, rate, mins, note, isBreak], i) => {
    const weekStart = addWeeks(WEEK, i - weeks.length + 1);
    if (isBreak) paused.add(weekStart);
    const done = Math.round(assigned * Math.min(1, rate));
    for (let k = 0; k < assigned; k++) {
      outcomes.push({
        weekStart,
        interestId: "x",
        format: "build",
        status: k < done ? "done" : "skipped",
        minutes: k < done ? Math.round(mins) : 0,
        note: k === 0 && note ? "said it was boring" : null,
      });
    }
  });
  return { outcomes, paused };
}

export type DetectorScore = { tp: number; fp: number; fn: number; tn: number; precision: number; recall: number; f1: number };
export type SimResult = {
  runs: number;
  byScenario: { name: string; truth: boolean; v1Flagged: number; v2Flagged: number; runs: number }[];
  v1: DetectorScore;
  v2: DetectorScore;
};

function score(tp: number, fp: number, fn: number, tn: number): DetectorScore {
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, tn, precision, recall, f1 };
}

export function simulate(runsPerScenario = 200, seed = 42): SimResult {
  const r = rng(seed);
  const c = { v1: [0, 0, 0, 0], v2: [0, 0, 0, 0] }; // tp, fp, fn, tn
  const byScenario = SCENARIOS.map((s) => {
    let v1Flagged = 0;
    let v2Flagged = 0;
    for (let i = 0; i < runsPerScenario; i++) {
      const { outcomes, paused } = materialise(s.weeks(r));
      const a = scoreInterestV1(INTEREST, outcomes, WEEK).state === "fading";
      const b = scoreInterest(INTEREST, outcomes, WEEK, paused).state === "fading";
      v1Flagged += Number(a);
      v2Flagged += Number(b);
      for (const [k, flagged] of [["v1", a], ["v2", b]] as const) {
        const idx = s.fading ? (flagged ? 0 : 2) : flagged ? 1 : 3;
        c[k][idx]++;
      }
    }
    return { name: s.name, truth: s.fading, v1Flagged, v2Flagged, runs: runsPerScenario };
  });
  return {
    runs: runsPerScenario * SCENARIOS.length,
    byScenario,
    v1: score(c.v1[0], c.v1[1], c.v1[2], c.v1[3]),
    v2: score(c.v2[0], c.v2[1], c.v2[2], c.v2[3]),
  };
}
