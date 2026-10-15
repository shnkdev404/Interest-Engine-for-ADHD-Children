"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { generateHooksAction } from "@/app/teach/actions";

const IDEAS = ["Fractions", "Persuasive writing", "The water cycle", "Telling the time"];

export function LessonForm({ classId, initialTopic = "" }: { classId: string; initialTopic?: string }) {
  const [topic, setTopic] = useState(initialTopic);
  const [minutes, setMinutes] = useState(40);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="rounded-[var(--radius-card)] border border-line bg-surface p-4 print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            await generateHooksAction(classId, { topic, minutes });
          } catch {
            setError("Couldn't make hooks right now. Try again.");
          }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
          Lesson
          <input
            required
            minLength={2}
            maxLength={80}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Fractions"
            className="min-h-11 rounded-lg border border-line bg-bg px-3 text-base font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-sm font-medium">
          Minutes
          <input
            type="number"
            min={10}
            max={120}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="min-h-11 rounded-lg border border-line bg-bg px-3 text-base font-normal"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-strong px-5 font-semibold text-brand-ink disabled:opacity-70"
        >
          <Sparkles aria-hidden className="size-4" />
          {pending ? "Writing a hook for each child…" : "Generate hooks"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <span className="text-ink-muted">Try:</span>
        {IDEAS.map((i) => (
          <button key={i} type="button" onClick={() => setTopic(i)} className="min-h-9 rounded-full border border-line px-3 hover:bg-surface-2">
            {i}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-1 text-sm text-ink-muted">
        {error}
      </p>
    </form>
  );
}
