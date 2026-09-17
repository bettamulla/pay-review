/**
 * Database client — fully lazy.
 *
 * The Drizzle + Neon client is created on first query, not at module load.
 * This is critical for Next.js's build phase — the framework "collects page
 * data" during `next build`, which would otherwise try to instantiate the
 * client with a placeholder URL.
 *
 * If DATABASE_URL is missing, the first query will throw with a clear message.
 */
import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import ws from "ws";
import * as schema from "./schema";
import { ensureSchema } from "@/lib/migrate-on-boot";

type Schema = typeof schema;
type DB = NeonHttpDatabase<Schema>;

let _db: DB | null = null;
let _initPromise: Promise<DB> | null = null;

async function realDb(): Promise<DB> {
  if (_db) return _db;
  if (_initPromise) return _initPromise;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. On Vercel: add a Postgres database in the Storage tab. " +
        "Locally: set DATABASE_URL in .env.local.",
    );
  }
  if (typeof WebSocket === "undefined") {
    neonConfig.webSocketConstructor = ws;
  }

  _initPromise = (async () => {
    await ensureSchema();
    const sql: NeonQueryFunction<false, false> = neon(url);
    _db = drizzle(sql, { schema });
    return _db;
  })();

  return _initPromise;
}

/**
 * Lazy proxy. Every method/chain access goes through `realDb()` which awaits
 * the singleton initialization. Works seamlessly with Drizzle's chain API:
 *   await db.query.users.findFirst({ where: eq(...) })
 *   await db.insert(users).values({...})
 */
function makeProxy(target: any = {}): any {
  return new Proxy(target, {
    get(_t, prop) {
      // For symbol access (React internals), just return undefined
      if (typeof prop === "symbol") return undefined;
      return (...args: any[]) =>
        realDb().then((real) => {
          const value = (real as any)[prop];
          if (typeof value === "function") return value.apply(real, args);
          if (value !== null && typeof value === "object") {
            // For nested objects (db.query, db.insert, etc.), wrap in another proxy
            return makeProxy(value);
          }
          return value;
        });
    },
  });
}

export const db = makeProxy() as unknown as DB;
export { schema };
