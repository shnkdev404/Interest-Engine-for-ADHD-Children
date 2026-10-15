"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { regeneratePlanAction } from "@/app/actions";
import { cx } from "@/lib/ui";

// Labels follow the agent's real tool order (UI_UX.md §6).
const STAGES = ["Checking what worked…", "Asking Qloo what fans also love…", "Looking for the next interest…", "Writing missions…"];

export function RegenerateButton({ childId, label = "Plan again", primary = false }: { childId: string; label?: string; primary?: boolean }) {
  const [pending, start] = useTransition();
  const [stage, setStage] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    setStage(0);
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 4000);
    return () => clearInterval(t);
  }, [pending]);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setNotice(null);
            const res = await regeneratePlanAction(childId);
            if (res.notice) setNotice(res.notice);
          })
        }
        className={cx(
          "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-70",
          primary ? "bg-brand-strong text-brand-ink" : "border border-line bg-surface hover:bg-surface-2",
        )}
      >
        <RefreshCw aria-hidden className={cx("size-4", pending && "animate-spin")} />
        {pending ? STAGES[stage] : label}
      </button>
      <p aria-live="polite" className="text-sm text-ink-muted">
        {notice}
      </p>
    </div>
  );
}
