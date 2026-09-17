# Pay & Review

> **Get paid faster. Get more reviews.** A tiny tool that chases late invoices
> and asks for reviews on autopilot. Built for solo operators and small trade
> businesses who'd rather be doing the work.

[![CI](https://github.com/yourname/payreview/actions/workflows/ci.yml/badge.svg)](https://github.com/yourname/payreview/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourname%2Fpayreview&env=AUTH_SECRET%2CRESEND_API_KEY%2CEMAIL_FROM&envDescription=Required%20environment%20variables&envLink=https%3A%2F%2Fgithub.com%2Fyourname%2Fpayreview%23environment-variables)
📱 **Mobile-ready** — full PWA, installable on iOS & Android home screens

---

---

## What it does

1. **Chases late invoices automatically** via email and WhatsApp on a polite,
   configurable cadence (default: 3 days before due, on due date, then 3, 7,
   and 14 days after).
2. **Asks for reviews at the moment of payment** — when goodwill is highest —
   and follows up once if no click.
3. **One-click "Mark as paid" link** for clients. No accounts, no friction.
4. **Simple dashboard** — invoices sent/paid/overdue, reviews collected, message
   templates.

---

## Quick start (local dev)

```bash
./start.sh
```

You'll need a Postgres database. Free options:

- **Neon** (recommended) — https://neon.tech, free tier, takes 30 seconds to set up
- **Supabase** — free Postgres included with every project
- **Local Docker** — `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres`

Copy the connection string into `.env.local` as `DATABASE_URL`, then run `./start.sh`.
The script will:

- Install dependencies
- Create `.env.local` from `.env.example`
- Generate a strong `AUTH_SECRET` automatically
- Apply database migrations
- Seed a demo user + two sample invoices (one pending, one paid)
- Start the dev server on http://localhost:3000

**Demo login:** `demo@payreview.test` / `demo1234`

---

## Deploy to Vercel (recommended)

The fastest path. Takes about 5 minutes.

### 1. Push to GitHub

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin git@github.com:YOURNAME/payreview.git
git push -u origin main
```

### 2. Import in Vercel

Click "Import Project" → select your repo → Vercel auto-detects it's a Next.js app.

### 3. Add Vercel Postgres

In your Vercel project → **Storage** tab → **Create Database** → **Postgres**.
Vercel will automatically inject `DATABASE_URL` into your environment.

### 4. Set environment variables

In **Settings → Environment Variables**, add:

| Variable | Value | Required |
|---|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` | yes |
| `RESEND_API_KEY` | from resend.com (optional for live email) | no |
| `EMAIL_FROM` | `Your Name <hello@yourdomain.com>` | when using Resend |
| `TWILIO_ACCOUNT_SID` | from twilio.com (optional for WhatsApp) | no |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | when using WhatsApp |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` (sandbox) | when using WhatsApp |

### 5. Deploy & migrate

Hit **Deploy**. Once it's live, hit this URL **once**:

```
POST https://your-app.vercel.app/api/admin/migrate
```

Or with curl:

```bash
curl -X POST https://your-app.vercel.app/api/admin/migrate
```

This applies all pending database migrations. The endpoint is idempotent — safe to
hit multiple times.

### 6. Seed demo data (optional)

To play with sample invoices on your deployed instance:

```bash
# Pull your Vercel env vars locally
vercel env pull .env.local

# Run the seed
npm run db:seed
```

Then sign in at `/login` with `demo@payreview.test` / `demo1234`.

### That's it

Vercel Cron (configured in `vercel.json`) will hit `/api/admin/run-reminders`
every minute. Invoice chase reminders and post-payment review requests will fire
automatically.

---

## Manual setup (without start.sh)

```bash
npm install
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL and APP_URL

# Generate + apply migrations
npm run db:generate
npm run db:init

# (Optional) seed demo data
npm run db:seed

# Start dev server
npm run dev
```

In another terminal, optionally run the local cron worker:

```bash
npm run cron:run    # every minute, like Vercel Cron but for local dev
```

---

## Configuration

| Variable | Required for | Notes |
|---|---|---|
| `APP_URL` | local + prod | Base URL used in pay-link emails |
| `AUTH_SECRET` | always | `openssl rand -base64 32`. Generate one for prod. |
| `DATABASE_URL` | always | Postgres connection string. Auto-set by Vercel Postgres. |
| `RESEND_API_KEY` | live email | Leave empty to use the **console transport** (dev only) |
| `EMAIL_FROM` | live email | e.g. `Acme Billing <billing@yourdomain.com>` |
| `TWILIO_ACCOUNT_SID` | live WhatsApp | Twilio credentials |
| `TWILIO_AUTH_TOKEN` | live WhatsApp | |
| `TWILIO_WHATSAPP_FROM` | live WhatsApp | e.g. `whatsapp:+14155238886` |
| `CRON_SECRET` | optional | Only needed to hit `/api/admin/*` from outside Vercel |

### Email & WhatsApp in dev mode

Out of the box (no API keys), all outbound messages print to the terminal —
great for testing. To send real messages, drop a Resend key into `.env.local`
and restart. No code changes required.

### Twilio / WhatsApp note

Meta requires **pre-approved message templates** for outbound WhatsApp from
business accounts. Apply at
https://business.facebook.com/wa/manage/message-templates/ before going live.

---

## How the flow works

```
┌──────────────┐    create invoice    ┌──────────────────┐
│  Dashboard   │ ──────────────────► │  Postgres        │
│              │                     │  (invoices,      │
└──────────────┘                     │   reminders)     │
        │                            └──────────────────┘
        │ share pay link                      │
        ▼                                     ▼
┌──────────────────┐   mark as paid   ┌──────────────────┐
│ /pay/<token>     │ ────────────────►│ cancel reminders │
│ (public, no auth)│                  │ fire thank-you   │
└──────────────────┘                  │ schedule review  │
                                      └──────────────────┘
```

1. Create an invoice in the dashboard → 10 reminders are auto-scheduled
   (5 offsets × 2 channels).
2. Share the `https://yourapp.com/pay/<token>` URL with the client.
3. Client clicks **Mark as paid**.
4. All pending chase reminders are cancelled.
5. A **thank-you + review request** email goes out within seconds.
6. If no review link click in 5 days, a **polite follow-up** is sent.

---

## Project structure

```
.
├── README.md
├── LICENSE                  MIT
├── vercel.json              Cron schedule
├── drizzle.config.ts        Drizzle Kit config
├── drizzle/                 Generated SQL migrations (commit these!)
│   └── 0000_init.sql
├── start.sh                 one-shot dev runner
├── .env.example
├── .github/workflows/ci.yml typecheck + build + PGlite smoke test
├── src/
│   ├── app/                 Next.js App Router
│   │   ├── page.tsx               marketing landing
│   │   ├── login/, signup/        auth pages
│   │   ├── dashboard/             authed app
│   │   │   ├── page.tsx                overview / stats
│   │   │   ├── invoices/               list + create
│   │   │   ├── reviews/                review stats
│   │   │   └── settings/               templates + links
│   │   ├── pay/[token]/           public "mark as paid" page
│   │   └── api/                   JSON endpoints
│   ├── lib/
│   │   ├── reminders.ts           scheduling + dispatch engine
│   │   ├── messaging.ts           Resend + Twilio (with console fallback)
│   │   ├── templates.ts           defaults + {{placeholder}} renderer
│   │   ├── auth.ts                JWT cookies
│   │   ├── session.ts             session helper for RSC
│   │   ├── config.ts              env access
│   │   └── cron-runner.ts         local-only cron worker
│   ├── db/
│   │   ├── schema.ts              Drizzle Postgres schema
│   │   ├── index.ts               lazy Neon HTTP client
│   │   ├── init.ts                apply migrations
│   │   ├── seed.ts                demo data
│   │   └── smoke-test.ts          PGlite e2e test (dev only)
│   └── types/global.d.ts
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── package.json
```

---

## What's not in this MVP (next up)

- Stripe / PayPal webhooks for automatic "mark as paid" (closes the trust gap)
- Email-forwarding intake (parse inbound emails at `invoices@yourdomain.com`)
- Multi-user teams
- Multi-currency reporting
- White-label thank-you / review landing page

PRs welcome on any of these.

---

## Mobile & PWA

The app is a Progressive Web App — installable on iOS and Android home screens,
works offline for the marketing + pay pages, and uses native mobile patterns
throughout:

| Feature | iOS | Android |
|---|---|---|
| Responsive layout | ✓ | ✓ |
| Safe-area insets (notch) | ✓ | ✓ |
| 100dvh viewport (handles Safari address bar) | ✓ | ✓ |
| Native keyboard hints (`inputMode`, `enterKeyHint`) | ✓ | ✓ |
| Touch targets ≥ 44pt | ✓ | ✓ |
| Apple touch icon | ✓ | n/a |
| Install to home screen | ✓ | ✓ |
| Offline pay page shell | ✓ | ✓ |
| `theme-color` (browser chrome tinting) | ✓ | ✓ |

To install on a phone: open the deployed URL in Safari (iOS) or Chrome
(Android), tap Share → Add to Home Screen.

---

## License

MIT — see [LICENSE](./LICENSE).
