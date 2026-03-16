/**
 * Public Pages Registry — Dominion Home Deals
 *
 * Bounded list of public seller-facing pages that operators can reference
 * from CRM workflows, warm-transfer cards, post-call notes, or follow-up messages.
 *
 * DESIGN RULES:
 *   - This is the single source of truth for public page URLs inside Sentinel.
 *   - Add new pages here when they exist. Never hard-code URLs in components.
 *   - Pages must exist in src/app/(public)/ before being registered here.
 *   - description is what the operator sees (not the page meta description).
 *   - sendContext defines when to suggest this page to Logan.
 *
 * BOUNDARY:
 *   - Zero imports. Pure TypeScript.
 *   - Client and server safe.
 *   - Used by: warm-transfer-card, post-call-panel, CRM note helpers.
 */

// ── Page keys ─────────────────────────────────────────────────────────────────

export type SellerPageKey =
  | "how_it_works"    // /sell — process explanation, PPC landing
  | "inherited"       // /sell/inherited — inherited/estate FAQ
  | "about_us";       // /sell/about — who we are, local proof

// ── Page shape ────────────────────────────────────────────────────────────────

export interface SellerPage {
  key:         SellerPageKey;
  /** Short operator-facing label */
  label:       string;
  /** Full public URL path (relative) */
  path:        string;
  /** Full URL — for sharing in messages / follow-up texts */
  url:         string;
  /** What this page is for — shown in operator surfaces */
  description: string;
  /**
   * When to suggest sending this page to a seller.
   * "first_contact"  — useful on any first call
   * "inherited"      — specifically for inherited/estate leads
   * "wants_info"     — seller asked for something to read/review
   * "skeptical"      — seller expressed doubt about who we are
   * "always"         — always relevant
   */
  sendContext: SellerPageSendContext[];
}

export type SellerPageSendContext =
  | "first_contact"
  | "inherited"
  | "wants_info"
  | "skeptical"
  | "always";

// ── Registry ──────────────────────────────────────────────────────────────────

const BASE_URL = "https://dominionhomedeals.com";

export const SELLER_PAGES: Record<SellerPageKey, SellerPage> = {

  how_it_works: {
    key:         "how_it_works",
    label:       "How it works",
    path:        "/sell",
    url:         `${BASE_URL}/sell`,
    description: "Process explanation: steps, what's different, FAQ. Good for PPC traffic and sellers who want to read before calling back.",
    sendContext: ["first_contact", "wants_info", "always"],
  },

  inherited: {
    key:         "inherited",
    label:       "Inherited property FAQ",
    path:        "/sell/inherited",
    url:         `${BASE_URL}/sell/inherited`,
    description: "Specific to inherited/estate situations: probate, family decisions, condition, timeline. Send when a seller mentions inheritance.",
    sendContext: ["inherited", "wants_info"],
  },

  about_us: {
    key:         "about_us",
    label:       "Who we are",
    path:        "/sell/about",
    url:         `${BASE_URL}/sell/about`,
    description: "Local proof and trust: who Dominion is, where we buy, how we find sellers. Good for skeptical callers or attribution searches.",
    sendContext: ["skeptical", "wants_info", "always"],
  },

};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns all seller pages as an array */
export function getAllSellerPages(): SellerPage[] {
  return Object.values(SELLER_PAGES);
}

/** Returns a single page by key */
export function getSellerPage(key: SellerPageKey): SellerPage {
  return SELLER_PAGES[key];
}

/** Returns pages relevant for a given send context */
export function getPagesForContext(context: SellerPageSendContext): SellerPage[] {
  return getAllSellerPages().filter(p => p.sendContext.includes(context));
}

/**
 * Builds a short message-ready link for a page.
 * e.g. "How it works: https://dominionhomedeals.com/sell"
 */
export function buildPageLink(key: SellerPageKey): string {
  const page = SELLER_PAGES[key];
  return `${page.label}: ${page.url}`;
}

/**
 * Infers the most relevant page to send based on lead context signals.
 * Used by warm-transfer card and post-call panel.
 *
 * Heuristics (in priority order):
 *   1. If tags include 'inherited' or 'probate' → inherited page
 *   2. If totalCalls === 0 → how_it_works (first contact)
 *   3. Default → how_it_works
 */
export function inferRelevantPage(context: {
  tags?:        string[];
  totalCalls?:  number;
  disposition?: string | null;
}): SellerPageKey {
  const tags = context.tags ?? [];
  if (tags.some(t => ["inherited", "probate", "estate", "absentee_landlord"].includes(t.toLowerCase()))) {
    return "inherited";
  }
  if ((context.totalCalls ?? 1) === 0) return "how_it_works";
  return "how_it_works";
}
