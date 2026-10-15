import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";

export type MemoryContext = "task_outcome" | "adult_note";

export type MemoryItem = {
  content: string;
  context: MemoryContext;
  occurredAt: Date;
};

export type RecalledMemory = {
  text: string;
  context?: string;
  occurredAt?: string;
};

// The agent's view of a child's memory (ARCHITECTURE.md §6). Words and
// meaning only; numbers live in Postgres for the scorer (D-08).
export type MemoryStore = {
  mode: "hindsight" | "local";
  ensureBank(childId: string, nickname: string): Promise<void>;
  retain(childId: string, item: MemoryItem): Promise<void>;
  recall(childId: string, query: string, limit?: number): Promise<RecalledMemory[]>;
  // One-paragraph synthesis for the weekly insight; null when unsupported.
  reflect(childId: string, question: string): Promise<string | null>;
  forget(childId: string): Promise<void>;
};

// One bank per child for isolation and one-call deletion (D-07).
export const bankId = (childId: string) => `child_${childId}`;

const BANK_MISSION =
  "Track what keeps this child engaged: interests, task formats, times of day, and what caused frustration. " +
  "Notes come from a parent or teacher. Never infer, name or label medical or psychological conditions.";

async function hindsightStore(): Promise<MemoryStore> {
  const { HindsightClient } = await import("@vectorize-io/hindsight-client");
  const client = new HindsightClient({
    baseUrl: process.env.HINDSIGHT_URL!,
    apiKey: process.env.HINDSIGHT_API_KEY || undefined,
  });

  return {
    mode: "hindsight",

    async ensureBank(childId, nickname) {
      await client.createBank(bankId(childId), { name: `${nickname} (SparkPath)`, mission: BANK_MISSION });
    },

    async retain(childId, item) {
      await client.retain(bankId(childId), item.content, {
        timestamp: item.occurredAt,
        context: item.context,
        tags: [item.context],
      });
    },

    async recall(childId, query, limit = 12) {
      const res = await client.recall(bankId(childId), query, { budget: "mid", maxTokens: 2048 });
      return res.results.slice(0, limit).map((r) => ({
        text: r.text,
        context: r.context ?? undefined,
        occurredAt: r.occurred_start ?? undefined,
      }));
    },

    async reflect(childId, question) {
      const res = await client.reflect(bankId(childId), question, { budget: "mid" });
      return res.text || null;
    },

    async forget(childId) {
      await client.deleteBank(bankId(childId));
    },
  };
}

const STOP = new Set(["the", "a", "an", "and", "or", "what", "which", "of", "to", "in", "for", "is", "was", "it", "did", "do", "this", "that", "on", "at", "with"]);
// Light stemming plus a few domain synonyms, so "bored or upset" finds
// "boring" and "melted down". Hindsight does real semantic recall.
const SYNONYMS: Record<string, string> = {
  bored: "bore", boring: "bore", dull: "bore",
  upset: "hard", meltdown: "hard", melted: "hard", cried: "hard", angry: "hard", frustrated: "hard",
  liked: "like", loved: "like", enjoyed: "like", wants: "like", asked: "like",
};
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => SYNONYMS[w] ?? w.slice(0, 5));

// Fallback when Hindsight isn't configured: notes in Postgres, keyword overlap
// plus recency. Enough for local dev and as a demo safety net (PLAN.md §8).
function localStore(): MemoryStore {
  return {
    mode: "local",

    async ensureBank() {},

    async retain(childId, item) {
      const db = await getDb();
      await db.insert(schema.memoryNotes).values({
        childId,
        context: item.context,
        content: item.content,
        occurredAt: item.occurredAt,
      });
    },

    async recall(childId, query, limit = 12) {
      const db = await getDb();
      const rows = await db
        .select()
        .from(schema.memoryNotes)
        .where(eq(schema.memoryNotes.childId, childId))
        .orderBy(desc(schema.memoryNotes.occurredAt))
        .limit(200);
      const q = new Set(words(query));
      return rows
        .map((r, i) => {
          const overlap = words(r.content).filter((w) => q.has(w)).length;
          const noteBoost = r.context === "adult_note" ? 1 : 0;
          return { r, score: overlap * 2 + noteBoost + 1 / (i + 1) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ r }) => ({ text: r.content, context: r.context, occurredAt: r.occurredAt.toISOString() }));
    },

    async reflect() {
      return null;
    },

    async forget(childId) {
      const db = await getDb();
      await db.delete(schema.memoryNotes).where(eq(schema.memoryNotes.childId, childId));
    },
  };
}

let cached: Promise<MemoryStore> | undefined;

export function getMemory(): Promise<MemoryStore> {
  cached ??= process.env.HINDSIGHT_URL ? hindsightStore() : Promise.resolve(localStore());
  return cached;
}
