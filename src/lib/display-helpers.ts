/**
 * Shared display formatting helpers for operator-facing surfaces.
 *
 * These are DISPLAY-ONLY helpers — they never mutate source data.
 * Used across dispo board, buyer modal, and anywhere seller/price
 * data needs to be rendered in a readable, compact format.
 */

// ── Seller Name Formatting ──────────────────────────────────────────

/**
 * Convert a raw string to title case (capitalize first letter of each word).
 */
export function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a seller name for operator readability.
 *
 * County-record names are often ALL CAPS in "LAST, FIRST [MAILING ADDRESS]"
 * format. This function:
 *   1. Detects ALL CAPS strings
 *   2. Parses "LAST, FIRST" → "First Last"
 *   3. Strips trailing mailing address digits
 *   4. Returns the original string if it's already mixed-case
 *
 * Always display-only — never write the transformed value back to the DB.
 */
export function formatSellerName(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;

  // Only transform if ALL letters are uppercase (county record format)
  const letters = raw.replace(/[^a-zA-Z]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return raw;

  // Handle "LAST, FIRST [MAILING ADDRESS]" format from county records
  const commaIdx = raw.indexOf(",");
  if (commaIdx > 0) {
    const last = raw.slice(0, commaIdx).trim();
    let rest = raw.slice(commaIdx + 1).trim();

    // Strip mailing address: county records often append "123 STREET..." after the name
    const digitMatch = rest.search(/\d/);
    if (digitMatch > 0) {
      rest = rest.slice(0, digitMatch).trim();
    }

    if (!rest) return toTitleCase(last);
    return `${toTitleCase(rest)} ${toTitleCase(last)}`;
  }

  return toTitleCase(raw);
}

// ── Price Formatting ────────────────────────────────────────────────

/**
 * Format a price in compact $Xk notation for tight UI spaces.
 *
 * Examples:
 *   150000 → "$150k"
 *   null   → "—"
 *   0      → "$0k"
 *   -5000  → "-$5k"
 */
export function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  const absK = Math.abs(v) / 1000;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${absK.toFixed(0)}k`;
}

/**
 * Determine text color class for a spread value.
 * Positive = green, negative = red, zero = muted.
 */
export function spreadColor(spread: number): string {
  if (spread > 0) return "text-foreground";
  if (spread < 0) return "text-foreground";
  return "text-muted-foreground";
}
