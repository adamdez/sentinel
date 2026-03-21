import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Who We Are — Dominion Home Deals, Spokane",
  description:
    "Dominion Home Deals is a local cash home buyer based in Spokane, WA. We buy houses in Spokane County and Kootenai County. Small team, honest process.",
};

/**
 * /sell/about — Who we are / local proof
 *
 * Answers the trust question: "Who are these people and are they legitimate?"
 * Used for attribution searches, answer-engine discovery, and as a follow-up
 * link operators can send to sellers who want to research before calling back.
 *
 * No testimonials, no inflated claims, no fake social proof.
 * Just honest framing: local, small team, direct buyer.
 *
 * BOUNDARY: No internal imports, no auth, no CRM logic.
 */

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-14 space-y-14">

      {/* ── Hero ── */}
      <section className="space-y-4">
        <p className="text-sm font-medium text-foreground tracking-wide uppercase">About Us</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
          We&rsquo;re a local buyer.<br className="hidden sm:block" /> Not a fund. Not a franchise.
        </h1>
        <p className="text-lg text-foreground leading-relaxed max-w-xl">
          Dominion Home Deals is a small, local company based in Spokane, Washington.
          We buy houses directly in Spokane County and Kootenai County — no agents,
          no middlemen, no out-of-state investors running the process remotely.
        </p>
      </section>

      {/* ── Who we are ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Who we are</h2>
        <div className="space-y-3 text-foreground leading-relaxed">
          <p>
            We&rsquo;re a small acquisitions team. When you call us, you&rsquo;re talking to the people
            who actually work the deals — not a call center, not an automated system, not a
            national franchise answering a local number.
          </p>
          <p>
            We buy houses with cash and we do it directly. That means no listing on the market,
            no open houses, no agents involved on our side, and no commissions coming out of your proceeds.
          </p>
          <p>
            We&rsquo;ve been buying in this market because we know it. Spokane County and Kootenai County
            are where we operate — we understand the neighborhoods, the price ranges, and the
            types of situations sellers deal with here.
          </p>
        </div>
      </section>

      {/* ── What we do and don't do ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">What we do — and don&rsquo;t do</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: "We do",     items: [
              "Buy houses directly for cash",
              "Work with as-is properties — no repairs required",
              "Close on a timeline that works for the seller",
              "Work with inherited and estate properties",
              "Give honest offers based on real numbers",
            ]},
            { label: "We don't",  items: [
              "List your home on the MLS",
              "Charge commissions or agent fees",
              "Pressure sellers into decisions",
              "Use high-pressure sales tactics",
              "Make promises we can't keep",
            ]},
          ].map(({ label, items }) => (
            <div key={label} className="rounded-xl border border-border bg-muted p-4">
              <p className={`font-semibold text-sm mb-2 ${label === "We do" ? "text-foreground" : "text-foreground"}`}>
                {label}
              </p>
              <ul className="space-y-1">
                {items.map(item => (
                  <li key={item} className="text-sm text-foreground flex items-start gap-1.5">
                    <span className={`mt-1.5 w-1 h-1 rounded-full flex-shrink-0 ${label === "We do" ? "bg-muted" : "bg-muted"}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Where we buy ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Where we buy</h2>
        <p className="text-foreground leading-relaxed">
          Our primary market is <strong className="text-foreground">Spokane County, WA</strong> — including Spokane,
          Spokane Valley, Liberty Lake, Cheney, and surrounding areas.
          We also buy in <strong className="text-foreground">Kootenai County, ID</strong> — including
          Coeur d&rsquo;Alene, Post Falls, Hayden, and surrounding areas.
          Rural properties in these counties are fine.
        </p>
        <p className="text-foreground text-sm leading-relaxed">
          If you&rsquo;re not sure whether your property falls in our area, just call us.
        </p>
      </section>

      {/* ── How we find sellers ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">How we find sellers</h2>
        <p className="text-foreground leading-relaxed">
          We find properties through public records — assessor data, tax rolls, and similar sources.
          We reach out to homeowners who might be open to a cash offer based on publicly available information.
          We are not a spam operation and we don&rsquo;t purchase lists of people who have asked to not
          be contacted.
        </p>
        <p className="text-foreground leading-relaxed">
          If we reached out to you and you&rsquo;re not interested, just tell us and we&rsquo;ll stop.
          No pushback, no follow-up.
        </p>
      </section>

      {/* ── Contact ── */}
      <section className="rounded-2xl bg-muted border border-border px-6 py-8 space-y-3">
        <p className="font-semibold text-foreground text-lg">Questions? Just call.</p>
        <p className="text-foreground text-sm leading-relaxed">
          We answer calls during business hours. If we miss you, we call back.
          You&rsquo;re talking to the actual team — not a call center.
        </p>
        <a
          href="tel:+15098001234"
          className="inline-flex items-center gap-2 bg-muted hover:bg-muted text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          (509) 800-1234
        </a>
        <div className="pt-2">
          <a href="/sell" className="text-sm text-foreground hover:underline">
            See how the process works →
          </a>
        </div>
      </section>

    </div>
  );
}
