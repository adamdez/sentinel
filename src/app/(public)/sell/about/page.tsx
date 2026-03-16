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
        <p className="text-sm font-medium text-emerald-700 tracking-wide uppercase">About Us</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
          We&rsquo;re a local buyer.<br className="hidden sm:block" /> Not a fund. Not a franchise.
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed max-w-xl">
          Dominion Home Deals is a small, local company based in Spokane, Washington.
          We buy houses directly in Spokane County and Kootenai County — no agents,
          no middlemen, no out-of-state investors running the process remotely.
        </p>
      </section>

      {/* ── Who we are ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Who we are</h2>
        <div className="space-y-3 text-gray-500 leading-relaxed">
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
        <h2 className="text-xl font-semibold text-gray-800">What we do — and don&rsquo;t do</h2>
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
            <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className={`font-semibold text-sm mb-2 ${label === "We do" ? "text-emerald-700" : "text-gray-500"}`}>
                {label}
              </p>
              <ul className="space-y-1">
                {items.map(item => (
                  <li key={item} className="text-sm text-gray-600 flex items-start gap-1.5">
                    <span className={`mt-1.5 w-1 h-1 rounded-full flex-shrink-0 ${label === "We do" ? "bg-emerald-500" : "bg-gray-300"}`} />
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
        <h2 className="text-xl font-semibold text-gray-800">Where we buy</h2>
        <p className="text-gray-500 leading-relaxed">
          Our primary market is <strong className="text-gray-700">Spokane County, WA</strong> — including Spokane,
          Spokane Valley, Liberty Lake, Cheney, and surrounding areas.
          We also buy in <strong className="text-gray-700">Kootenai County, ID</strong> — including
          Coeur d&rsquo;Alene, Post Falls, Hayden, and surrounding areas.
          Rural properties in these counties are fine.
        </p>
        <p className="text-gray-500 text-sm leading-relaxed">
          If you&rsquo;re not sure whether your property falls in our area, just call us.
        </p>
      </section>

      {/* ── How we find sellers ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-800">How we find sellers</h2>
        <p className="text-gray-500 leading-relaxed">
          We find properties through public records — assessor data, tax rolls, and similar sources.
          We reach out to homeowners who might be open to a cash offer based on publicly available information.
          We are not a spam operation and we don&rsquo;t purchase lists of people who have asked to not
          be contacted.
        </p>
        <p className="text-gray-500 leading-relaxed">
          If we reached out to you and you&rsquo;re not interested, just tell us and we&rsquo;ll stop.
          No pushback, no follow-up.
        </p>
      </section>

      {/* ── Contact ── */}
      <section className="rounded-2xl bg-emerald-50 border border-emerald-100 px-6 py-8 space-y-3">
        <p className="font-semibold text-gray-800 text-lg">Questions? Just call.</p>
        <p className="text-gray-500 text-sm leading-relaxed">
          We answer calls during business hours. If we miss you, we call back.
          You&rsquo;re talking to the actual team — not a call center.
        </p>
        <a
          href="tel:+15098001234"
          className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          (509) 800-1234
        </a>
        <div className="pt-2">
          <a href="/sell" className="text-sm text-emerald-700 hover:underline">
            See how the process works →
          </a>
        </div>
      </section>

    </div>
  );
}
