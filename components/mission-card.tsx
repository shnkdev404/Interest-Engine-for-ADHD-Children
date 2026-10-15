"use client";

import { Check, ChevronDown, Info } from "lucide-react";
import { useState, useTransition } from "react";

import { logOutcomeAction } from "@/app/actions";
import { cx, FORMAT_LABEL, interestIcon, STATUS_LABEL, SUBJECT_LABEL } from "@/lib/ui";

type Status = keyof typeof STATUS_LABEL;

export type MissionCardProps = {
  childId: string;
  id: string;
  title: string;
  subject: string;
  format: string;
  estMinutes: number;
  steps: string[];
  interest: string;
  color: string;
  why: string;
  qlooRefs: { name: string }[];
  log: { status: Status; minutes: number; note: string | null } | null;
};

const MINUTE_CHIPS = [5, 10, 15, 20, 30];

export function MissionCard(p: MissionCardProps) {
  const [open, setOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [log, setLog] = useState(p.log);
  const [refining, setRefining] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const Icon = interestIcon(p.interest);

  // One tap saves with a sensible default; minutes and a note are optional.
  const save = (status: Status, minutes?: number, withNote?: string) => {
    const m = minutes ?? (status === "done" ? p.estMinutes : status === "partial" ? Math.round(p.estMinutes / 2) : 0);
    setLog({ status, minutes: m, note: withNote ?? log?.note ?? null });
    setRefining(true);
    start(() => logOutcomeAction(p.childId, p.id, { status, minutes: m, note: withNote || undefined }));
  };

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex">
        <div aria-hidden className="w-1.5 shrink-0" style={{ background: p.color }} />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start gap-3">
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0" style={{ color: p.color }} />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold leading-snug">{p.title}</h3>
              <p className="mt-0.5 text-sm text-ink-muted">
                {SUBJECT_LABEL[p.subject] ?? p.subject} · {p.estMinutes} min · {FORMAT_LABEL[p.format] ?? p.format} ·{" "}
                {p.interest}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? "Hide steps" : "Show steps"}
              className="-m-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-2"
            >
              <ChevronDown aria-hidden className={cx("size-5 transition", open && "rotate-180")} />
            </button>
          </div>

          {open && (
            <ol className="mt-3 list-decimal space-y-1 pl-6 text-lg leading-relaxed">
              {p.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`How did "${p.title}" go?`}>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => save(s)}
                aria-pressed={log?.status === s}
                className={cx(
                  "inline-flex min-h-12 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition",
                  log?.status === s
                    ? s === "done"
                      ? "border-good bg-good-bg text-good"
                      : "border-ink bg-surface-2 text-ink"
                    : "border-line text-ink hover:bg-surface-2",
                )}
              >
                {log?.status === s && <Check aria-hidden className="size-4" />}
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {refining && log && (
            <div className="mt-3 rounded-lg bg-surface-2 p-3">
              <p className="text-sm font-medium" role="status">
                Got it. Next week&apos;s plan will use this.
              </p>
              {(log.status === "done" || log.status === "partial") && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-ink-muted">Time on it:</span>
                  {MINUTE_CHIPS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => save(log.status, m)}
                      aria-pressed={log.minutes === m}
                      className={cx(
                        "min-h-11 min-w-11 rounded-full border px-3 text-sm",
                        log.minutes === m ? "border-ink bg-surface font-semibold" : "border-line",
                      )}
                    >
                      {m === 30 ? "30+" : m}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim()) save(log.status, log.minutes, note.trim());
                  setNote("");
                }}
              >
                <label className="sr-only" htmlFor={`note-${p.id}`}>
                  Note (optional)
                </label>
                <input
                  id={`note-${p.id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional)"
                  maxLength={300}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-base"
                />
                <button type="submit" className="min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-bg">
                  Save
                </button>
              </form>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowWhy((w) => !w)}
            aria-expanded={showWhy}
            className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent"
          >
            <Info aria-hidden className="size-4" /> Why this?
          </button>
          {showWhy && (
            <p className="text-sm text-ink-muted">
              {p.why}
              {p.qlooRefs.length > 0 && <> Inspired by {p.qlooRefs.map((r) => r.name).join(", ")} (from Qloo).</>}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
