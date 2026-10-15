"use client";

import { CalendarDays, Columns2, LineChart, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/lib/ui";

// Bottom tabs on phones, sidebar on desktop (UI_UX.md §3).
export function ChildNav({ childId, nickname, age }: { childId: string; nickname: string; age: number }) {
  const path = usePathname();
  const base = `/app/child/${childId}`;
  const tabs = [
    { href: base, label: "This week", icon: CalendarDays },
    { href: `${base}/insights`, label: "Insights", icon: LineChart },
    { href: `${base}/interests`, label: "Interests", icon: Sparkles },
    { href: `${base}/compare`, label: "Compare", icon: Columns2 },
  ];
  const active = (href: string) => (href === base ? path === base : path.startsWith(href));

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-6 pt-8 lg:flex">
        <Link href="/" className="font-display text-xl font-extrabold">
          <span className="text-brand">Spark</span>Path
        </Link>
        <div>
          <p className="font-display text-lg font-bold">{nickname}</p>
          <p className="text-sm text-ink-muted">Age {age}</p>
        </div>
        <nav aria-label="Child" className="flex flex-col gap-1">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active(t.href) ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium",
                active(t.href) ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2/60",
              )}
            >
              <t.icon aria-hidden className="size-5" />
              {t.label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto pb-6 text-xs text-ink-muted">Taste data by Qloo</p>
      </aside>

      <nav
        aria-label="Child"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active(t.href) ? "page" : undefined}
            className={cx(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
              active(t.href) ? "text-brand-strong" : "text-ink-muted",
            )}
          >
            <t.icon aria-hidden className="size-5" />
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
