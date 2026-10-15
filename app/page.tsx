import { ArrowRight, BookOpen, Brain, Compass, Sparkles } from "lucide-react";

const STEPS = [
  { icon: Sparkles, title: "Interests", body: "Tell us what your child loves right now." },
  { icon: Compass, title: "Taste graph", body: "Qloo finds books, shows and games fans of those things also love." },
  { icon: BookOpen, title: "Weekly plan", body: "Homework, chores and reading, wrapped in their interests." },
  { icon: Brain, title: "What worked", body: "One-tap logging teaches SparkPath what holds attention." },
];

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <span className="font-display text-xl font-extrabold">
          <span className="text-brand">Spark</span>Path
        </span>
        <span className="text-sm text-ink-muted">For parents and teachers</span>
      </header>

      <section className="py-12 sm:py-16">
        <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">
          Homework they actually want to do.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink-muted">
          SparkPath turns your child&apos;s obsessions into missions, books and routines, and spots the next obsession
          before boredom sets in.
        </p>
        <form action="/demo" method="post" className="mt-8">
          <button
            type="submit"
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-strong px-6 font-semibold text-brand-ink shadow-sm transition hover:brightness-110"
          >
            Explore as Arjun&apos;s parent <ArrowRight aria-hidden className="size-5" />
          </button>
          <p className="mt-2 text-sm text-ink-muted">No signup. Arjun, 9, is a sample child. Takes about 3 minutes.</p>
        </form>
      </section>

      <section aria-labelledby="how" className="border-t border-line py-10">
        <h2 id="how" className="font-display text-lg font-bold">
          How it works
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <s.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
              <div>
                <p className="font-semibold">
                  {i + 1}. {s.title}
                </p>
                <p className="text-sm text-ink-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-ink-muted">
          When an interest fades, SparkPath notices from what you log and suggests three related ones to try next.
        </p>
      </section>

      <footer className="mt-auto flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-sm text-ink-muted">
        <span>Engagement and learning support for adults to use with children. Not a medical product.</span>
        <span>Taste data by Qloo</span>
      </footer>
    </main>
  );
}
