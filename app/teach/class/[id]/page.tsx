import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DailyCard } from "@/components/daily-card";
import { HookCard } from "@/components/teach/hook-card";
import { LessonForm } from "@/components/teach/lesson-form";
import { PrintButton } from "@/components/teach/print-button";
import { getDb, schema } from "@/db";
import { getDrc, TARGET_SUGGESTIONS } from "@/lib/drc";
import type { Hook } from "@/lib/hooks/generate";
import { AccessError, requireClass } from "@/lib/session";
import { interestColor } from "@/lib/ui";

export const dynamic = "force-dynamic";
// Server actions here can run the lesson-hooks call.
export const maxDuration = 60;

// The class's interests share one colour list so each interest keeps its hue.
// Teacher-side reward ideas for the school card (no per-child plan here).
const CLASS_REWARDS = ["First pick at break time", "5 minutes of free choice", "Sticker for the chart", "Class helper tomorrow"];

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const view = (await searchParams).view === "cards" ? "cards" : "hooks";
  let cls;
  try {
    cls = await requireClass(id);
  } catch (err) {
    if (err instanceof AccessError) redirect("/");
    throw err;
  }

  const db = await getDb();
  const teacher = await db.query.adults.findFirst({ where: eq(schema.adults.id, cls.teacherId) });
  const classes = await db.select().from(schema.classes).where(eq(schema.classes.teacherId, cls.teacherId));
  const members = await db.select().from(schema.classChildren).where(eq(schema.classChildren.classId, id));
  const ids = members.map((m) => m.childId);
  const children = ids.length ? await db.select().from(schema.children).where(inArray(schema.children.id, ids)) : [];
  const interests = ids.length ? await db.select().from(schema.interests).where(inArray(schema.interests.childId, ids)) : [];
  const allLabels = [...new Set(interests.map((i) => i.label.toLowerCase()))];
  const [lesson] = await db
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.classId, id))
    .orderBy(desc(schema.lessons.createdAt))
    .limit(1);
  const hooks = (lesson?.hooks as Hook[] | undefined) ?? [];
  const cards = view === "cards" ? await Promise.all(children.map(async (c) => ({ child: c, view: await getDrc(c.id) }))) : [];
  const isDemo = teacher?.email.endsWith("@demo.sparkpath.local") ?? false;

  return (
    <div className="min-h-dvh">
      {isDemo && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-surface-2 px-4 py-2 text-center text-sm text-ink-muted print:hidden">
          <span>Demo: a sample class of five. Your changes are private and reset when you start again.</span>
          <form action="/demo/teacher" method="post">
            <button type="submit" className="font-semibold text-accent underline-offset-2 hover:underline">
              Restart demo
            </button>
          </form>
        </div>
      )}

      <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-10 sm:px-6">
        <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col gap-6 pt-8 lg:flex print:hidden">
          <Link href="/" className="font-display text-xl font-extrabold">
            <span className="text-brand">Spark</span>Path
          </Link>
          <div>
            <p className="font-display text-lg font-bold">{teacher?.displayName ?? "Teacher"}</p>
            <p className="text-sm text-ink-muted">Classes</p>
          </div>
          <nav aria-label="Classes" className="flex flex-col gap-1">
            {classes.map((c) => (
              <Link
                key={c.id}
                href={`/teach/class/${c.id}`}
                aria-current={c.id === id ? "page" : undefined}
                className={c.id === id ? "min-h-11 rounded-lg bg-surface-2 px-3 py-2.5 font-medium" : "min-h-11 rounded-lg px-3 py-2.5 text-ink-muted"}
              >
                {c.name}
              </Link>
            ))}
          </nav>
          <p className="mt-auto pb-6 text-xs text-ink-muted">Taste data by Qloo</p>
        </aside>

        <main className="min-w-0 flex-1 space-y-6 pt-4 lg:pt-8">
          <header>
            <p className="text-sm text-ink-muted">
              {teacher?.displayName} · Class {cls.name} · {children.length} children
            </p>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">
              {view === "cards" ? "Daily school cards" : "One lesson, a hook for every child"}
            </h1>
            <nav aria-label="Class views" className="mt-3 flex gap-2 print:hidden">
              {(
                [
                  ["hooks", "Lesson hooks"],
                  ["cards", "Daily cards"],
                ] as const
              ).map(([v, label]) => (
                <Link
                  key={v}
                  href={v === "hooks" ? `/teach/class/${id}` : `/teach/class/${id}?view=cards`}
                  aria-current={view === v ? "page" : undefined}
                  className={
                    view === v
                      ? "min-h-11 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-bg"
                      : "min-h-11 rounded-full border border-line px-4 py-2.5 text-sm"
                  }
                >
                  {label}
                </Link>
              ))}
            </nav>
          </header>

          {view === "cards" ? (
            <section aria-label="Daily school cards" className="space-y-3">
              <p className="text-sm text-ink-muted">
                Tick each child&apos;s targets once a day. Parents see the same card at home with the reward you agreed.
              </p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {cards.map(({ child: c, view: v }) => (
                  <DailyCard key={c.id} childId={c.id} nickname={c.nickname} view={v} suggestions={TARGET_SUGGESTIONS} rewardIdeas={CLASS_REWARDS} compact />
                ))}
              </div>
            </section>
          ) : (
          <>
          <LessonForm classId={id} initialTopic={lesson?.topic ?? ""} />

          {lesson ? (
            <section aria-labelledby="hooks" className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="hooks" className="font-display text-xl font-bold">
                    {lesson.topic} · {lesson.minutes} min
                  </h2>
                  <p className="text-sm text-ink-muted">
                    {lesson.model === "offline-template"
                      ? "Quick hooks made without the AI planner, from each child's interests and Qloo picks."
                      : "Written by the AI from each child's interests, history and Qloo picks."}
                  </p>
                </div>
                <PrintButton />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
                {hooks.map((h) => (
                  <HookCard key={h.childId} classId={id} lessonId={lesson.id} hook={h} color={interestColor(allLabels, h.interest)} />
                ))}
              </div>
            </section>
          ) : (
            <section aria-labelledby="roster">
              <h2 id="roster" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Class {cls.name}
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {children.map((c) => (
                  <li key={c.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                    <p className="font-semibold">{c.nickname}</p>
                    <p className="text-sm text-ink-muted">
                      Age {c.ageYears} · loves{" "}
                      {interests
                        .filter((i) => i.childId === c.id)
                        .map((i) => i.label)
                        .join(" and ")}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink-muted">Pick a lesson above to get a hook for each child.</p>
            </section>
          )}
          </>
          )}

          {children
            .filter((c) => c.nickname === "Arjun")
            .map((c) => (
              <p key={c.id} className="text-sm text-ink-muted print:hidden">
                Arjun has three weeks of logged history.{" "}
                <Link href={`/app/child/${c.id}/insights`} className="font-medium text-accent">
                  See his engagement insights →
                </Link>
              </p>
            ))}
        </main>
      </div>
    </div>
  );
}
