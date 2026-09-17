/**
 * CLI: apply pending migrations to the database.
 *
 * Run locally with: npm run db:init
 * Requires DATABASE_URL in .env.local or environment.
 *
 * In production (Vercel), migrations auto-run on first request — no manual step needed.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "[db:init] DATABASE_URL is required.\n" +
      "  • On Vercel: add a Postgres database in the Storage tab.\n" +
      "  • Locally: set DATABASE_URL in .env.local.",
  );
  process.exit(1);
}

async function main() {
  const dbUrl = url as string;
  const sql = neon(dbUrl);
  const db = drizzle(sql);
  console.log("[db:init] applying migrations to", maskUrl(dbUrl));
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[db:init] done");
}

function maskUrl(u: string): string {
  try {
    const parsed = new URL(u);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "***";
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
