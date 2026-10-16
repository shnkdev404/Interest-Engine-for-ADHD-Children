"use client";

import { Check, Gift, Pencil, School, X } from "lucide-react";
import { useState, useTransition } from "react";

import { setDrcEntryAction, setDrcRewardAction, setDrcTargetsAction } from "@/app/actions";
import type { DrcView } from "@/lib/drc";
import { cx } from "@/lib/ui";

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

// Daily school-home card: set 1–4 targets, tick yes / not yet each school day,
// see the week at a glance and whether today's home reward is earned.
export function DailyCard({
  childId,
  nickname,
  view,
  suggestions,
  rewardIdeas,
  compact = false,
}: {
  childId: string;
  nickname: string;
  view: DrcView;
  suggestions: string[];
  rewardIdeas: string[];
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(view.targets.length === 0);
  const [pending, start] = useTransition();
  const [today, setToday] = useState<Record<string, boolean>>(
    view.days.find((d) => d.day === view.today)?.entries ?? {},
  );
  const isSchoolDay = view.days.at(-1)?.day === view.today;
  const metToday = Object.values(today).filter(Boolean).length;
  const earned = !!view.reward && metToday >= view.reward.threshold;

  if (editing) {
    return <CardSetup childId={childId} nickname={nickname} view={view} suggestions={suggestions} rewardIdeas={rewardIdeas} onDone={() => setEditing(false)} />;
  }

  return (
    <div className={cx("rounded-[var(--radius-card)] border border-line bg-surface", compact ? "p-3" : "p-4")}>
      <div className="flex items-start gap-2">
        <School aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{compact ? nickname : `School card · ${isSchoolDay ? "today" : "last school day"}`}</p>
          {view.reward && (
            <p className="text-sm text-ink-muted">
              {view.reward.threshold} of {view.targets.length} → {view.reward.rewardText}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit targets"
          className="-m-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-2"
        >
          <Pencil aria-hidden className="size-4" />
        </button>
      </div>

      {isSchoolDay ? (
        <ul className="mt-3 space-y-2">
          {view.targets.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm">{t.text}</span>
              <div className="flex gap-1.5" role="group" aria-label={t.text}>
                {[true, false].map((met) => (
                  <button
                    key={String(met)}
                    type="button"
                    disabled={pending}
                    aria-pressed={today[t.id] === met}
                    onClick={() => {
                      setToday({ ...today, [t.id]: met });
                      start(() => setDrcEntryAction(childId, t.id, view.today, met));
                    }}
                    className={cx(
                      "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm",
                      today[t.id] === met
                        ? met
                          ? "border-good bg-good-bg font-semibold text-good"
                          : "border-ink bg-surface-2 font-semibold"
                        : "border-line hover:bg-surface-2",
                    )}
                  >
                    {met ? <Check aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
                    {met ? "Yes" : "Not yet"}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">No school today. Here&apos;s the week so far.</p>
      )}

      {view.reward && isSchoolDay && (
        <p
          role="status"
          className={cx(
            "mt-3 flex items-center gap-2 rounded-lg p-2 text-sm",
            earned ? "bg-good-bg font-semibold text-good" : "bg-surface-2 text-ink-muted",
          )}
        >
          <Gift aria-hidden className="size-4" />
          {earned
            ? `Reward earned: ${view.reward.rewardText}`
            : `${metToday} of ${view.reward.threshold} so far for ${view.reward.rewardText}`}
        </p>
      )}

      {/* Week at a glance: filled = yes, grey = not yet, outline = not entered. Never red. */}
      <div className="mt-3 flex gap-3" aria-label="Last five school days">
        {view.days.map((d) => {
          const entries = d.day === view.today ? today : d.entries;
          const met = Object.values(entries).filter(Boolean).length;
          const entered = Object.keys(entries).length;
          return (
            <div key={d.day} className="flex flex-col items-center gap-1 text-xs text-ink-muted">
              <div className="flex gap-0.5">
                {view.targets.map((t) => (
                  <span
                    key={t.id}
                    className={cx(
                      "block size-2.5 rounded-full",
                      entries[t.id] === true ? "bg-good" : entries[t.id] === false ? "bg-ink-muted/40" : "border border-line",
                    )}
                  />
                ))}
              </div>
              <span className="sr-only">
                {dayLabel(d.day)}: {entered ? `${met} of ${view.targets.length} met` : "not entered"}
              </span>
              <span aria-hidden>{dayLabel(d.day)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardSetup({
  childId,
  nickname,
  view,
  suggestions,
  rewardIdeas,
  onDone,
}: {
  childId: string;
  nickname: string;
  view: DrcView;
  suggestions: string[];
  rewardIdeas: string[];
  onDone: () => void;
}) {
  const [targets, setTargets] = useState<string[]>(
    view.targets.length ? view.targets.map((t) => t.text) : suggestions.slice(0, 3),
  );
  const [threshold, setThreshold] = useState(view.reward?.threshold ?? Math.max(1, targets.length - 1));
  const [reward, setReward] = useState(view.reward?.rewardText ?? rewardIdeas[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const clean = targets.map((t) => t.trim()).filter(Boolean);
          const a = await setDrcTargetsAction(childId, clean);
          if (a && "error" in a && a.error) return setError(a.error);
          if (reward.trim()) {
            const b = await setDrcRewardAction(childId, Math.min(threshold, clean.length), reward.trim());
            if (b && "error" in b && b.error) return setError(b.error);
          }
          onDone();
        });
      }}
    >
      <div>
        <p className="font-semibold">School card for {nickname}</p>
        <p className="text-sm text-ink-muted">Pick 1–4 specific things to check each school day. Short and doable works best.</p>
      </div>
      {targets.map((t, i) => (
        <div key={i} className="flex gap-2">
          <label className="sr-only" htmlFor={`target-${childId}-${i}`}>
            Target {i + 1}
          </label>
          <input
            id={`target-${childId}-${i}`}
            value={t}
            maxLength={80}
            onChange={(e) => setTargets(targets.map((x, j) => (j === i ? e.target.value : x)))}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-base"
          />
          <button
            type="button"
            aria-label={`Remove target ${i + 1}`}
            onClick={() => setTargets(targets.filter((_, j) => j !== i))}
            className="grid size-11 place-items-center rounded-lg border border-line"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
      {targets.length < 4 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {suggestions
            .filter((s) => !targets.includes(s))
            .slice(0, 4)
            .map((s) => (
              <button key={s} type="button" onClick={() => setTargets([...targets, s])} className="min-h-9 rounded-full border border-line px-3 hover:bg-surface-2">
                + {s}
              </button>
            ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Home reward when
          <select
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="min-h-11 rounded-lg border border-line bg-bg px-2"
          >
            {Array.from({ length: Math.max(1, targets.length) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} of {Math.max(1, targets.length)} met
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
          Reward
          <input
            value={reward}
            maxLength={80}
            onChange={(e) => setReward(e.target.value)}
            list={`rewards-${childId}`}
            className="min-h-11 rounded-lg border border-line bg-bg px-3 text-base font-normal"
          />
          <datalist id={`rewards-${childId}`}>
            {rewardIdeas.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
      </div>
      {error && <p className="text-sm text-fading">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !targets.some((t) => t.trim())} className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-bg disabled:opacity-60">
          {pending ? "Saving…" : "Save card"}
        </button>
        {view.targets.length > 0 && (
          <button type="button" onClick={onDone} className="min-h-11 px-3 text-sm text-ink-muted">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
