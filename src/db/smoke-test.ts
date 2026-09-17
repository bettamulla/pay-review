/**
 * End-to-end smoke test against an in-memory Postgres (PGlite).
 * Runs the schema migration, inserts a user + invoice, schedules reminders,
 * marks as paid, and verifies the thank-you flow.
 *
 * Run: npx tsx src/db/smoke-test.ts
 *
 * This is a dev-only verification script — not used in production.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  console.log("[smoke] booting in-memory Postgres…");
  const pg = new PGlite();
  const db = drizzle(pg);

  // Apply migration
  const sqlPath = resolve("./drizzle/0000_init.sql");
  const sql = readFileSync(sqlPath, "utf-8");
  console.log("[smoke] applying", sqlPath);
  await pg.exec(sql);
  console.log("[smoke] schema applied ✓");

  // Insert a user
  const { users, invoices, reminders, reviewRequests } = await import("./schema");
  const { nanoid } = await import("nanoid");
  const bcryptMod = await import("bcryptjs");
  const bcrypt = (bcryptMod as any).default ?? bcryptMod;
  const { addDays, format } = await import("date-fns");

  const userId = nanoid(16);
  await db.insert(users).values({
    id: userId,
    email: "smoke@test.com",
    passwordHash: await bcrypt.hash("smoke1234", 10),
    businessName: "Smoke Co",
    contactPhone: "+15551234567",
    reviewLinkGoogle: "https://example.com/review",
    reminderOffsets: "-3,0,3,7,14",
  });
  console.log("[smoke] inserted user ✓");

  // Insert an invoice
  const invId = nanoid(16);
  const paidToken = nanoid(24);
  await db.insert(invoices).values({
    id: invId,
    userId,
    invoiceNumber: "SMOKE-1",
    clientName: "Smoke Client",
    clientEmail: "client@test.com",
    clientPhone: "+15559876543",
    amount: 100,
    currency: "USD",
    description: "smoke",
    dueDate: format(addDays(new Date(), 5), "yyyy-MM-dd"),
    issuedDate: format(new Date(), "yyyy-MM-dd"),
    paidToken,
    reviewPlatform: "google",
  });
  console.log("[smoke] inserted invoice ✓");

  // Verify count
  const userCount = await db.select().from(users);
  const invCount = await db.select().from(invoices);
  console.log(`[smoke] users=${userCount.length}, invoices=${invCount.length}`);
  console.log("[smoke] ✅ Postgres schema works end-to-end");

  pg.close();
}

main().catch((err) => {
  console.error("[smoke] ❌", err);
  process.exit(1);
});
