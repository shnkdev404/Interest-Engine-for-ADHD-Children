// Deterministic engagement scoring (DESIGN.md §4, D-08). The agent reads this
// output and never computes the numbers itself, so "dropped 41%" is the same
// on every load and traceable to logged data.
import { addWeeks } from "@/lib/dates";

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
  status: "active" | "fading" | "paused" | "trial";
  startedAt: string;
};

export type InterestState = "fading" | "holding" | "dipping" | "trial" | "insufficient";

export type InterestScore = {
  id: string;
  label: string;
  minutes: { weekStart: string; minutes: number }[]; // oldest first, 3 weeks
  baseline: number | null;
  changePct: number | null;
  completion: number | null;
  prevCompletion: number | null;
  negativeNote: boolean;
  state: InterestState;
};

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
  interests: InterestScore[];
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
} as const;

const NEGATIVE_NOTE = /\b(boring|bored|didn'?t want|doesn'?t want|don'?t want|hates?|hated|refused|not into|sick of|over it)\b/i;

const counts = (s: OutcomeStatus | null) => s === "done" || s === "partial";

function completionOf(list: MissionOutcome[]): number | null {
  if (!list.length) return null;
  return list.filter((m) => m.status === "done").length / list.length;
}

export function scoreInterest(
  interest: InterestInfo,
  outcomes: MissionOutcome[],
  weekStart: string,
): InterestScore {
  const weeks = [addWeeks(weekStart, -2), addWeeks(weekStart, -1), weekStart];
  const mine = outcomes.filter((o) => o.interestId === interest.id);
  const inWeek = (w: string) => mine.filter((o) => o.weekStart === w);
  const minutes = weeks.map((w) => ({
    weekStart: w,
    minutes: inWeek(w).reduce((s, o) => s + (counts(o.status) ? o.minutes : 0), 0),
  }));

  const [m2, m1, m0] = minutes.map((m) => m.minutes);
  const hasBaselineWeeks = inWeek(weeks[0]).length > 0 && inWeek(weeks[1]).length > 0;
  const baseline = hasBaselineWeeks ? (m2 + m1) / 2 : null;
  const change = baseline ? (m0 - baseline) / baseline : null;
  const completion = completionOf(inWeek(weekStart));
  const prevCompletion = completionOf(inWeek(weeks[1]));
  const negativeNote = inWeek(weekStart).some((o) => o.note && NEGATIVE_NOTE.test(o.note));

  const base = {
    id: interest.id,
    label: interest.label,
    minutes,
    baseline,
    changePct: change === null ? null : Math.round(change * 100),
    completion,
    prevCompletion,
    negativeNote,
  };

  const trialEnds = addWeeks(interest.startedAt, THRESHOLDS.trialWeeks);
  if (interest.status === "trial" || weekStart < trialEnds) return { ...base, state: "trial" };
  if (baseline === null || change === null || baseline < THRESHOLDS.minBaselineMinutes) {
    return { ...base, state: "insufficient" };
  }

  const completionDropped = completion !== null && prevCompletion !== null && completion < prevCompletion;
  if (change <= THRESHOLDS.fadingChange && (completionDropped || negativeNote)) {
    return { ...base, state: "fading" };
  }
  if (change > THRESHOLDS.holdingChange) return { ...base, state: "holding" };
  return { ...base, state: "dipping" };
}

export function scoreFormats(outcomes: MissionOutcome[], weekStart: string): FormatScore[] {
  const from = addWeeks(weekStart, -2);
  const recent = outcomes.filter((o) => o.weekStart >= from && o.weekStart <= weekStart);
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
): EngagementReport {
  const formats = scoreFormats(outcomes, weekStart).sort(
    (a, b) => b.completion - a.completion || b.assigned - a.assigned,
  );

  // Ranking by minutes would punish short formats by design, so "works" is
  // about follow-through: mostly finished, seen more than once.
  return {
    weekStart,
    interests: interests.filter((i) => i.status !== "paused").map((i) => scoreInterest(i, outcomes, weekStart)),
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
