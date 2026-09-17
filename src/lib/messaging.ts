/**
 * Messaging layer: email via Resend (with console fallback for dev),
 * WhatsApp via Twilio (gated by env).
 */
import { Resend } from "resend";
import twilio from "twilio";
import { config } from "./config";

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendResult =
  | { ok: true; providerId: string; via: "resend" | "console" }
  | { ok: false; error: string };

export async function sendEmail(args: SendEmailArgs): Promise<SendResult> {
  if (!config.email.resendApiKey) {
    // Dev / no-key mode: log to console, return success
    console.log("\n──── EMAIL (console transport) ────");
    console.log("To:     ", args.to);
    console.log("Subject:", args.subject);
    console.log("Body:\n", args.text || args.html);
    console.log("────────────────────────────────────\n");
    return { ok: true, providerId: `console-${Date.now()}`, via: "console" };
  }

  try {
    const resend = new Resend(config.email.resendApiKey);
    const result = await resend.emails.send({
      from: config.email.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, providerId: result.data?.id || "unknown", via: "resend" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type SendWhatsAppArgs = {
  to: string; // E.164 like +15551234567
  body: string;
};

export async function sendWhatsApp(args: SendWhatsAppArgs): Promise<SendResult> {
  if (!config.twilio.enabled()) {
    console.log("\n──── WHATSAPP (console transport — Twilio not configured) ────");
    console.log("To:  ", args.to);
    console.log("Body:", args.body);
    console.log("───────────────────────────────────────────────────────────────\n");
    return { ok: true, providerId: `console-${Date.now()}`, via: "console" };
  }

  try {
    const client = twilio(config.twilio.accountSid, config.twilio.authToken);
    const msg = await client.messages.create({
      from: config.twilio.whatsappFrom,
      to: `whatsapp:${args.to}`,
      body: args.body,
    });
    return { ok: true, providerId: msg.sid, via: "resend" as any };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
