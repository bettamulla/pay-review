import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-[100dvh]">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg sm:text-xl font-semibold">
            <span className="inline-block w-7 h-7 sm:w-8 sm:h-8 rounded bg-brand-600 text-white text-center text-sm sm:text-base leading-7 sm:leading-8 font-bold">P</span>
            <span>Pay &amp; Review</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="btn-secondary text-sm hidden sm:inline-flex">Log in</Link>
            <Link href="/signup" className="btn-primary text-sm">Get started</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-20 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
          Get paid faster.<br />Get more reviews.
        </h1>
        <p className="mt-4 sm:mt-6 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
          The autopilot for late invoices and review requests.
          Built for solo operators and small trade businesses who&rsquo;d rather be doing the work.
        </p>
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <Link href="/signup" className="btn-primary text-base px-6 py-3 sm:w-auto">Start free</Link>
          <Link href="/login" className="btn-secondary text-base px-6 py-3 sm:w-auto">I have an account</Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
        <Feature
          title="Chase invoices automatically"
          body="Friendly email + WhatsApp reminders on a smart cadence. Clients pay with one click."
        />
        <Feature
          title="Ask for reviews at the right moment"
          body="Right after payment, when goodwill is highest. One polite follow-up if needed."
        />
        <Feature
          title="See what's working"
          body="A simple dashboard: invoices sent, paid, reviews collected. No spreadsheet needed."
        />
      </section>

      <footer className="border-t border-gray-200 py-8 sm:py-10 mt-12 sm:mt-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-sm text-gray-500">
          © {new Date().getFullYear()} Pay &amp; Review. Built for people who&rsquo;d rather not chase.
        </div>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}
