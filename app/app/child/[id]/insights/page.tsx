import { eq } from "drizzle-orm";
import { CircleCheck, CircleSlash, Moon, Quote, Zap } from "lucide-react";

import { EngagementChart } from "@/components/engagement-chart";
import { BreakWeekToggle, RestInterestButton } from "@/components/fading-controls";
import { TryInterestButton } from "@/components/try-interest-button";
import { getDb, schema } from "@/db";
import { addWeeks, mondayOf } from "@/lib/dates";
import { getEngagement } from "@/lib/engagement/load";
import { getMemory } from "@/lib/memory";
import { getCurrentPlan } from "@/lib/plan/service";
import { requireChild } from "@/lib/session";
import { cap, FORMAT_LABEL, interestColor, weekLabel } from "@/lib/ui";

const STATE_NOTE: Record<string, (pct: number | null) => string> = {
  fading: (p) => `−${Math.abs(p ?? 0)}% · fading`,
  holding: (p) => `${(p ?? 0) >= 0 ? "+" : ""}${p ?? 0}% · holding`,
  dipping: (p) => `${p ?? 0}% · dipping`,
  trial: () => "on trial",
  insufficient: () => "not enough data yet",
};

export default async function Insights({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const child = await requireChild(id);
  const db = await getDb();
  const interests = await db.select().from(schema.interests).where(eq(schema.interests.childId, id));
  const labels = interests.map((i) => i.label);
  const [report, current, memory] = await Promise.all([getEngagement(id), getCurrentPlan(id), getMemory()]);
  const notes = (await memory.recall(id, "notes about boredom, frustration, hard moments, what they liked", 12))
    .filter((m) => m.context === "adult_note")
    .slice(0, 4);

  // Only interests with logged time; a new trial interest would be a flat zero line.
  const scored = report.interests.filter((i) => i.minutes.some((m) => m.minutes > 0));
  // Chart the last three finished weeks that weren't breaks.
  const paused = new Set(report.pausedWeeks);
  const chartWeeks: string[] = [];
  for (let k = 0; chartWeeks.length < 3 && k < 8; k++) {
    const w = addWeeks(report.weekStart, -k);
    if (!paused.has(w)) chartWeeks.unshift(w);
  }
  const weeks = chartWeeks.map(weekLabel);
  const fading = scored.filter((i) => i.state === "fading");
  const thisWeek = mondayOf(new Date());
  const breakWeeks = [addWeeks(report.weekStart, -2), addWeeks(report.weekStart, -1), report.weekStart, thisWeek];
  const next = current?.plan.nextInterests ?? [];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-ink-muted">{child.nickname} · last 3 finished weeks</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Insights</h1>
      </header>

      {fading.map((f) => (
        <section key={f.id} className="flex gap-3 rounded-[var(--radius-card)] border border-fading/40 bg-fading-bg p-4">
          <Zap aria-hidden className="mt-0.5 size-6 shrink-0 text-fading" />
          <div className="min-w-0 flex-1 space-y-2">
            <p>
              <span className="font-semibold">
                {cap(f.label)} engagement dropped {Math.abs(f.changePct ?? 0)}% this week.
              </span>{" "}
              {scored.filter((i) => i.state === "holding").map((i) => `${cap(i.label)} is holding.`).join(" ")}{" "}
              {next.length > 0 && `Here are ${next.length} related interests to try next.`}
            </p>
            <div className="text-sm">
              <p className="font-medium">
                How sure: {f.confidence === "high" ? "fairly sure" : "early sign"} · {f.activeWeeks} weeks of logs
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {f.signals.sustainedDrop && <li>Time per mission has been below its usual level two weeks in a row.</li>}
                {f.signals.completionDropProb >= 0.5 && (
                  <li>Fewer missions finished ({Math.round(f.signals.completionDropProb * 100)}% likely a real drop, not chance).</li>
                )}
                {f.signals.negativeNote && <li>Your notes mention it feeling boring or unwanted.</li>}
              </ul>
            </div>
            <RestInterestButton childId={id} interestId={f.id} label={f.label} />
          </div>
        </section>
      ))}

      {report.dormant.length > 0 && (
        <section aria-labelledby="resting" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 id="resting" className="flex items-center gap-2 font-semibold">
            <Moon aria-hidden className="size-4 text-ink-muted" /> Resting
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {report.dormant.map((d) => (
              <li key={d.id}>
                {cap(d.label)}:{" "}
                {d.due
                  ? "ready for one short retry mission this week."
                  : `resting until the week of ${d.resurfaceOn ? weekLabel(d.resurfaceOn) : "later"}, then we'll try it once more.`}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">Interest often comes back after a break. If the retry goes well, it becomes active again.</p>
        </section>
      )}

      {scored.length > 0 ? (
        <EngagementChart
          weeks={weeks}
          series={scored.map((i) => ({
            label: cap(i.label),
            color: interestColor(labels, i.label),
            values: chartWeeks.map((w) => i.minutes.find((m) => m.weekStart === w)?.minutes ?? 0),
            note: STATE_NOTE[i.state](i.changePct),
          }))}
        />
      ) : (
        <p className="rounded-[var(--radius-card)] border border-line bg-surface p-4 text-ink-muted">
          No history yet. After two weeks of logging, trends and fading interests show up here.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="works" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 id="works" className="font-semibold">
            What works for {child.nickname}
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {report.formats
              .filter((f) => report.formatsThatWork.includes(f.format))
              .map((f) => (
                <li key={f.format} className="flex items-start gap-2">
                  <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-good" />
                  <span>
                    {FORMAT_LABEL[f.format]} missions: {Math.round(f.completion * 100)}% finished ({f.done} of {f.assigned})
                  </span>
                </li>
              ))}
            {report.formats
              .filter((f) => report.formatsToAvoid.includes(f.format))
              .map((f) => (
                <li key={f.format} className="flex items-start gap-2">
                  <CircleSlash aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                  <span>
                    {FORMAT_LABEL[f.format]}: {f.done} of {f.assigned} finished
                    {f.hardMoments > 0 && `, ${f.hardMoments} hard moment${f.hardMoments > 1 ? "s" : ""}`}
                  </span>
                </li>
              ))}
          </ul>
        </section>

        <section aria-labelledby="notes" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 id="notes" className="font-semibold">
            From your notes
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {notes.length === 0 && <li className="text-ink-muted">No notes yet.</li>}
            {notes.map((n) => (
              <li key={n.text} className="flex items-start gap-2">
                <Quote aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <span>{n.text.replace(/^Parent note after "[^"]*": /, "")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">Recalled from memory ({memory.mode === "hindsight" ? "Hindsight" : "local"}).</p>
        </section>
      </div>

      <section aria-labelledby="breaks" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <h2 id="breaks" className="font-semibold">
          Breaks
        </h2>
        <p className="text-sm text-ink-muted">Holiday, illness or exams? Mark the week so a pause isn&apos;t read as fading.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {breakWeeks.map((w) => (
            <BreakWeekToggle
              key={w}
              childId={id}
              weekStart={w}
              label={w === thisWeek ? "This week" : `Week of ${weekLabel(w)}`}
              paused={paused.has(w)}
            />
          ))}
        </div>
      </section>

      {next.length > 0 && (
        <section aria-labelledby="next">
          <h2 id="next" className="font-display text-xl font-bold">
            Try next
          </h2>
          <p className="text-sm text-ink-muted">From Qloo: what fans of {child.nickname}&apos;s interests also love.</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {next.map((n) => (
              <li key={n.label} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <p className="font-display text-lg font-bold">{n.label}</p>
                <p className="text-sm">{n.bridge}</p>
                <p className="text-sm text-ink-muted">Starter: {n.starterMission}</p>
                <p className="text-xs text-ink-muted">Qloo picks: {n.qlooRefs.map((r) => r.name).join(", ")}</p>
                <div className="mt-auto pt-1">
                  <TryInterestButton
                    childId={id}
                    label={n.label}
                    qlooRef={n.qlooRefs[0]}
                    added={labels.some((l) => l.toLowerCase() === n.label.toLowerCase())}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
