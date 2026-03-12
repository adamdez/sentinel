/**
 * Communication Truth Helpers
 *
 * Shared definitions for contact status, staleness, and call disposition
 * classification. Used by analytics routes, UI components, and tests to
 * ensure a single consistent definition of "contacted", "stale", etc.
 *
 * These are DISPLAY / CLASSIFICATION helpers — they never mutate data.
 *
 * Design notes:
 * - `isContacted()` replaces 3 inline definitions across kpi-summary,
 *   source-performance, and analytics.ts
 * - `contactClassification()` transparently labels whether contact truth
 *   is backed by real call data or proxy fields (for KPI trust labeling)
 * - Staleness and disposition helpers consolidate hardcoded thresholds
 */

// ── Contact Status ─────────────────────────────────────────────────

export interface ContactFields {
  last_contact_at?: string | null;
  total_calls?: number | null;
}

/**
 * Determine whether a lead has been contacted.
 *
 * A lead is considered "contacted" if:
 *   - last_contact_at is non-null and non-empty, OR
 *   - total_calls is > 0
 *
 * This matches the existing production behavior across all three consumers.
 * It is intentionally permissive — it counts ANY recorded outreach attempt,
 * not just successful live connections.
 */
export function isContacted(lead: ContactFields): boolean {
  return (
    (lead.last_contact_at != null && lead.last_contact_at !== "") ||
    (lead.total_calls != null && lead.total_calls > 0)
  );
}

/**
 * Classify the quality of contact evidence for a lead.
 *
 * - "confirmed": lead has total_calls > 0, meaning the dialer actually
 *   logged at least one call attempt through the system
 * - "estimated": lead has last_contact_at set but total_calls is 0 or null,
 *   meaning contact was recorded outside the dialer (import, manual, legacy)
 * - "none": no contact evidence exists
 *
 * Use this to label KPIs honestly: "confirmed" data is trustworthy,
 * "estimated" data is proxy-based and should be labeled accordingly.
 */
export function contactClassification(
  lead: ContactFields,
): "confirmed" | "estimated" | "none" {
  if (lead.total_calls != null && lead.total_calls > 0) return "confirmed";
  if (lead.last_contact_at != null && lead.last_contact_at !== "") return "estimated";
  return "none";
}

/**
 * Compute contact rate for a set of leads.
 * Returns percentage (0–100) rounded to 1 decimal, or null if no leads.
 */
export function contactRate(leads: ContactFields[]): number | null {
  if (leads.length === 0) return null;
  const contacted = leads.filter(isContacted).length;
  return Math.round((contacted / leads.length) * 1000) / 10;
}

/**
 * Break down contact rate into confirmed vs estimated.
 * Useful for trust labeling in analytics.
 */
export function contactRateBreakdown(leads: ContactFields[]): {
  rate: number | null;
  confirmedCount: number;
  estimatedCount: number;
  noneCount: number;
  total: number;
} {
  const total = leads.length;
  if (total === 0) return { rate: null, confirmedCount: 0, estimatedCount: 0, noneCount: 0, total: 0 };

  let confirmedCount = 0;
  let estimatedCount = 0;
  let noneCount = 0;

  for (const lead of leads) {
    const cls = contactClassification(lead);
    if (cls === "confirmed") confirmedCount++;
    else if (cls === "estimated") estimatedCount++;
    else noneCount++;
  }

  const contactedCount = confirmedCount + estimatedCount;
  const rate = Math.round((contactedCount / total) * 1000) / 10;

  return { rate, confirmedCount, estimatedCount, noneCount, total };
}

// ── Staleness ──────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Check if a last-contact timestamp is "stale" relative to now.
 *
 * @param lastContactAt  ISO timestamp of last contact (null = never contacted = stale)
 * @param thresholdDays  Number of days before a lead is considered stale (default: 7)
 * @param now            Reference time (default: Date.now(), injectable for tests)
 */
export function isStale(
  lastContactAt: string | null | undefined,
  thresholdDays = 7,
  now = Date.now(),
): boolean {
  if (!lastContactAt) return true;
  const contactMs = new Date(lastContactAt).getTime();
  if (Number.isNaN(contactMs)) return true;
  return now - contactMs > thresholdDays * MS_PER_DAY;
}

/**
 * Compute days since last contact. Returns null if never contacted.
 */
export function daysSinceContact(
  lastContactAt: string | null | undefined,
  now = Date.now(),
): number | null {
  if (!lastContactAt) return null;
  const contactMs = new Date(lastContactAt).getTime();
  if (Number.isNaN(contactMs)) return null;
  const diff = now - contactMs;
  if (diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

// ── Call Disposition Classification ────────────────────────────────

/**
 * Map raw call dispositions to semantic categories.
 *
 * Categories:
 *   - "live": operator spoke with a person (connected, interested, appointment_set, callback, contract)
 *   - "voicemail": left a voicemail
 *   - "no_answer": phone rang but no answer / busy
 *   - "dead": wrong number, disconnected, do_not_call
 *   - "other": unknown or unrecognized dispositions
 */
export function dispositionCategory(
  disposition: string | null | undefined,
): "live" | "voicemail" | "no_answer" | "dead" | "other" {
  if (!disposition) return "other";
  const d = disposition.toLowerCase().trim();

  // Live contact
  if (
    d === "connected" ||
    d === "interested" ||
    d === "appointment_set" ||
    d === "appointment" ||
    d === "callback" ||
    d === "contract"
  ) {
    return "live";
  }

  // Voicemail
  if (d === "voicemail" || d === "left_voicemail" || d === "vm") {
    return "voicemail";
  }

  // No answer
  if (d === "no_answer" || d === "busy" || d === "no_pickup") {
    return "no_answer";
  }

  // Dead / compliance
  if (
    d === "wrong_number" ||
    d === "disconnected" ||
    d === "do_not_call" ||
    d === "dnc" ||
    d === "dead"
  ) {
    return "dead";
  }

  return "other";
}

/**
 * Determine if a disposition represents a live (successful) contact.
 * This is the authoritative definition of "successful contact" for KPI purposes.
 */
export function isLiveContact(disposition: string | null | undefined): boolean {
  return dispositionCategory(disposition) === "live";
}
