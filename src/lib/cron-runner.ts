/**
 * Local-only cron runner. On Vercel, cron jobs hit /api/admin/run-reminders
 * via vercel.json. Use this only when developing locally and you don't want
 * to wait for a manual cron call.
 *
 * Run with: npm run cron:run
 */
import cron from "node-cron";
import { processDueReminders } from "./reminders";

console.log("[cron] starting — every minute (Ctrl-C to stop)");

cron.schedule("* * * * *", async () => {
  try {
    const n = await processDueReminders(new Date());
    if (n > 0) console.log(`[cron] processed ${n} reminder(s)`);
  } catch (err) {
    console.error("[cron] error", err);
  }
});

process.on("SIGINT", () => {
  console.log("\n[cron] shutting down");
  process.exit(0);
});
