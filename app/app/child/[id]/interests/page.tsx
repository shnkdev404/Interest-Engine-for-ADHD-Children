import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { getEngagement } from "@/lib/engagement/load";
import { requireChild } from "@/lib/session";
import { cap, cx, interestColor, interestIcon } from "@/lib/ui";

const PILL: Record<string, string> = {
  fading: "bg-fading-bg text-fading",
  holding: "bg-good-bg text-good",
  trial: "bg-surface-2 text-ink",
  dipping: "bg-surface-2 text-ink-muted",
  insufficient: "bg-surface-2 text-ink-muted",
};
const PILL_LABEL: Record<string, string> = {
  fading: "Fading",
  holding: "Active",
  trial: "Trial",
  dipping: "Dipping",
  insufficient: "New",
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i * 56) / Math.max(values.length - 1, 1) + 2},${22 - (v / max) * 20}`).join(" ");
  return (
    <svg viewBox="0 0 60 24" className="h-6 w-16" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Interests({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const child = await requireChild(id);
  const db = await getDb();
  const interests = await db.select().from(schema.interests).where(eq(schema.interests.childId, id));
  const labels = interests.map((i) => i.label);
  const report = await getEngagement(id);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink-muted">{child.nickname}</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Interests</h1>
      </header>
      <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {interests.map((i) => {
          const score = report.interests.find((r) => r.id === i.id);
          const state = i.status === "paused" ? "paused" : (score?.state ?? "insufficient");
          const color = interestColor(labels, i.label);
          const Icon = interestIcon(i.label);
          return (
            <li key={i.id} className="flex items-center gap-3 p-4">
              <Icon aria-hidden className="size-5 shrink-0" style={{ color }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{cap(i.label)}</p>
                <p className="text-sm text-ink-muted">
                  {i.source === "suggested" ? "Suggested by SparkPath" : "Added by you"} · since {i.startedAt}
                  {!i.qlooEntityId && " · limited taste data"}
                </p>
              </div>
              {score && score.minutes.some((m) => m.minutes > 0) && <Sparkline values={score.minutes.map((m) => m.minutes)} color={color} />}
              <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", PILL[state] ?? "bg-surface-2 text-ink-muted")}>
                {PILL_LABEL[state] ?? "Paused"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-muted">Adding and pausing interests comes next; for now, use &ldquo;Try it&rdquo; on Insights.</p>
    </div>
  );
}
