import { eq } from "drizzle-orm";
import { Brain, Compass, KeyRound } from "lucide-react";
import { Suspense } from "react";

import { getDb, schema } from "@/db";
import { aiAlone, baselineRequest } from "@/lib/agent/baseline";
import { hasAnthropicCredentials } from "@/lib/llm/client";
import { getCurrentPlan } from "@/lib/plan/service";
import { requireChild } from "@/lib/session";
import { cap } from "@/lib/ui";

async function AiAlonePanel({ id, nickname, age, interests }: { id: string; nickname: string; age: number; interests: string[] }) {
  if (!hasAnthropicCredentials()) {
    return (
      <div className="flex gap-2 text-sm text-ink-muted">
        <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>The live comparison needs the Claude API key on the server. Once it&apos;s set, this column shows Claude&apos;s answer to the same request with no Qloo data and no memory.</p>
      </div>
    );
  }
  const text = await aiAlone(id, { nickname, age, interests }).catch(() => null);
  if (!text) return <p className="text-sm text-ink-muted">Couldn&apos;t get the AI-only answer right now.</p>;
  return <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>;
}

export default async function Compare({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const child = await requireChild(id);
  const db = await getDb();
  const interests = (await db.select().from(schema.interests).where(eq(schema.interests.childId, id))).filter(
    (i) => i.source === "adult",
  );
  const labels = interests.map((i) => i.label);
  const current = await getCurrentPlan(id);
  const plan = current?.plan;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink-muted">Same request, two answers</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">AI alone vs SparkPath</h1>
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
          &ldquo;{baselineRequest({ nickname: child.nickname, age: child.ageYears, interests: labels })}&rdquo;
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="alone" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 id="alone" className="flex items-center gap-2 font-semibold">
            <Brain aria-hidden className="size-5 text-ink-muted" /> AI alone
          </h2>
          <p className="mb-3 text-xs text-ink-muted">Interest names only. No taste data, no history.</p>
          <Suspense fallback={<p className="text-sm text-ink-muted">Asking Claude…</p>}>
            <AiAlonePanel id={id} nickname={child.nickname} age={child.ageYears} interests={labels} />
          </Suspense>
        </section>

        <section aria-labelledby="sp" className="rounded-[var(--radius-card)] border-2 border-brand/50 bg-surface p-4">
          <h2 id="sp" className="flex items-center gap-2 font-semibold">
            <Compass aria-hidden className="size-5 text-brand" /> SparkPath
          </h2>
          <p className="mb-3 text-xs text-ink-muted">Qloo taste graph + {child.nickname}&apos;s logged history.</p>
          {!plan ? (
            <p className="text-sm text-ink-muted">No plan yet this week.</p>
          ) : (
            <div className="space-y-4 text-sm">
              {plan.insight && (
                <div>
                  <h3 className="font-semibold">Uses memory</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {plan.insight.fading.map((f) => (
                      <li key={f.label}>
                        {cap(f.label)} is fading (down {Math.abs(f.changePct)}%), so it&apos;s used lightly.
                      </li>
                    ))}
                    {plan.insight.formatsThatWork.length > 0 && (
                      <li>Leans on formats that get finished: {plan.insight.formatsThatWork.map((f) => f.replace(/_/g, " ")).join(", ")}.</li>
                    )}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="font-semibold">Books fans also love</h3>
                <ul className="mt-1 space-y-1">
                  {plan.readingList.map((b) => (
                    <li key={b.qlooRef.entityId}>
                      <span className="font-medium">{b.title}</span>{" "}
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-muted">from Qloo</span>
                    </li>
                  ))}
                </ul>
              </div>
              {plan.nextInterests.length > 0 && (
                <div>
                  <h3 className="font-semibold">Next interests to try</h3>
                  <ul className="mt-1 space-y-1">
                    {plan.nextInterests.map((n) => (
                      <li key={n.label}>
                        <span className="font-medium">{n.label}</span>: {n.qlooRefs.map((r) => r.name).join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="font-semibold">Missions</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {plan.missions.map((m) => (
                    <li key={m.title}>{m.title}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>

      <p className="text-sm text-ink-muted">
        Same model, same request. The only difference is Qloo&apos;s taste graph and {child.nickname}&apos;s memory.
        {current?.source === "offline" && " (This week's SparkPath plan was made without the AI planner, from Qloo and memory alone.)"}
      </p>
    </div>
  );
}
