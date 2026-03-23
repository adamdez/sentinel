/**
 * Format owner name for display — ensures "Last, First" pattern.
 *
 * Input patterns handled:
 *   "Vick Eric"              → "Vick, Eric"
 *   "Miller Bret Keith"      → "Miller, Bret Keith"
 *   "Vick, Eric"             → "Vick, Eric" (already has comma)
 *   "Burning Bush Llc"       → "Burning Bush Llc" (entity, no comma)
 *   "Silva Kavci R & Randall J" → "Silva, Kavci R & Randall J"
 *   ""                       → ""
 *   null                     → ""
 *
 * Heuristic: if the name has no comma and is not an entity (LLC, Trust, Inc, etc.),
 * insert a comma after the first word (assumed last name).
 */

const ENTITY_PATTERNS = /\b(llc|inc|corp|trust|estate|company|co|ltd|lp|llp|association|foundation|church|ministry|bank)\b/i;

export function formatOwnerName(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";

  // Already has a comma — leave it alone
  if (trimmed.includes(",")) return trimmed;

  // Entity names (LLC, Trust, Inc, etc.) — don't add comma
  if (ENTITY_PATTERNS.test(trimmed)) return trimmed;

  // Single word — no comma needed
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return trimmed;

  // "Last First" or "Last First Middle" → "Last, First Middle"
  return trimmed.slice(0, spaceIdx) + ", " + trimmed.slice(spaceIdx + 1);
}
