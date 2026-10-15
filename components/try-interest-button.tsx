"use client";

import { Check, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { regeneratePlanAction, tryInterestAction } from "@/app/actions";
import type { QlooRef } from "@/lib/plan/schema";

// "Try it" adds the interest on trial; then offers to re-plan with it.
export function TryInterestButton({ childId, label, qlooRef, added }: { childId: string; label: string; qlooRef?: QlooRef; added: boolean }) {
  const [done, setDone] = useState(added);
  const [pending, start] = useTransition();
  const [planned, setPlanned] = useState(false);

  if (done) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-good">
          <Check aria-hidden className="size-4" /> On trial
        </span>
        {!planned && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await regeneratePlanAction(childId); setPlanned(true); })}
            className="min-h-11 rounded-full border border-line px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-70"
          >
            {pending ? "Planning…" : "Plan this week with it"}
          </button>
        )}
        {planned && <span className="text-sm text-ink-muted">This week&apos;s plan is updated.</span>}
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await tryInterestAction(childId, label, qlooRef); setDone(true); })}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-strong px-4 text-sm font-semibold text-brand-ink disabled:opacity-70"
    >
      <Plus aria-hidden className="size-4" /> Try it
    </button>
  );
}
