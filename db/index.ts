import path from "node:path";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

export { schema };

// Both drivers expose the same query API. We type the handle as the
// postgres-js flavour so call sites don't fight a union of overloads.
export type DB = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "db", "migrations");
// Local dev/test DB when DATABASE_URL is unset: embedded Postgres (PGlite).
const LOCAL_DIR = path.join(process.cwd(), ".data", "pglite");

// One connection per process, kept on globalThis: Next's dev server can load
// this module more than once (hot reload, separate route bundles), and two
// PGlite instances on the same folder don't see each other's writes.
const g = globalThis as typeof globalThis & { __sparkpathDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  g.__sparkpathDb ??= connect();
  return g.__sparkpathDb;
}

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    // Serverless: one connection per instance; Neon's pooler does the rest.
    return drizzle(postgres(url, { max: process.env.VERCEL ? 1 : 5, prepare: false }), { schema });
  }
  if (process.env.VERCEL) {
    // Serverless file systems are read-only and per-instance: PGlite would
    // lose data between requests. Fail loudly instead.
    throw new Error("DATABASE_URL is not set. Add the Neon connection string in Vercel project settings.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? LOCAL_DIR;
  // PGlite creates the leaf folder but not its parents.
  (await import("node:fs")).mkdirSync(path.dirname(dir), { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  // Local DB keeps itself current; production migrates at build (vercel-build).
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

export async function migrateDb(db?: DB): Promise<void> {
  const handle = db ?? (await getDb());
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(handle, { migrationsFolder: MIGRATIONS });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // Runtime handle is a PGlite drizzle instance (see connect()).
    await migrate(handle as unknown as Parameters<typeof migrate>[0], {
      migrationsFolder: MIGRATIONS,
    });
  }
}

export function usingLocalDb(): boolean {
  return !process.env.DATABASE_URL;
}
