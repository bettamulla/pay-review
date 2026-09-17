/**
 * Seed: one demo user, two invoices (one pending with reminders scheduled,
 * one already paid so you can see the review flow).
 *
 * Run: npm run db:seed
 */
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { addDays, format } from "date-fns";
import { db } from "./index";
import { users, invoices, reviewRequests } from "./schema";
import { scheduleInvoiceReminders, markInvoicePaidByToken } from "../lib/reminders";
import { sql } from "drizzle-orm";

const DEMO_EMAIL = "demo@payreview.test";
const DEMO_PASSWORD = "demo1234";

async function main() {
  console.log("[seed] resetting demo data");
  await db.delete(users).where(sql`email = ${DEMO_EMAIL}`);

  const userId = nanoid(16);
  await db.insert(users).values({
    id: userId,
    email: DEMO_EMAIL,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
    businessName: "Acme Electric",
    contactPhone: "+15551234567",
    reviewLinkGoogle: "https://search.google.com/local/writereview?placeid=ChIJ-example",
    reviewLinkTrustpilot: "https://www.trustpilot.com/evaluate/example.com",
    reminderOffsets: "-3,0,3,7,14",
  });

  // Invoice A: due 5 days from now — we'll see "due in 0 days" + "3 days after" scheduled
  const dueA = format(addDays(new Date(), 5), "yyyy-MM-dd");
  const idA = nanoid(16);
  const tokenA = nanoid(24);
  await db.insert(invoices).values({
    id: idA,
    userId,
    invoiceNumber: "INV-1001",
    clientName: "Cafe Lumen",
    clientEmail: "ops@cafelumen.test",
    clientPhone: "+15559876543",
    amount: 1250.0,
    currency: "USD",
    description: "Electrical rewire — back of house",
    dueDate: dueA,
    issuedDate: format(new Date(), "yyyy-MM-dd"),
    paidToken: tokenA,
    reviewPlatform: "google",
  });
  await scheduleInvoiceReminders(idA);

  // Invoice B: paid 2 days ago
  const paidToken = nanoid(24);
  const idB = nanoid(16);
  await db.insert(invoices).values({
    id: idB,
    userId,
    invoiceNumber: "INV-1000",
    clientName: "Studio Bond",
    clientEmail: "hello@studiobond.test",
    clientPhone: "+15555550000",
    amount: 480.0,
    currency: "USD",
    description: "Lighting design consult",
    dueDate: format(addDays(new Date(), -7), "yyyy-MM-dd"),
    issuedDate: format(addDays(new Date(), -21), "yyyy-MM-dd"),
    paidToken,
    reviewPlatform: "trustpilot",
  });
  await scheduleInvoiceReminders(idB);
  await markInvoicePaidByToken(paidToken);

  const baseUrl = process.env.APP_URL || "http://localhost:3000";
  console.log("\n✅ Seeded:");
  console.log(`   Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   Pay link A (pending): ${baseUrl}/pay/${tokenA}`);
  console.log(`   Pay link B (paid):    ${baseUrl}/pay/${paidToken}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
