import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Behind on Payments or Facing Foreclosure in Spokane?",
  description:
    "If you're behind on your mortgage or facing foreclosure in Spokane or Kootenai County, we may be able to help. A fast cash sale can stop the process before it goes further.",
};

/**
 * /sell/foreclosure — Foreclosure / behind on payments landing page
 *
 * Targeted at sellers under financial pressure — behind on mortgage,
 * received NOD, facing auction timeline. These sellers need clarity
 * and speed, not sales tactics.
 *
 * Tone: calm, direct, zero pressure, zero judgment about their
 * financial situation. Honest about what we can and can't do.
 *
 * BOUNDARY: No internal imports, no auth, no CRM logic.
 */

function Faq({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 pb-5">
      <p className="font-medium text-gray-800">{q}</p>
      <div className="text-gray-500 text-sm mt-1.5 leading-relaxed space-y-2">{a}</div>
    </div>
  );
}

export default function ForeclosurePage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-14 space-y-14">

      {/* ── Hero ── */}
      <section className="space-y-4">
        <p className="text-sm font-medium text-emerald-700 tracking-wide uppercase">Behind on Payments</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
          Facing foreclosure?<br className="hidden sm:block" />
          You may have more options than you think.
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed max-w-xl">
          If you&rsquo;re behind on your mortgage or have received a foreclosure notice,
          a fast cash sale may be able to stop the process before it goes further.
          We buy houses in Spokane and Kootenai County and can close quickly
          when timing matters.
        </p>
        <a
          href="tel:+15098001234"
          className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          Call us: (509) 800-1234
        </a>
      </section>

      {/* ── How a cash sale can help ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">How a cash sale can help</h2>
        <div className="space-y-3">
          <p className="text-gray-500 leading-relaxed">
            When you sell your house for cash before the foreclosure completes,
            the proceeds go toward paying off your mortgage. In many cases, this lets
            you walk away clean — no foreclosure on your record, no deficiency judgment,
            and whatever equity is left goes to you.
          </p>
          <p className="text-gray-500 leading-relaxed">
            The key is timing. The earlier you reach out, the more options you have.
            Even if you&rsquo;re not sure where things stand, a quick phone call can help
            you understand what&rsquo;s realistic.
          </p>
        </div>
      </section>

      {/* ── Timeline context ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-800">Where are you in the process?</h2>
        <p className="text-gray-500 leading-relaxed text-sm">
          Every situation is different, but here&rsquo;s a general sense of the timeline:
        </p>
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="font-medium text-gray-700 text-sm">Behind on payments, no notice yet</p>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              You have the most options here. This is the best time to explore a sale
              if you don&rsquo;t see a way to catch up.
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="font-medium text-gray-700 text-sm">Received a Notice of Default</p>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              The clock is running, but you typically still have time to sell.
              The sooner you act, the more flexibility you have on timing and terms.
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="font-medium text-gray-700 text-sm">Auction date is set</p>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              It may still be possible to sell before the auction, but timing is tight.
              Call us immediately so we can evaluate whether a fast close is realistic.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="space-y-5">
        <h2 className="text-xl font-semibold text-gray-800">Common questions</h2>
        <div className="space-y-5">

          <Faq
            q="Can I sell my house if I'm behind on the mortgage?"
            a={
              <p>
                Yes. As long as you still own the property, you can sell it. The mortgage
                gets paid off from the sale proceeds at closing. If there&rsquo;s equity left
                over, it goes to you.
              </p>
            }
          />

          <Faq
            q="What if I owe more than the house is worth?"
            a={
              <p>
                That&rsquo;s called being &ldquo;underwater.&rdquo; In some cases, a short sale
                may be an option — where the lender agrees to accept less than what&rsquo;s owed.
                We can help you understand if that&rsquo;s a possibility. Either way, we&rsquo;ll
                give you an honest assessment of where you stand.
              </p>
            }
          />

          <Faq
            q="Will selling stop the foreclosure?"
            a={
              <p>
                If the sale closes before the foreclosure is finalized, yes. The mortgage gets
                paid off and the foreclosure process stops. That&rsquo;s why timing matters — the
                earlier you start, the more room there is to close cleanly.
              </p>
            }
          />

          <Faq
            q="How fast can you close?"
            a={
              <p>
                When everything is clear and ready, we can close in as little as two weeks.
                If there&rsquo;s an auction deadline, we&rsquo;ll tell you honestly whether
                the timeline is realistic before we move forward.
              </p>
            }
          />

          <Faq
            q="Do I need to fix up the house before selling?"
            a={
              <p>
                No. We buy as-is. You don&rsquo;t need to make repairs, clean it out, or do
                anything to prepare the house. We handle all of that.
              </p>
            }
          />

          <Faq
            q="Will this hurt my credit?"
            a={
              <p>
                A regular sale — even a fast one — is much better for your credit than a
                completed foreclosure. If you&rsquo;re already behind on payments, your credit
                has likely been affected, but avoiding a foreclosure on your record makes
                a real difference for your financial future.
              </p>
            }
          />

          <Faq
            q="Is this a scam? How do I know I can trust you?"
            a={
              <p>
                Fair question. We&rsquo;re a local company based in Spokane. We use a standard
                title company for closing, you&rsquo;ll have full visibility into the process,
                and you can have an attorney review everything. We don&rsquo;t ask for money
                upfront — ever. If something doesn&rsquo;t feel right, don&rsquo;t do it.
                We&rsquo;d rather you feel confident than rushed.
              </p>
            }
          />
        </div>
      </section>

      {/* ── What to have ready ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-800">What to have ready when you call</h2>
        <p className="text-gray-500 leading-relaxed text-sm">
          You don&rsquo;t need everything figured out. But if you have any of this, it helps:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-500 text-sm pl-1">
          <li>Property address</li>
          <li>Rough idea of what you owe on the mortgage</li>
          <li>Any notices you&rsquo;ve received from the lender</li>
          <li>Whether the house is occupied</li>
        </ul>
        <p className="text-gray-500 leading-relaxed text-sm">
          If you don&rsquo;t have all of this, that&rsquo;s okay. We can work with what you know.
        </p>
      </section>

      {/* ── Where we buy ── */}
      <section className="rounded-xl bg-gray-50 border border-gray-100 px-5 py-5 space-y-2">
        <p className="font-medium text-gray-700 text-sm">Where we buy</p>
        <p className="text-gray-500 text-sm leading-relaxed">
          Spokane County, WA and Kootenai County, ID — including Spokane, Spokane Valley,
          Coeur d&rsquo;Alene, Post Falls, and surrounding areas. We&rsquo;re local.
        </p>
      </section>

      {/* ── CTA ── */}
      <section className="rounded-2xl bg-emerald-50 border border-emerald-100 px-6 py-8 space-y-3">
        <p className="font-semibold text-gray-800 text-lg">Not sure where you stand? Call us.</p>
        <p className="text-gray-500 text-sm leading-relaxed">
          We&rsquo;ll listen to your situation, tell you what&rsquo;s realistic, and give you
          a straight answer. No pressure, no obligation, no judgment.
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
