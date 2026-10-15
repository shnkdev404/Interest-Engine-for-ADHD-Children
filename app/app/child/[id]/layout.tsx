import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { ChildNav } from "@/components/child-nav";
import { getDb, schema } from "@/db";
import { AccessError, requireChild } from "@/lib/session";

export const dynamic = "force-dynamic";
// Server actions here can run the planner agent (45 s deadline).
export const maxDuration = 60;

export default async function ChildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let child;
  try {
    child = await requireChild(id);
  } catch (err) {
    if (err instanceof AccessError) redirect("/");
    throw err;
  }
  const db = await getDb();
  const parent = await db.query.adults.findFirst({ where: eq(schema.adults.id, child.adultId) });
  const isDemo = parent?.email.endsWith("@demo.sparkpath.local") ?? false;

  return (
    <div className="min-h-dvh">
      {isDemo && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-surface-2 px-4 py-2 text-center text-sm text-ink-muted">
          <span>Demo: Arjun is a sample child. Your changes are private and reset when you start again.</span>
          <form action="/demo" method="post">
            <button type="submit" className="font-semibold text-accent underline-offset-2 hover:underline">
              Restart demo
            </button>
          </form>
        </div>
      )}
      <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-24 sm:px-6 lg:pb-10">
        <ChildNav childId={child.id} nickname={child.nickname} age={child.ageYears} />
        <main className="min-w-0 flex-1 pt-4 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}
