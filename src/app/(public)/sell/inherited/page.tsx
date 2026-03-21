import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Selling an Inherited or Estate Property in Spokane",
  description:
    "We work with inherited and estate properties regularly in Spokane and Kootenai County. We understand the process takes time. No pressure, no hurry.",
};

/**
 * /sell/inherited — Inherited / estate property FAQ
 *
 * Targeted at sellers dealing with inherited properties, estate situations,
 * or probate. Also useful for distress / family complexity callers.
 *
 * Tone: patient, respectful, no assumptions about family dynamics.
 * Answer-engine optimized: direct answers to common search questions.
 *
 * BOUNDARY: No internal imports, no auth, no CRM logic.
 */

function Faq({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-5">
      <p className="font-medium text-foreground">{q}</p>
      <div className="text-foreground text-sm mt-1.5 leading-relaxed space-y-2">{a}</div>
    </div>
  );
}

export default function InheritedPropertyPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-14 space-y-14">

      {/* ── Hero ── */}
      <section className="space-y-4">
        <p className="text-sm font-medium text-foreground tracking-wide uppercase">Inherited &amp; Estate Properties</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
          Selling an inherited property?<br className="hidden sm:block" />
          We understand the process takes time.
        </h1>
        <p className="text-lg text-foreground leading-relaxed max-w-xl">
          We work with inherited and estate properties regularly in Spokane and Kootenai County.
          Whether you&rsquo;re still working through paperwork, sorting things out with family,
          or just starting to figure out your options — we can meet you where you are.
          No pressure, no rush.
        </p>
        <a
          href="tel:+15098001234"
          className="inline-flex items-center gap-2 bg-muted hover:bg-muted text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          Call us: (509) 800-1234
        </a>
      </section>

      {/* ── What makes inherited situations different ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">What makes inherited situations different</h2>
        <div className="space-y-3">
          <p className="text-foreground leading-relaxed">
            When a property passes to a family member, there&rsquo;s often more going on than just selling a house.
            There may be estate paperwork, probate timelines, decisions that involve other family members,
            or simply the emotional weight of dealing with someone&rsquo;s home.
          </p>
          <p className="text-foreground leading-relaxed">
            We don&rsquo;t rush this process. If you&rsquo;re just starting to explore your options,
            that&rsquo;s a perfectly fine place to start a conversation. We can explain what a
            cash sale looks like and let you decide if it makes sense — on your timeline.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="space-y-5">
        <h2 className="text-xl font-semibold text-foreground">Common questions</h2>
        <div className="space-y-5">

          <Faq
            q="Can you buy a house that's still in probate?"
            a={
              <p>
                It depends on where you are in the probate process. In many cases, yes — we can work with
                the estate executor or administrator and coordinate around the probate timeline.
                The best way to find out is to call us and walk through the situation.
                We&rsquo;ve worked through a range of estate scenarios and won&rsquo;t give you a canned answer.
              </p>
            }
          />

          <Faq
            q="What if multiple family members inherited the property?"
            a={
              <p>
                This is common. In general, all owners who are on title need to agree to a sale.
                We don&rsquo;t step into family disagreements — but we can clearly explain the offer
                and the process so everyone has the same information to work with.
              </p>
            }
          />

          <Faq
            q="The house needs a lot of work. Does that matter?"
            a={
              <p>
                We buy as-is. You don&rsquo;t need to fix anything, clean it out, or do repairs before
                we close. We factor the condition into our offer. It may affect what we can pay,
                but it doesn&rsquo;t stop us from being able to buy.
              </p>
            }
          />

          <Faq
            q="We haven't decided yet. Can we just ask questions without committing?"
            a={
              <p>
                Yes — that&rsquo;s actually the most common first call we get. Call us, tell us what you&rsquo;re
                dealing with, and we&rsquo;ll answer honestly. There&rsquo;s no obligation, no pitch, no timeline
                we&rsquo;re trying to push you into.
              </p>
            }
          />

          <Faq
            q="What about personal belongings left in the house?"
            a={
              <p>
                You take whatever you want. Anything left behind we handle — you don&rsquo;t need to empty
                the house before closing if that&rsquo;s not practical.
              </p>
            }
          />

          <Faq
            q="Do you work with estate attorneys or real estate agents?"
            a={
              <p>
                We&rsquo;re a direct buyer, so we don&rsquo;t work through agents on our side. But if you have
                an attorney managing the estate, we can coordinate with them directly.
                We&rsquo;re used to working within estate processes.
              </p>
            }
          />

          <Faq
            q="How long does a cash sale take with an inherited property?"
            a={
              <p>
                It varies depending on where you are in probate and how quickly decisions can be made.
                When everything is clear and ready, we can close in a few weeks.
                If there are delays on your side, we can wait — we won&rsquo;t push you toward a closing
                date that doesn&rsquo;t work.
              </p>
            }
          />
        </div>
      </section>

      {/* ── What we need to know ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">What we&rsquo;ll ask on the first call</h2>
        <p className="text-foreground leading-relaxed">
          We keep the first conversation short. We&rsquo;ll typically ask:
        </p>
        <ul className="list-disc list-inside space-y-1 text-foreground text-sm pl-1">
          <li>What&rsquo;s the address of the property?</li>
          <li>Is it currently occupied?</li>
          <li>Where are things in the estate or probate process?</li>
          <li>What are you hoping to accomplish and on what kind of timeline?</li>
        </ul>
        <p className="text-foreground leading-relaxed text-sm">
          That&rsquo;s it to start. We&rsquo;ll take it from there and let you know if it&rsquo;s something we can work with.
        </p>
      </section>

      {/* ── Where we buy ── */}
      <section className="rounded-xl bg-muted border border-border px-5 py-5 space-y-2">
        <p className="font-medium text-foreground text-sm">Where we buy</p>
        <p className="text-foreground text-sm leading-relaxed">
          Spokane County, WA and Kootenai County, ID — including Spokane, Spokane Valley,
          Coeur d&rsquo;Alene, Post Falls, and surrounding areas. We&rsquo;re local.
        </p>
      </section>

      {/* ── CTA ── */}
      <section className="rounded-2xl bg-muted border border-border px-6 py-8 space-y-3">
        <p className="font-semibold text-foreground text-lg">Ready to talk through your situation?</p>
        <p className="text-foreground text-sm leading-relaxed">
          Call us. We&rsquo;ll listen, answer your questions honestly, and tell you what we can offer.
          There&rsquo;s no pressure and no rush.
        </p>
        <a
          href="tel:+15098001234"
          className="inline-flex items-center gap-2 bg-muted hover:bg-muted text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          (509) 800-1234
        </a>
      </section>

    </div>
  );
}
