/**
 * Sentinel Dedup Utility
 *
 * Single source of truth for all (apn, county) dedup patterns.
 * Every insert path in the system must use these functions to guarantee
 * zero duplicates across the golden identity.
 *
 * Charter invariant: (apn, county) = immutable property identity.
 * All writes use ON CONFLICT (apn,county) DO UPDATE.
 */

import { createHash } from "crypto";
import type { DistressType } from "./types";

/**
 * Normalize a county name to title-case, stripping trailing "County".
 * "spokane county" → "Spokane", "KOOTENAI" → "Kootenai"
 */
export function normalizeCounty(raw: string, fallback = "Unknown"): string {
  if (!raw) return fallback;
  return raw
    .replace(/\s+county$/i, "")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Generate a deterministic SHA-256 fingerprint for a distress event.
 * Format: `{apn}:{county}:{eventType}:{source}`
 *
 * IMPORTANT: Always include county to avoid cross-county collisions.
 */
export function distressFingerprint(
  apn: string,
  county: string,
  eventType: DistressType | string,
  source: string,
): string {
  return createHash("sha256")
    .update(`${apn}:${county}:${eventType}:${source}`)
    .digest("hex");
}

/**
 * Check if a Supabase error is a unique constraint violation (duplicate).
 * PostgreSQL error code 23505 = unique_violation.
 */
export function isDuplicateError(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/**
 * Boolean coercion for PropertyRadar's inconsistent truthy values.
 */
export function isTruthy(val: unknown): boolean {
  return val === true || val === 1 || val === "1" || val === "Yes" || val === "True" || val === "true";
}

/**
 * Safe numeric coercion — strips $, %, commas.
 */
export function toNumber(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(/[$,%]/g, ""));
  return isNaN(n) ? undefined : n;
}

/**
 * Safe integer coercion.
 */
export function toInt(val: unknown): number | undefined {
  const n = toNumber(val);
  return n != null ? Math.round(n) : undefined;
}

/**
 * Days between a date string and now. Defaults to fallback on parse failure.
 */
export function daysSince(dateStr: string, fallback = 90): number {
  try {
    const d = new Date(dateStr).getTime();
    if (isNaN(d)) return fallback;
    return Math.max(Math.round((Date.now() - d) / 86400000), 1);
  } catch {
    return fallback;
  }
}
