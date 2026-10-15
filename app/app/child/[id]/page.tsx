import { eq } from "drizzle-orm";
import { ArrowRight, BookOpen, Music, Sun, Zap } from "lucide-react";
import Link from "next/link";

import { MissionCard } from "@/components/mission-card";
import { RegenerateButton } from "@/components/regenerate-button";
import { Tour } from "@/components/tour";
import { getDb, schema } from "@/db";
import { mondayOf } from "@/lib/dates";
import { getCurrentPlan } from "@/lib/plan/service";
import { requireChild } from "@/lib/session";
import { cap, FORMAT_LABEL, interestColor, weekLabel } from "@/lib/ui";

export default async function ThisWeek({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tour?: string }>;
}) {
  const { id } = await params;
  const { tour } = await searchParams;
  const child = await requireChild(id);
  const db = await getDb();
  const interests = await db.select().from(schema.interests).where(eq(schema.interests.childId, id));
  const labels = interests.map((i) => i.label);
  const current = await getCurrentPlan(id);

  if (!current) {
    return (
      <section className="py-10">
        <h1 className="font-display text-2xl font-bold">
          {child.nickname} · Week of {weekLabel(mondayOf(new Date()))}
        </h1>
        <p className="mt-2 text-ink-muted">No plan for this week yet.</p>
        <div className="mt-4">
          <RegenerateButton childId={id} label="Plan this week" primary />
        </div>
      </section>
    );
  }

  const { plan } = current;
  const works = new Set(plan.insight?.formatsThatWork ?? []);
  const fading = plan.insight?.fading ?? [];
  const why = (interest: string, format: string) => {
    const state = interests.find((i) => i.label.toLowerCase() === interest.toLowerCase())?.status;
    const parts = [
      fading.some((f) => f.label === interest)
        ? `${cap(interest)} is fading, so it's used lightly.`
        : `Built on ${interest}${state === "trial" ? " (on trial)" : ""}.`,
      works.has(format as never) ? `${FORMAT_LABEL[format] ?? format} missions usually get finished.` : null,
    ];
    return parts.filter(Boolean).join(" ");
  };

  return (
    <div className="space-y-8">
      {tour === "1" && <Tour />}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">
            {child.nickname} · Week of {weekLabel(plan.weekStart)}
            {current.source === "offline" && " · Quick plan (made without the AI planner)"}
          </p>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{plan.headline}</h1>
        </div>
        <RegenerateButton childId={id} />
      </header>

      {fading.length > 0 && (
        <Link
          href={`/app/child/${id}/insights`}
          className="flex items-center gap-3 rounded-[var(--radius-card)] border border-fading/40 bg-fading-bg p-4 text-ink"
        >
          <Zap aria-hidden className="size-6 shrink-0 text-fading" />
          <span className="flex-1">
            <span className="block font-semibold">
              {fading.map((f) => `${cap(f.label)} is fading`).join(" · ")}
            </span>
            <span className="block text-sm">
              Down {Math.abs(fading[0].changePct)}% against the two weeks before.{" "}
              {plan.nextInterests.length > 0 && `${plan.nextInterests.length} new interests to try.`}
            </span>
          </span>
          <ArrowRight aria-hidden className="size-5 shrink-0" />
        </Link>
      )}

      <section aria-labelledby="missions">
        <h2 id="missions" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Missions · {current.missions.length}
        </h2>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {current.missions.map((m) => {
            const pm = plan.missions.find((x) => x.title === m.title);
            const interest = pm?.interest ?? "";
            return (
              <MissionCard
                key={m.id}
                childId={id}
                id={m.id}
                title={m.title}
                subject={m.subject}
                format={m.format}
                estMinutes={m.estMinutes}
                steps={m.steps}
                interest={interest}
                color={interestColor(labels, interest)}
                why={why(interest, m.format)}
                qlooRefs={m.qlooRefs}
                log={m.log}
              />
            );
          })}
        </div>
      </section>

      <section aria-labelledby="reading">
        <h2 id="reading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          <BookOpen aria-hidden className="size-4" /> Reading
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plan.readingList.map((b) => (
            <li key={b.qlooRef.entityId} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <p className="font-semibold">{b.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{b.why}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="playlist">
          <h2 id="playlist" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            <Music aria-hidden className="size-4" /> Focus playlist
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
            {plan.focusPlaylist.map((a) => (
              <li key={a.qlooRef.entityId} className="p-3">
                <p className="font-medium">{a.title}</p>
                <p className="text-sm text-ink-muted">{a.why}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="weekend">
          <h2 id="weekend" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            <Sun aria-hidden className="size-4" /> Weekend
          </h2>
          <div className="mt-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <p className="font-semibold">{plan.weekendActivity.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{plan.weekendActivity.why}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
