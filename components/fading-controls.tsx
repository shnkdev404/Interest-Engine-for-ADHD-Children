"use client";

import { Moon, Pause, Play } from "lucide-react";
import { useState, useTransition } from "react";

import { restInterestAction, setPauseWeekAction } from "@/app/actions";
import { cx } from "@/lib/ui";

// Rest a fading interest; SparkPath brings it back once as a probe later.
export function RestInterestButton({ childId, interestId, label }: { childId: string; interestId: string; label: string }) {
  const [pending, start] = useTransition();
  const [until, setUntil] = useState<string | null>(null);
  if (until) {
    return (
      <p role="status" className="text-sm">
        Resting {label}. We&apos;ll try it once more in the week of {until}.
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => setUntil((await restInterestAction(childId, interestId)).resurfaceOn))}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2 disabled:opacity-70"
    >
      <Moon aria-hidden className="size-4" /> Rest {label} for 3 weeks
    </button>
  );
}

// Toggle a week as a break (holiday, illness) so it isn't read as a drop.
export function BreakWeekToggle({
  childId,
  weekStart,
  label,
  paused: initial,
}: {
  childId: string;
  weekStart: string;
  label: string;
  paused: boolean;
}) {
  const [paused, setPaused] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={paused}
      onClick={() =>
        start(async () => {
          await setPauseWeekAction(childId, weekStart, !paused);
          setPaused(!paused);
        })
      }
      className={cx(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm",
        paused ? "border-ink bg-surface-2 font-semibold" : "border-line hover:bg-surface-2",
      )}
    >
      {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
      {label}
      {paused ? " · break" : ""}
    </button>
  );
}
