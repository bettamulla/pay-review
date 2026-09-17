import { pgTable, text, integer, doublePrecision, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Users — the small business owner / freelancer.
 * Auth is email + password (hashed with bcrypt).
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  businessName: text("business_name").notNull().default("My Business"),
  contactPhone: text("contact_phone"),
  logoUrl: text("logo_url"),

  // Per-channel review links. User picks one or both on the request.
  reviewLinkGoogle: text("review_link_google"),
  reviewLinkTrustpilot: text("review_link_trustpilot"),
  reviewLinkCustom: text("review_link_custom"),

  // Reminder template — simple placeholders: {{clientName}} {{amount}} {{dueDate}} {{invoiceNumber}} {{businessName}}
  emailTemplate: text("email_template"),
  whatsappTemplate: text("whatsapp_template"),
  thankYouTemplate: text("thank_you_template"),

  // Reminder cadence (days relative to due date). Negative = before due, positive = after.
  reminderOffsets: text("reminder_offsets").notNull().default("-3,0,3,7,14"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Invoices — what we chase.
 * `paidToken` is the public-facing "Mark as paid" link we send to clients.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    invoiceNumber: text("invoice_number").notNull(),
    clientName: text("client_name").notNull(),
    clientEmail: text("client_email").notNull(),
    clientPhone: text("client_phone"),

    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    description: text("description"),

    // ISO date string (YYYY-MM-DD) for the due date
    dueDate: text("due_date").notNull(),
    issuedDate: text("issued_date").notNull(),

    // pending | paid | cancelled
    status: text("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),

    // Public-facing payment page token
    paidToken: text("paid_token").notNull(),

    // Which review link to send when paid
    reviewPlatform: text("review_platform"), // "google" | "trustpilot" | "custom"

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    paidTokenIdx: uniqueIndex("invoices_paid_token_idx").on(t.paidToken),
    userIdx: index("invoices_user_idx").on(t.userId),
    statusIdx: index("invoices_status_idx").on(t.status),
  }),
);

/**
 * Reminders — one row per scheduled + sent reminder.
 * `scheduledAt` is when the cron should send. `sentAt` is filled when actually delivered.
 * `kind`: "reminder" (chase) | "thank_you_followup"
 * `channel`: "email" | "whatsapp"
 */
export const reminders = pgTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),

    kind: text("kind").notNull(), // reminder | thank_you_followup
    channel: text("channel").notNull(), // email | whatsapp
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),

    // Day offset from due date (only for kind=reminder). e.g. -3, 0, 3, 7, 14
    offsetDays: integer("offset_days"),

    status: text("status").notNull().default("scheduled"), // scheduled | sent | failed | cancelled
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    scheduledIdx: index("reminders_scheduled_idx").on(t.status, t.scheduledAt),
    invoiceIdx: index("reminders_invoice_idx").on(t.invoiceId),
  }),
);

/**
 * Review requests — track whether the post-payment thank-you converted.
 * One per invoice.
 */
export const reviewRequests = pgTable("review_requests", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id")
    .notNull()
    .unique()
    .references(() => invoices.id, { onDelete: "cascade" }),

  sentAt: timestamp("sent_at", { withTimezone: true }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  followUpSentAt: timestamp("follow_up_sent_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type ReviewRequest = typeof reviewRequests.$inferSelect;
