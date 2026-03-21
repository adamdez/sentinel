/**
 * Resolves the Sentinel market identifier from a county name.
 *
 * Markets: "spokane" (Spokane County WA), "kootenai" (Kootenai County ID).
 * Returns null for counties outside primary/secondary markets.
 */
export function resolveMarket(county: string | null | undefined): string | null {
  if (!county) return null;
  const lower = county.toLowerCase();
  if (lower.includes("spokane")) return "spokane";
  if (lower.includes("kootenai")) return "kootenai";
  return null;
}
