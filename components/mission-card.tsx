"use client";

import { Check, ChevronDown, Gift, Info } from "lucide-react";
import { useState, useTransition } from "react";

import { chooseRewardAction, logOutcomeAction } from "@/app/actions";
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
  log: { status: Status; minutes: number; note: string | null; variant?: string | null } | null;
  childName?: string;
  alt?: { title: string; steps: string[] } | null;
  probe?: boolean;
  rewards?: string[];
};

const MINUTE_CHIPS = [5, 10, 15, 20, 30];

export function MissionCard(p: MissionCardProps) {
  const [open, setOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [log, setLog] = useState(p.log);
  const [refining, setRefining] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [variant, setVariant] = useState<"a" | "b">(p.log?.variant === "b" ? "b" : "a");
  const [reward, setReward] = useState<string | null>(null);
  const Icon = interestIcon(p.interest);
  const title = variant === "b" && p.alt ? p.alt.title : p.title;
  const steps = variant === "b" && p.alt ? p.alt.steps : p.steps;

  // One tap saves with a sensible default; minutes and a note are optional.
  const save = (status: Status, minutes?: number, withNote?: string) => {
    const m = minutes ?? (status === "done" ? p.estMinutes : status === "partial" ? Math.round(p.estMinutes / 2) : 0);
    setLog({ status, minutes: m, note: withNote ?? log?.note ?? null });
    setRefining(true);
    start(() => logOutcomeAction(p.childId, p.id, { status, minutes: m, note: withNote || undefined, variant: p.alt ? variant : undefined }));
  };

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex">
        <div aria-hidden className="w-1.5 shrink-0" style={{ background: p.color }} />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start gap-3">
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0" style={{ color: p.color }} />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold leading-snug">
                {p.subject === "break" && <span className="mr-1.5 rounded-full bg-surface-2 px-2 py-0.5 align-middle text-xs font-semibold">Warm-up</span>}
                {p.probe && <span className="mr-1.5 rounded-full bg-surface-2 px-2 py-0.5 align-middle text-xs font-semibold">Retry</span>}
                {title}
              </h3>
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

          {p.alt && (
            <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Which version?">
              <span className="text-sm text-ink-muted">Let {p.childName ?? "them"} choose:</span>
              {(["a", "b"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={variant === v}
                  onClick={() => setVariant(v)}
                  className={cx(
                    "min-h-11 max-w-full rounded-full border px-3 text-left text-sm",
                    variant === v ? "border-ink bg-surface-2 font-semibold" : "border-line hover:bg-surface-2",
                  )}
                >
                  {v === "a" ? p.title : p.alt!.title}
                </button>
              ))}
            </div>
          )}

          {open && (
            <ol className="mt-3 list-decimal space-y-1 pl-6 text-lg leading-relaxed">
              {steps.map((s) => (
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
              {(log.status === "done" || log.status === "partial") && !!p.rewards?.length && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
                    <Gift aria-hidden className="size-4" /> {reward ? "Enjoy:" : "Pick a reward:"}
                  </span>
                  {reward ? (
                    <span className="rounded-full bg-good-bg px-3 py-1.5 text-sm font-semibold text-good">{reward}</span>
                  ) : (
                    p.rewards.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setReward(r);
                          start(() => chooseRewardAction(p.childId, p.id, r));
                        }}
                        className="min-h-11 rounded-full border border-line bg-surface px-3 text-sm hover:bg-surface-2"
                      >
                        {r}
                      </button>
                    ))
                  )}
                </div>
              )}
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
