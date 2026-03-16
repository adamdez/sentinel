import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to Sell Your House Fast for Cash in Spokane",
  description:
    "Dominion Home Deals buys houses as-is for cash in Spokane and Kootenai County. No repairs, no commissions, no waiting. Here's exactly how it works.",
};

/**
 * /sell — How it works / process page
 *
 * Primary PPC landing page. Clean answer to: "How do I sell my house fast
 * for cash in Spokane?" No testimonials, no inflated claims, no urgency tricks.
 *
 * BOUNDARY: No internal imports, no auth, no CRM logic.
 * All copy sourced from approved trust-language pack.
 */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-semibold text-gray-800 mb-3">{children}</h2>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-sm font-semibold text-emerald-700">
        {number}
      </div>
      <div className="pt-0.5">
        <p className="font-medium text-gray-800">{title}</p>
        <p className="text-gray-500 text-sm mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-14 space-y-14">

      {/* ── Hero ── */}
      <section className="space-y-4">
        <p className="text-sm font-medium text-emerald-700 tracking-wide uppercase">Spokane County &amp; Kootenai County</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
          Sell your house for cash.<br className="hidden sm:block" /> Simple, fast, no surprises.
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed max-w-xl">
          We&rsquo;re Dominion Home Deals — a local buyer based here in Spokane.
          We buy houses directly with cash, no agents, no commissions, no repairs needed.
          You decide if it works for you. No pressure.
        </p>
        <a
          href="tel:+15098001234"
          className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          Call us: (509) 800-1234
        </a>
      </section>

      {/* ── How it works ── */}
      <section className="space-y-5">
        <SectionHeading>How it works</SectionHeading>
        <div className="space-y-5">
          <Step
            number={1}
            title="You call or we reach out"
            description="Either you contact us, or we reach out because we came across your property through public records like assessor data and tax rolls. If you're not interested, just say the word and we stop — no pressure."
          />
          <Step
            number={2}
            title="We ask about the property"
            description="We'll ask a few questions on the phone — where the property is located, whether it's occupied, and what's prompting you to think about selling. This usually takes 10–15 minutes."
          />
          <Step
            number={3}
            title="We run the numbers and make an offer"
            description="We look at the property details and make a fair cash offer — usually within a day or two. You're under no obligation to accept."
          />
          <Step
            number={4}
            title="You decide"
            description="If the offer works for you, we move forward. If it doesn't, no problem. We're not going to pressure you into a number that doesn't make sense for your situation."
          />
          <Step
            number={5}
            title="We close on your timeline"
            description="Cash means no bank approval, no financing contingencies. We can close in as little as two to three weeks, or take more time if you need it. You pick what you take, leave the rest."
          />
        </div>
      </section>

      {/* ── What's different ── */}
      <section className="space-y-4">
        <SectionHeading>What&rsquo;s different about a cash sale</SectionHeading>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: "No repairs", detail: "Sell the property exactly as it is. You don't need to fix anything before closing." },
            { label: "No agent fees", detail: "We buy directly. No listing, no commissions, no agent on either side." },
            { label: "No waiting on financing", detail: "Cash means no loan approval delays. No deal falling through at the last minute." },
            { label: "Flexible closing", detail: "We close when it works for you — fast if needed, slower if you're still sorting things out." },
          ].map(({ label, detail }) => (
            <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="font-medium text-gray-800 text-sm">{label}</p>
              <p className="text-gray-500 text-sm mt-1 leading-relaxed">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Where we buy ── */}
      <section className="space-y-3">
        <SectionHeading>Where we buy</SectionHeading>
        <p className="text-gray-500 leading-relaxed">
          We buy primarily in <strong className="text-gray-700">Spokane County, WA</strong> and{" "}
          <strong className="text-gray-700">Kootenai County, ID</strong> — including Spokane, Spokane Valley,
          Coeur d&rsquo;Alene, Post Falls, and surrounding areas. We know the neighborhoods and we know the market.
          We&rsquo;re not an out-of-state fund — we&rsquo;re local.
        </p>
      </section>

      {/* ── Common questions ── */}
      <section className="space-y-4">
        <SectionHeading>Common questions</SectionHeading>
        <div className="space-y-4">
          {[
            {
              q: "How did you get my information?",
              a: "We find properties through public records — assessor data, tax rolls, and similar sources. We reach out to homeowners who might be open to a cash offer. If you're not interested, we stop.",
            },
            {
              q: "Is there any obligation if I talk to you?",
              a: "None. Getting a number from us doesn't commit you to anything. You can hear the offer, think it over, talk to your family, and say no.",
            },
            {
              q: "Do I need to clean or fix anything?",
              a: "No. We buy properties as-is. Whatever condition the house is in, we work with that.",
            },
            {
              q: "How long does the process take?",
              a: "We can move as fast as a few weeks if needed. We can also slow down if you need time to sort things out. We work around your schedule.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="border-b border-gray-100 pb-4">
              <p className="font-medium text-gray-800">{q}</p>
              <p className="text-gray-500 text-sm mt-1 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-400">
          Have a different situation?{" "}
          <a href="/sell/inherited" className="text-emerald-700 hover:underline">
            See our inherited property page →
          </a>
        </p>
      </section>

      {/* ── CTA ── */}
      <section className="rounded-2xl bg-emerald-50 border border-emerald-100 px-6 py-8 space-y-3">
        <p className="font-semibold text-gray-800 text-lg">Ready to talk?</p>
        <p className="text-gray-500 text-sm leading-relaxed">
          Call us directly — we&rsquo;ll ask a few questions about the property and give you a straight answer.
          No obligation, no sales pitch.
        </p>
        <a
          href="tel:+15098001234"
          className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          (509) 800-1234
        </a>
      </section>

    </div>
  );
}
