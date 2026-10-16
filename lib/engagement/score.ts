// Deterministic engagement scoring (DESIGN.md §4, D-08). The agent reads this
// output and never computes the numbers itself, so "dropped 41%" is the same
// on every load and traceable to logged data.
//
// v2 (RESEARCH.md §2): up to 8 weeks, adult-marked break weeks skipped, and
// fading needs a *sustained* signal — a CUSUM on time per mission or a
// Beta-Binomial completion drop — plus corroboration (a completion drop or a
// negative note). v1 is kept for the evaluation harness.
import { addWeeks } from "@/lib/dates";

import { cusumShortfall, probCompletionDrop, theilSen } from "./stats";

export type Format =
  | "short_mission"
  | "build"
  | "movement"
  | "reading_short"
  | "reading_long"
  | "screen_free"
  | "quiz";

export type OutcomeStatus = "done" | "partial" | "skipped" | "meltdown";

// One assigned mission and what happened (status null = never logged).
export type MissionOutcome = {
  weekStart: string;
  interestId: string | null;
  format: Format;
  status: OutcomeStatus | null;
  minutes: number;
  note?: string | null;
};

export type InterestInfo = {
  id: string;
  label: string;
  status: "active" | "fading" | "paused" | "trial" | "dormant";
  startedAt: string;
  resurfaceOn?: string | null;
};

export type InterestState = "fading" | "holding" | "dipping" | "trial" | "insufficient";

export type InterestScore = {
  id: string;
  label: string;
  minutes: { weekStart: string; minutes: number }[]; // oldest first, last 3 active weeks
  baseline: number | null;
  changePct: number | null;
  completion: number | null;
  prevCompletion: number | null;
  negativeNote: boolean;
  state: InterestState;
  // v2 evidence, shown to the adult as plain-language signals.
  activeWeeks: number;
  signals: {
    sustainedDrop: boolean; // CUSUM on minutes per mission over the alarm level
    cusum: number;
    completionDropProb: number; // P(recent completion < early − 15 points)
    negativeNote: boolean;
  };
  confidence: "high" | "medium" | null; // only when fading
  trendPerWeek: number; // Theil–Sen slope of weekly minutes, last 6 active weeks
};

export type DormantInterest = { id: string; label: string; resurfaceOn: string | null; due: boolean };

export type FormatScore = {
  format: Format;
  assigned: number;
  done: number;
  completion: number;
  minutesPerMission: number;
  hardMoments: number;
};

export type EngagementReport = {
  weekStart: string;
  pausedWeeks: string[];
  interests: InterestScore[];
  dormant: DormantInterest[];
  formats: FormatScore[];
  formatsThatWork: Format[];
  formatsToAvoid: Format[];
};

export const THRESHOLDS = {
  minBaselineMinutes: 30,
  fadingChange: -0.3,
  holdingChange: -0.15,
  trialWeeks: 2,
  formatWorksCompletion: 0.7,
  formatMinMissions: 2,
  formatAvoidCompletion: 0.5,
  horizonWeeks: 8,
  cusumSlack: 0.1,
  cusumAlarm: 0.35,
  completionDropMargin: 0.15,
  completionDropProb: 0.8,
  sustainedShortfall: 0.25, // each recent week ≥ 25% under early minutes per mission
  sustainedCompletionGap: 0.1, // each recent week ≥ 10 points under early completion
  restWeeks: 3,
} as const;

const NEGATIVE_NOTE = /\b(boring|bored|didn'?t want|doesn'?t want|don'?t want|hates?|hated|refused|not into|sick of|over it)\b/i;

const counts = (s: OutcomeStatus | null) => s === "done" || s === "partial";

function completionOf(list: MissionOutcome[]): number | null {
  if (!list.length) return null;
  return list.filter((m) => m.status === "done").length / list.length;
}

// v1: three fixed weeks and a single-week % drop. Kept for comparison only.
export function scoreInterestV1(
  interest: InterestInfo,
  outcomes: MissionOutcome[],
  weekStart: string,
): { state: InterestState; changePct: number | null } {
  const weeks = [addWeeks(weekStart, -2), addWeeks(weekStart, -1), weekStart];
  const mine = outcomes.filter((o) => o.interestId === interest.id);
  const inWeek = (w: string) => mine.filter((o) => o.weekStart === w);
  const [m2, m1, m0] = weeks.map((w) => inWeek(w).reduce((s, o) => s + (counts(o.status) ? o.minutes : 0), 0));
  const hasBaselineWeeks = inWeek(weeks[0]).length > 0 && inWeek(weeks[1]).length > 0;
  const baseline = hasBaselineWeeks ? (m2 + m1) / 2 : null;
  const change = baseline ? (m0 - baseline) / baseline : null;
  const changePct = change === null ? null : Math.round(change * 100);
  const completion = completionOf(inWeek(weekStart));
  const prevCompletion = completionOf(inWeek(weeks[1]));
  const negativeNote = inWeek(weekStart).some((o) => o.note && NEGATIVE_NOTE.test(o.note));

  const trialEnds = addWeeks(interest.startedAt, THRESHOLDS.trialWeeks);
  if (interest.status === "trial" || weekStart < trialEnds) return { state: "trial", changePct };
  if (baseline === null || change === null || baseline < THRESHOLDS.minBaselineMinutes) {
    return { state: "insufficient", changePct };
  }
  const completionDropped = completion !== null && prevCompletion !== null && completion < prevCompletion;
  if (change <= THRESHOLDS.fadingChange && (completionDropped || negativeNote)) return { state: "fading", changePct };
  if (change > THRESHOLDS.holdingChange) return { state: "holding", changePct };
  return { state: "dipping", changePct };
}

type WeekPoint = { weekStart: string; assigned: number; done: number; minutes: number; negativeNote: boolean };

export function scoreInterest(
  interest: InterestInfo,
  outcomes: MissionOutcome[],
  weekStart: string,
  pausedWeeks: ReadonlySet<string> = new Set(),
): InterestScore {
  const mine = outcomes.filter((o) => o.interestId === interest.id);
  const weeks = Array.from({ length: THRESHOLDS.horizonWeeks }, (_, i) =>
    addWeeks(weekStart, i - THRESHOLDS.horizonWeeks + 1),
  ).filter((w) => !pausedWeeks.has(w));

  // Weeks this interest was actually used, break weeks already removed.
  const points: WeekPoint[] = weeks
    .map((w) => {
      const list = mine.filter((o) => o.weekStart === w);
      return {
        weekStart: w,
        assigned: list.length,
        done: list.filter((o) => o.status === "done").length,
        minutes: list.reduce((s, o) => s + (counts(o.status) ? o.minutes : 0), 0),
        negativeNote: list.some((o) => !!o.note && NEGATIVE_NOTE.test(o.note)),
      };
    })
    .filter((p) => p.assigned > 0);

  // Display numbers: the latest active week against the two before it.
  const last3 = points.slice(-3);
  const minutes = last3.map((p) => ({ weekStart: p.weekStart, minutes: p.minutes }));
  const baseline = last3.length === 3 ? (last3[0].minutes + last3[1].minutes) / 2 : null;
  const latest = last3.at(-1);
  const prev = last3.at(-2);
  const change = baseline && latest ? (latest.minutes - baseline) / baseline : null;
  const completion = latest ? latest.done / latest.assigned : null;
  const prevCompletion = prev ? prev.done / prev.assigned : null;

  // Windows: recent = last two active weeks; early = up to three before them.
  const n = points.length;
  const recent = points.slice(-2);
  const early = n >= 3 ? points.slice(0, Math.min(3, n - 2)) : [];
  const sum = (xs: WeekPoint[], k: "assigned" | "done" | "minutes") => xs.reduce((s, p) => s + p[k], 0);

  const earlyWeekly = early.length ? sum(early, "minutes") / early.length : 0;
  const earlyPerMission = early.length ? sum(early, "minutes") / sum(early, "assigned") : 0;
  const cusum = early.length
    ? cusumShortfall(
        points.slice(early.length).map((p) => p.minutes / p.assigned),
        earlyPerMission,
        THRESHOLDS.cusumSlack,
      )
    : 0;
  const completionDropProb = early.length
    ? probCompletionDrop(
        { done: sum(early, "done"), assigned: sum(early, "assigned") },
        { done: sum(recent, "done"), assigned: sum(recent, "assigned") },
        THRESHOLDS.completionDropMargin,
      )
    : 0;
  const negativeNote = recent.some((p) => p.negativeNote);
  // Both signals need BOTH recent weeks clearly worse than the early window,
  // so one very bad week can't trip them (found by the simulation, lib/eval).
  const earlyRate = early.length ? sum(early, "done") / sum(early, "assigned") : 0;
  const twoWeeks = recent.length === 2;
  const sustainedDrop =
    cusum > THRESHOLDS.cusumAlarm &&
    twoWeeks &&
    recent.every((p) => p.minutes / p.assigned < earlyPerMission * (1 - THRESHOLDS.sustainedShortfall));
  const bigCompletionDrop =
    completionDropProb > THRESHOLDS.completionDropProb &&
    twoWeeks &&
    recent.every((p) => p.done / p.assigned < earlyRate - THRESHOLDS.sustainedCompletionGap);

  const base = {
    id: interest.id,
    label: interest.label,
    minutes,
    baseline,
    changePct: change === null ? null : Math.round(change * 100),
    completion,
    prevCompletion,
    negativeNote,
    activeWeeks: n,
    signals: {
      sustainedDrop,
      cusum: Number(cusum.toFixed(2)),
      completionDropProb: Number(completionDropProb.toFixed(2)),
      negativeNote,
    },
    confidence: null,
    trendPerWeek: Number(theilSen(points.slice(-6).map((p) => p.minutes)).toFixed(1)),
  };

  const trialEnds = addWeeks(interest.startedAt, THRESHOLDS.trialWeeks);
  if (interest.status === "trial" || weekStart < trialEnds) return { ...base, state: "trial" };
  if (!early.length || earlyWeekly < THRESHOLDS.minBaselineMinutes) return { ...base, state: "insufficient" };

  const completionDropped =
    bigCompletionDrop || (completion !== null && prevCompletion !== null && completion < prevCompletion);
  if ((sustainedDrop || bigCompletionDrop) && (completionDropped || negativeNote)) {
    const signalCount = [sustainedDrop, bigCompletionDrop, negativeNote].filter(Boolean).length;
    return { ...base, state: "fading", confidence: n >= 4 && signalCount >= 2 ? "high" : "medium" };
  }
  if (!sustainedDrop && (change === null || change > THRESHOLDS.holdingChange)) return { ...base, state: "holding" };
  return { ...base, state: "dipping" };
}

export function scoreFormats(
  outcomes: MissionOutcome[],
  weekStart: string,
  paused: ReadonlySet<string> = new Set(),
): FormatScore[] {
  const from = addWeeks(weekStart, -2);
  const recent = outcomes.filter((o) => o.weekStart >= from && o.weekStart <= weekStart && !paused.has(o.weekStart));
  const byFormat = new Map<Format, MissionOutcome[]>();
  for (const o of recent) byFormat.set(o.format, [...(byFormat.get(o.format) ?? []), o]);

  return [...byFormat.entries()].map(([format, list]) => {
    const done = list.filter((o) => o.status === "done").length;
    const engagedMinutes = list.reduce((s, o) => s + (counts(o.status) ? o.minutes : 0), 0);
    return {
      format,
      assigned: list.length,
      done,
      completion: done / list.length,
      minutesPerMission: engagedMinutes / list.length,
      hardMoments: list.filter((o) => o.status === "meltdown").length,
    };
  });
}

export function scoreEngagement(
  interests: InterestInfo[],
  outcomes: MissionOutcome[],
  weekStart: string,
  pausedWeeks: string[] = [],
): EngagementReport {
  const paused = new Set(pausedWeeks);
  const formats = scoreFormats(outcomes, weekStart, paused).sort(
    (a, b) => b.completion - a.completion || b.assigned - a.assigned,
  );
  const thisWeek = addWeeks(weekStart, 1);

  // Ranking by minutes would punish short formats by design, so "works" is
  // about follow-through: mostly finished, seen more than once.
  return {
    weekStart,
    pausedWeeks: [...paused].sort(),
    interests: interests
      .filter((i) => i.status !== "paused" && i.status !== "dormant")
      .map((i) => scoreInterest(i, outcomes, weekStart, paused)),
    dormant: interests
      .filter((i) => i.status === "dormant")
      .map((i) => ({
        id: i.id,
        label: i.label,
        resurfaceOn: i.resurfaceOn ?? null,
        due: !!i.resurfaceOn && i.resurfaceOn <= thisWeek,
      })),
    formats,
    formatsThatWork: formats
      .filter(
        (f) =>
          f.completion >= THRESHOLDS.formatWorksCompletion &&
          f.assigned >= THRESHOLDS.formatMinMissions &&
          f.hardMoments === 0,
      )
      .map((f) => f.format),
    formatsToAvoid: formats
      .filter((f) => f.completion < THRESHOLDS.formatAvoidCompletion || f.hardMoments > 0)
      .map((f) => f.format),
  };
}
