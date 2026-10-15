"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { updateHookAction } from "@/app/teach/actions";
import type { Hook } from "@/lib/hooks/generate";
import { cap, interestIcon } from "@/lib/ui";

export function HookCard({ classId, lessonId, hook, color }: { classId: string; lessonId: string; hook: Hook; color: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: hook.title, opener: hook.opener, activity: hook.activity });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const Icon = interestIcon(hook.interest);

  return (
    <article className="flex break-inside-avoid flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div aria-hidden className="h-1.5" style={{ background: color }} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <Icon aria-hidden className="size-5 shrink-0" style={{ color }} />
          <p className="font-display text-lg font-bold">{hook.nickname}</p>
          <span className="ml-auto text-xs text-ink-muted">{cap(hook.interest)}</span>
        </div>

        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await updateHookAction(classId, lessonId, hook.childId, draft);
                if (res && "error" in res && res.error) setError(res.error);
                else {
                  setError(null);
                  setEditing(false);
                }
              });
            }}
          >
            {(["title", "opener", "activity"] as const).map((f) => (
              <label key={f} className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
                {cap(f)}
                <textarea
                  value={draft[f]}
                  onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                  rows={f === "title" ? 1 : 3}
                  maxLength={f === "title" ? 60 : 300}
                  className="rounded-lg border border-line bg-bg p-2 text-sm text-ink"
                />
              </label>
            ))}
            {error && <p className="text-sm text-fading">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-bg">
                {pending ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="min-h-11 px-3 text-sm text-ink-muted">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <h3 className="font-semibold leading-snug">{draft.title}</h3>
            <p className="text-sm">
              <span className="font-medium">Open: </span>
              {draft.opener}
            </p>
            <p className="text-sm">
              <span className="font-medium">Then: </span>
              {draft.activity}
            </p>
            {hook.qlooRef && <p className="text-xs text-ink-muted">Uses {hook.qlooRef.name} (from Qloo)</p>}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-auto inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-accent print:hidden"
            >
              <Pencil aria-hidden className="size-4" /> Edit
            </button>
          </>
        )}
      </div>
    </article>
  );
}
