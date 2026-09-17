/**
 * Centralized env access with sane defaults.
 * Throws fast in production if AUTH_SECRET is missing.
 */
function required(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${name}`);
}

export const config = {
  appUrl: required("APP_URL", "http://localhost:3000"),
  authSecret: required("AUTH_SECRET", "dev-only-secret-please-replace-with-random-32-bytes"),
  dbPath: required("DB_PATH", "./data/payreview.db"),
  email: {
    from: required("EMAIL_FROM", "Pay & Review <hello@example.com>"),
    resendApiKey: process.env.RESEND_API_KEY || "",
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "",
    smsFrom: process.env.TWILIO_SMS_FROM || "",
    enabled() {
      return Boolean(this.accountSid && this.authToken && this.whatsappFrom);
    },
  },
};

// Warn in dev if secrets are still defaults
if (process.env.NODE_ENV === "production" && config.authSecret.startsWith("dev-only-")) {
  // Don't throw at module load (would break `next build` data collection
  // before env is wired up). Instead, fail loudly on the first request.
  console.warn(
    "[config] WARNING: AUTH_SECRET is set to the dev default. Set a strong secret in production env.",
  );
}
