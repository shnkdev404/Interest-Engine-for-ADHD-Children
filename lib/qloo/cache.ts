import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";

import type { QlooCache } from "./client";

// Private server-side cache (allowed by Qloo, no expiry; D-09). Lives only in
// our database, never in the repo.
export const dbCache: QlooCache = {
  key(path, query) {
    const sorted = Object.keys(query)
      .sort()
      .map((k) => [k, query[k]]);
    return createHash("sha256").update(path + JSON.stringify(sorted)).digest("hex");
  },

  async get(key) {
    const db = await getDb();
    const [row] = await db.select().from(schema.qlooCache).where(eq(schema.qlooCache.key, key)).limit(1);
    return row?.response;
  },

  async set(key, path, query, response) {
    const db = await getDb();
    await db
      .insert(schema.qlooCache)
      .values({ key, path, query, response: response as object })
      .onConflictDoUpdate({ target: schema.qlooCache.key, set: { response: response as object } });
  },
};
