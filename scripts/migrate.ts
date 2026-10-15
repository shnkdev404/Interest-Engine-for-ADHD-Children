/**
 * Applies SQL migrations (db/migrations) to DATABASE_URL, or local PGlite.
 * Runs on every Vercel build via the "vercel-build" script, before next build.
 *
 *   npm run db:migrate
 */
import { migrateDb, usingLocalDb } from "../db";

migrateDb()
  .then(() => {
    console.log(`Migrations applied (${usingLocalDb() ? "local PGlite" : "DATABASE_URL"}).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
