"use client";

import { X } from "lucide-react";
import { useState } from "react";

const STEPS = [
  "The amber card up top: SparkPath noticed Minecraft is fading, from what Arjun's parent logged.",
  "Tap \"Why this?\" on any mission to see which interest and which Qloo picks it uses.",
  "Compare shows the same request answered by AI alone and by SparkPath.",
  "Log a mission as \"Hard moment\", then Plan again: the next plan avoids what didn't work.",
];

// A 4-step guided tour for first-time demo visitors; skippable, never blocks.
export function Tour() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <aside aria-label="Demo tour" className="mb-4 rounded-[var(--radius-card)] border border-accent/40 bg-surface p-4">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm">
          <span className="font-semibold">
            Tour {step + 1}/{STEPS.length}:
          </span>{" "}
          {STEPS[step]}
        </p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close tour" className="-m-2 grid size-11 place-items-center rounded-full hover:bg-surface-2">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep(step + 1)} className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-bg">
            Next
          </button>
        ) : (
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-bg">
            Got it
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm text-ink-muted">
          Skip
        </button>
      </div>
    </aside>
  );
}
