/**
 * Reminder engine: schedules all pending reminders for an invoice,
 * and a cron-runner that scans the DB for due reminders and sends them.
 */
import { addDays, format, parseISO, isAfter, isBefore } from "date-fns";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { invoices, reminders, reviewRequests, users } from "@/db/schema";
import { and, eq, lte, isNull, ne } from "drizzle-orm";
import {
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
  DEFAULT_THANK_YOU_TEMPLATE,
  render,
} from "./templates";
import { sendEmail, sendWhatsApp } from "./messaging";
import { config } from "./config";

const REMINDER_ID = () => nanoid(16);
const REVIEW_ID = () => nanoid(16);

/**
 * When a new invoice is created, schedule all its chase reminders.
 * Idempotent: if reminders already exist for the invoice, skip.
 */
export async function scheduleInvoiceReminders(invoiceId: string): Promise<number> {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv) throw new Error(`Invoice ${invoiceId} not found`);

  const user = await db.query.users.findFirst({ where: eq(users.id, inv.userId) });
  if (!user) throw new Error(`User ${inv.userId} not found`);

  // Idempotency: if we already have reminders, don't double-schedule
  const existing = await db.query.reminders.findFirst({ where: eq(reminders.invoiceId, invoiceId) });
  if (existing) return 0;

  const offsets = user.reminderOffsets
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));

  const due = parseISO(inv.dueDate);
  const channels: Array<"email" | "whatsapp"> = ["email"];
  if (user.contactPhone || inv.clientPhone) channels.push("whatsapp");

  let scheduled = 0;
  for (const offset of offsets) {
    const when = addDays(due, offset);
    // Don't schedule reminders in the past
    if (isBefore(when, new Date())) continue;

    for (const channel of channels) {
      await db.insert(reminders).values({
        id: REMINDER_ID(),
        invoiceId: inv.id,
        kind: "reminder",
        channel,
        scheduledAt: when,
        offsetDays: offset,
        status: "scheduled",
      });
      scheduled++;
    }
  }

  // Schedule the post-payment thank-you + review request to go out
  // a few minutes after the invoice is created (so it's near-immediate
  // but doesn't fire during the request lifecycle).
  // We actually fire it from markInvoicePaid() — that's the right trigger.
  // But we also create a review_requests row now as a placeholder.
  await db.insert(reviewRequests).values({
    id: REVIEW_ID(),
    invoiceId: inv.id,
  }).onConflictDoNothing();

  return scheduled;
}

/**
 * Mark an invoice as paid (via the public paidToken link).
 * Cancels pending reminders and fires the thank-you + review request.
 */
export async function markInvoicePaidByToken(token: string): Promise<{ ok: boolean; invoiceId?: string }> {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.paidToken, token) });
  if (!inv) return { ok: false };
  if (inv.status === "paid") return { ok: true, invoiceId: inv.id };

  const now = new Date();
  await db
    .update(invoices)
    .set({ status: "paid", paidAt: now })
    .where(eq(invoices.id, inv.id));

  // Cancel all pending chase reminders
  await db
    .update(reminders)
    .set({ status: "cancelled" })
    .where(and(eq(reminders.invoiceId, inv.id), eq(reminders.status, "scheduled")));

  // Fire the thank-you / review request now
  await fireThankYou(inv.id);

  return { ok: true, invoiceId: inv.id };
}

/**
 * Fire the post-payment thank-you + review request for an invoice.
 * Idempotent: only fires once (review_request.sent_at is set).
 */
export async function fireThankYou(invoiceId: string): Promise<void> {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv) return;
  const user = await db.query.users.findFirst({ where: eq(users.id, inv.userId) });
  if (!user) return;

  const rr = await db.query.reviewRequests.findFirst({ where: eq(reviewRequests.invoiceId, invoiceId) });
  if (!rr) return;
  if (rr.sentAt) return; // already sent

  const reviewLink = pickReviewLink(user, inv.reviewPlatform || "google");
  const template = user.thankYouTemplate || DEFAULT_THANK_YOU_TEMPLATE;
  const message = render(template, {
    clientName: inv.clientName,
    amount: formatAmount(inv.amount, inv.currency),
    dueDate: inv.dueDate,
    invoiceNumber: inv.invoiceNumber,
    businessName: user.businessName,
    reviewLink,
  });

  // We send the thank-you via email (simpler, higher deliverability)
  // and the review link is included.
  const subject = `Thanks for your payment — ${user.businessName}`;
  const html = wrapHtml(message);
  const result = await sendEmail({
    to: inv.clientEmail,
    subject,
    html,
    text: message,
  });

  const now = new Date();
  await db
    .update(reviewRequests)
    .set({ sentAt: now })
    .where(eq(reviewRequests.invoiceId, invoiceId));

  // If sending failed, log it on the reminder side too for diagnostics
  if (!result.ok) {
    console.error(`[thank-you] failed to send for invoice ${invoiceId}: ${result.error}`);
  } else {
    console.log(`[thank-you] sent for invoice ${invoiceId} via ${result.via}`);
  }

  // Schedule a 5-day follow-up if no click
  await db.insert(reminders).values({
    id: REMINDER_ID(),
    invoiceId: inv.id,
    kind: "thank_you_followup",
    channel: "email",
    scheduledAt: addDays(now, 5),
    status: "scheduled",
  });
}

function pickReviewLink(user: typeof users.$inferSelect, platform: string): string {
  switch (platform) {
    case "trustpilot":
      return user.reviewLinkTrustpilot || user.reviewLinkGoogle || user.reviewLinkCustom || "";
    case "custom":
      return user.reviewLinkCustom || user.reviewLinkGoogle || "";
    case "google":
    default:
      return user.reviewLinkGoogle || user.reviewLinkTrustpilot || user.reviewLinkCustom || "";
  }
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * The cron tick: send every reminder whose scheduledAt <= now.
 * Returns the number of reminders processed.
 */
export async function processDueReminders(now: Date = new Date()): Promise<number> {
  const due = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.status, "scheduled"),
        lte(reminders.scheduledAt, now),
        // Don't fire thank_you_followup unless no click yet
      ),
    );

  let processed = 0;
  for (const r of due) {
    const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, r.invoiceId) });
    if (!inv) {
      await db.update(reminders).set({ status: "cancelled" }).where(eq(reminders.id, r.id));
      continue;
    }
    if (inv.status !== "pending" && r.kind === "reminder") {
      // Invoice already paid/cancelled — no point chasing
      await db.update(reminders).set({ status: "cancelled" }).where(eq(reminders.id, r.id));
      continue;
    }

    // For the follow-up, only send if the review wasn't clicked
    if (r.kind === "thank_you_followup") {
      const rr = await db.query.reviewRequests.findFirst({ where: eq(reviewRequests.invoiceId, inv.id) });
      if (rr?.clickedAt) {
        await db.update(reminders).set({ status: "cancelled" }).where(eq(reminders.id, r.id));
        continue;
      }
      await sendFollowUp(inv.id);
      await db
        .update(reviewRequests)
        .set({ followUpSentAt: new Date() })
        .where(eq(reviewRequests.invoiceId, inv.id));
    } else {
      await sendChaseReminder(inv.id, r.channel as "email" | "whatsapp", r.offsetDays ?? 0);
    }

    await db
      .update(reminders)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(reminders.id, r.id));
    processed++;
  }

  return processed;
}

async function sendChaseReminder(
  invoiceId: string,
  channel: "email" | "whatsapp",
  offsetDays: number,
): Promise<void> {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv) return;
  const user = await db.query.users.findFirst({ where: eq(users.id, inv.userId) });
  if (!user) return;

  const payLink = buildPayLink(inv.paidToken);
  const vars = {
    clientName: inv.clientName,
    amount: formatAmount(inv.amount, inv.currency),
    dueDate: inv.dueDate,
    invoiceNumber: inv.invoiceNumber,
    businessName: user.businessName,
    payLink,
  };

  const subject = subjectForOffset(offsetDays, user.businessName, inv.invoiceNumber);
  const emailBody = render(user.emailTemplate || DEFAULT_EMAIL_TEMPLATE, vars);
  const whatsappBody = render(user.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE, vars);

  if (channel === "email") {
    await sendEmail({
      to: inv.clientEmail,
      subject,
      html: wrapHtml(emailBody),
      text: emailBody,
    });
  } else {
    const phone = inv.clientPhone || user.contactPhone;
    if (!phone) return;
    await sendWhatsApp({ to: phone, body: whatsappBody });
  }
}

async function sendFollowUp(invoiceId: string): Promise<void> {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv) return;
  const user = await db.query.users.findFirst({ where: eq(users.id, inv.userId) });
  if (!user) return;

  const reviewLink = pickReviewLink(user, inv.reviewPlatform || "google");
  const message = `Hi ${inv.clientName} — just bumping this in case you missed it. If you have a moment, a quick review would mean the world to ${user.businessName}: ${reviewLink}\n\nThanks again for your business! 🙏`;
  await sendEmail({
    to: inv.clientEmail,
    subject: `Quick favor? A review for ${user.businessName}`,
    html: wrapHtml(message),
    text: message,
  });
}

function subjectForOffset(offsetDays: number, business: string, num: string): string {
  if (offsetDays < 0) return `Heads up — invoice ${num} due in ${Math.abs(offsetDays)} day${Math.abs(offsetDays) === 1 ? "" : "s"}`;
  if (offsetDays === 0) return `Invoice ${num} is due today — ${business}`;
  if (offsetDays < 7) return `Invoice ${num} is ${offsetDays} day${offsetDays === 1 ? "" : "s"} overdue`;
  return `Invoice ${num} — payment now ${offsetDays} days overdue`;
}

function buildPayLink(token: string): string {
  return `${config.appUrl}/pay/${token}`;
}

function wrapHtml(text: string): string {
  const safe = text
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">${safe}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export { buildPayLink };
