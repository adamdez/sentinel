/**
 * Trust Language Asset Pack — Dominion Home Deals
 *
 * Bounded registry of approved seller-facing copy snippets.
 * Used by: inbound assistant, warm-transfer card, seller memory panel,
 *          dossier call strategy, and review surfaces.
 *
 * DESIGN RULES:
 *   - Content is operator-spoken, not auto-generated.
 *   - Each snippet has a key, a short label, full copy, usage context,
 *     and tone notes.
 *   - Version is a single constant — bump it when any snippet changes.
 *   - This is NOT a CMS. Changes are code deploys (auditable).
 *   - If runtime editability is needed later, extend with a trust_snippets
 *     DB table that overrides these static defaults (same pattern as voice_registry).
 *
 * TONE RULES (from CLAUDE.md):
 *   Local. Respectful. Direct. Calm. Trustworthy. Practical.
 *   No investor-bro language. No fake urgency. No generic guru advice.
 *
 * BOUNDARY:
 *   - Zero imports. Pure TypeScript.
 *   - Client and server safe.
 *   - Never auto-writes to leads or calls_log.
 */

// ── Version ───────────────────────────────────────────────────────────────────

/** Bump this string when any snippet copy changes. Thread into events if needed. */
export const TRUST_LANGUAGE_VERSION = "1.0.0";

// ── Snippet keys ──────────────────────────────────────────────────────────────

/**
 * Bounded vocabulary of snippet identifiers.
 * Add new keys here when new contexts emerge from operator review.
 * Never rename an existing key — deprecate it and add a new one.
 */
export type TrustSnippetKey =
  | "how_got_info"           // "How did you get my number?"
  | "who_we_are"             // Who Dominion Home Deals is
  | "what_happens_next"      // After a seller calls — what to expect
  | "inherited_property"     // How to talk about inherited / estate properties
  | "cash_offer_process"     // How the cash offer process works
  | "no_obligation"          // We don't pressure — it's their choice
  | "local_market"           // Spokane / Kootenai market context
  | "timeline_flexibility";  // We work on their timeline, not ours

// ── Snippet shape ─────────────────────────────────────────────────────────────

export interface TrustSnippet {
  /** Unique identifier */
  key: TrustSnippetKey;
  /** Short display label (used in chips, dropdowns) */
  label: string;
  /**
   * Full approved copy — what Logan says out loud.
   * Plain text. No HTML. Keep concise (1–4 sentences max).
   */
  copy: string;
  /**
   * One-line summary shown in collapsed state.
   * Should be the most useful single sentence of the full copy.
   */
  summary: string;
  /**
   * When to surface this snippet.
   * "inbound_first_contact" — show when totalCalls === 0 or caller is unknown.
   * "warm_transfer"         — show in warm transfer card.
   * "objection_response"    — show when relevant objection tag is open.
   * "call_strategy"         — show in dossier call strategy block.
   * "always_available"      — Logan can pull it up any time.
   */
  contexts: TrustSnippetContext[];
  /** Tone notes for Logan — how to deliver this, not just what to say */
  toneNote: string;
  /** True if this snippet is commonly needed early in a first call */
  firstCallPriority: boolean;
}

export type TrustSnippetContext =
  | "inbound_first_contact"
  | "warm_transfer"
  | "objection_response"
  | "call_strategy"
  | "always_available";

// ── Snippet registry ──────────────────────────────────────────────────────────

export const TRUST_SNIPPETS: Record<TrustSnippetKey, TrustSnippet> = {

  how_got_info: {
    key:     "how_got_info",
    label:   "How did you get my info?",
    summary: "We came across your property through public records and reached out to see if selling is something you'd consider.",
    copy:    "We came across your property through public records — things like assessor data and tax rolls — and we reach out to homeowners who might be open to a cash offer. We're not a telemarketer and we're not a realtor. We're a local buyer. If selling isn't something you're interested in, just say the word and we'll stop.",
    contexts: ["inbound_first_contact", "always_available"],
    toneNote: "Calm, not defensive. Be honest about the source. Don't oversell the relationship. Let them decide.",
    firstCallPriority: true,
  },

  who_we_are: {
    key:     "who_we_are",
    label:   "Who we are",
    summary: "We're Dominion Home Deals — a local cash buyer based in Spokane. We buy houses directly, no agents, no fees.",
    copy:    "We're Dominion Home Deals — a local buyer based here in Spokane. We buy houses directly with cash, no agents, no commissions, no repairs needed. We're a small team — it's really just us. We work with sellers who want a simple, fast process without the hassle of listing on the market.",
    contexts: ["inbound_first_contact", "warm_transfer", "always_available"],
    toneNote: "Keep it short. Local buyer, small team, simple process. Don't use 'investor' language.",
    firstCallPriority: true,
  },

  what_happens_next: {
    key:     "what_happens_next",
    label:   "What happens after you call",
    summary: "We'll take a quick look at the property, get you a fair cash offer in a day or two, and you decide — no pressure.",
    copy:    "Here's how it works: we'll get a little information about the property on this call, then take a quick look at the numbers on our end. If it makes sense, we'll get you a fair cash offer — usually within a day or two. You review it, and if it works for you, we move forward. If not, no problem. There's no pressure and no obligation.",
    contexts: ["inbound_first_contact", "call_strategy", "always_available"],
    toneNote: "Slow down on 'you decide.' Sellers need to hear that they're in control. Don't rush past this.",
    firstCallPriority: true,
  },

  inherited_property: {
    key:     "inherited_property",
    label:   "Inherited / estate property",
    summary: "We work with inherited properties often — we understand the process takes time and we're not in a hurry.",
    copy:    "We work with inherited properties pretty regularly. We understand that there's usually a process involved — estate paperwork, decisions with family, sometimes probate. We're not in a hurry, and we won't pressure you on timeline. If you're just starting to figure things out, that's completely fine — we can talk through where things stand and go from there.",
    contexts: ["call_strategy", "objection_response", "always_available"],
    toneNote: "Slow, patient tone. Acknowledge the complexity without making assumptions about their family situation.",
    firstCallPriority: false,
  },

  cash_offer_process: {
    key:     "cash_offer_process",
    label:   "How cash offers work",
    summary: "Cash offer means no financing, no inspection contingencies, and we can close in as little as 2–3 weeks if needed.",
    copy:    "A cash offer means we're not going through a bank. We have the funds ready, so there's no loan approval to wait on and no financing falling through at the last minute. We can usually close in as little as two to three weeks — or we can slow it down if you need more time. No repairs, no cleaning, no open houses. You pick what you take with you and leave the rest.",
    contexts: ["call_strategy", "objection_response", "always_available"],
    toneNote: "Sellers often don't know what 'cash offer' means. Explain it plainly. The speed and simplicity are the real value.",
    firstCallPriority: false,
  },

  no_obligation: {
    key:     "no_obligation",
    label:   "No pressure, no obligation",
    summary: "Getting a number from us doesn't commit you to anything. You can say no.",
    copy:    "I want to be clear — getting a number from us doesn't obligate you to anything. You can hear what we'd offer, think it over, talk to your family, and say no if it doesn't work. We're not going to push you. The only reason to go forward is if it actually makes sense for your situation.",
    contexts: ["objection_response", "always_available"],
    toneNote: "This is often what sellers are waiting to hear. Say it directly. Don't bury it.",
    firstCallPriority: false,
  },

  local_market: {
    key:     "local_market",
    label:   "Local — Spokane / Kootenai",
    summary: "We're local — we buy in Spokane County and Kootenai County, and we know this market well.",
    copy:    "We're local — we buy primarily in Spokane County and Kootenai County. We know the neighborhoods, we know the market, and we're not some out-of-state fund trying to flip properties remotely. When we make an offer, it's based on what we actually know about the area.",
    contexts: ["inbound_first_contact", "call_strategy", "always_available"],
    toneNote: "Mention specific counties. It signals we're real. Sellers from outside Spokane may not know the area — adjust as needed.",
    firstCallPriority: false,
  },

  timeline_flexibility: {
    key:     "timeline_flexibility",
    label:   "We work on your timeline",
    summary: "We can close fast if needed, or wait — we work around your schedule, not ours.",
    copy:    "One thing that's different about working with us — we work around your timeline. If you need to close fast, we can do that. If you need a few months to sort things out, that's fine too. We're not going to push you into a closing date that doesn't work for you.",
    contexts: ["objection_response", "call_strategy", "always_available"],
    toneNote: "Sellers with inherited or distress situations often feel pressured by timelines. This re-centers control with them.",
    firstCallPriority: false,
  },

};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns all snippets as an array, sorted by firstCallPriority then key. */
export function getAllSnippets(): TrustSnippet[] {
  return Object.values(TRUST_SNIPPETS).sort((a, b) => {
    if (a.firstCallPriority !== b.firstCallPriority) return a.firstCallPriority ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
}

/** Returns a single snippet by key. Throws if the key is not found (type-safe). */
export function getTrustSnippet(key: TrustSnippetKey): TrustSnippet {
  return TRUST_SNIPPETS[key];
}

/** Returns snippets relevant for a given context, sorted by firstCallPriority. */
export function getSnippetsForContext(context: TrustSnippetContext): TrustSnippet[] {
  return getAllSnippets().filter(s => s.contexts.includes(context));
}

/** Returns the first-call-priority snippets only (for first-contact surfaces). */
export function getFirstCallSnippets(): TrustSnippet[] {
  return getAllSnippets().filter(s => s.firstCallPriority);
}

/** All snippet keys for type-safe iteration */
export const TRUST_SNIPPET_KEYS: TrustSnippetKey[] = Object.keys(TRUST_SNIPPETS) as TrustSnippetKey[];
