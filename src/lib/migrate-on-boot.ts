/**
 * Auto-migration: run pending Drizzle migrations on first server-side request.
 *
 * Behavior:
 * - On the first DB query after a fresh deploy, check if the `users` table exists.
 * - If not, run all pending migrations from ./drizzle/ folder.
 * - Subsequent requests skip the check (cached in process memory).
 *
 * This means: push to Vercel → users immediately work → no manual /api/admin/migrate call needed.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { sql } from "drizzle-orm";

let _checked = false;
let _ranMigrations = false;
let _migrating: Promise<void> | null = null;

async function tableExists(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  const client = neon(url);
  const result = await client`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'users'
    ) AS exists
  `;
  return Boolean((result as any)?.[0]?.exists);
}

async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const client = neon(url);
  const db = drizzle(client);
  console.log("[auto-migrate] running pending migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[auto-migrate] done");
  _ranMigrations = true;
}

/**
 * Called from db/index.ts on first access. Idempotent and safe to call repeatedly.
 */
export async function ensureSchema(): Promise<void> {
  if (_checked && _ranMigrations) return;
  if (_migrating) return _migrating;

  _checked = true;
  _migrating = (async () => {
    try {
      const exists = await tableExists();
      if (!exists) {
        await runMigrations();
      } else {
        _ranMigrations = true;
      }
    } catch (err) {
      console.error("[auto-migrate] failed:", err);
      // Reset so the next request retries
      _checked = false;
      throw err;
    } finally {
      _migrating = null;
    }
  })();

  return _migrating;
}
