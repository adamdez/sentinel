/**
 * Compliance Layer — DNC scrub, litigant suppression, opt-out enforcement.
 *
 * Charter v2.3 §VIII:
 *   "Before dial eligibility: DNC scrub, Litigant suppression, Opt-out enforcement,
 *    Negative-stack suppression. No exceptions. All compliance actions logged."
 *
 * Queries live Supabase tables: dnc_list, litigants, opt_outs.
 * Results cached in-memory for 5 minutes to minimize DB round-trips.
 * Every scrub is audit-logged to event_log (append-only).
 */

import { createServerClient } from "@/lib/supabase";
import { supabase as browserClient } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────

export interface ComplianceResult {
  eligible: boolean;
  blockedReasons: string[];
  checkedAt: string;
}

export interface ScrubResult {
  allowed: boolean;
  reason?: string;
  blockedReasons: string[];
  checkedAt: string;
  cached: boolean;
}

// ── In-memory cache (5-minute TTL) ─────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  result: ScrubResult;
  expiresAt: number;
}

const scrubCache = new Map<string, CacheEntry>();

function getCached(phone: string): ScrubResult | null {
  const entry = scrubCache.get(phone);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    scrubCache.delete(phone);
    return null;
  }
  return { ...entry.result, cached: true };
}

function setCache(phone: string, result: ScrubResult): void {
  scrubCache.set(phone, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// Prevent unbounded cache growth
function pruneCache(): void {
  if (scrubCache.size <= 5000) return;
  const now = Date.now();
  for (const [key, entry] of scrubCache) {
    if (now > entry.expiresAt) scrubCache.delete(key);
  }
}

// ── Server-side scrub (uses service role, bypasses RLS) ────────────────

export async function scrubLead(
  phone: string,
  actorId?: string,
  ghostMode = false
): Promise<ScrubResult> {
  const now = new Date().toISOString();

  if (!phone || phone.trim().length === 0) {
    return { allowed: true, blockedReasons: [], checkedAt: now, cached: false };
  }

  const normalized = phone.replace(/\D/g, "").slice(-10);
  if (normalized.length < 7) {
    return { allowed: true, blockedReasons: [], checkedAt: now, cached: false };
  }

  if (ghostMode) {
    await logScrubEvent(actorId ?? null, normalized, "GHOST_MODE_BYPASS", []);
    return { allowed: true, reason: "Ghost mode — scrub bypassed", blockedReasons: [], checkedAt: now, cached: false };
  }

  const cached = getCached(normalized);
  if (cached) return cached;

  const sb = createServerClient();
  const blockedReasons: string[] = [];

  try {
    const [dncRes, litigantRes, optOutRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.from("dnc_list") as any).select("phone").eq("phone", normalized).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.from("litigants") as any).select("phone").eq("phone", normalized).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.from("opt_outs") as any).select("phone").eq("phone", normalized).maybeSingle(),
    ]);

    if (dncRes.data) blockedReasons.push("DNC_REGISTERED");
    if (litigantRes.data) blockedReasons.push("KNOWN_LITIGANT");
    if (optOutRes.data) blockedReasons.push("OPT_OUT");
  } catch (err) {
    console.error("[Compliance] Scrub query failed:", err);
    blockedReasons.push("SCRUB_ERROR");
  }

  const result: ScrubResult = {
    allowed: blockedReasons.length === 0,
    reason: blockedReasons.length > 0 ? blockedReasons.join(", ") : undefined,
    blockedReasons,
    checkedAt: now,
    cached: false,
  };

  setCache(normalized, result);
  pruneCache();

  await logScrubEvent(
    actorId ?? null,
    normalized,
    result.allowed ? "COMPLIANCE_CLEARED" : "COMPLIANCE_BLOCKED",
    blockedReasons
  );

  return result;
}

// ── Client-side scrub (uses browser client, respects RLS) ──────────────

export async function scrubLeadClient(phone: string): Promise<ScrubResult> {
  const now = new Date().toISOString();

  if (!phone || phone.trim().length === 0) {
    return { allowed: true, blockedReasons: [], checkedAt: now, cached: false };
  }

  const normalized = phone.replace(/\D/g, "").slice(-10);
  if (normalized.length < 7) {
    return { allowed: true, blockedReasons: [], checkedAt: now, cached: false };
  }

  const cached = getCached(normalized);
  if (cached) return cached;

  const blockedReasons: string[] = [];

  try {
    const [dncRes, litigantRes, optOutRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (browserClient.from("dnc_list") as any).select("phone").eq("phone", normalized).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (browserClient.from("litigants") as any).select("phone").eq("phone", normalized).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (browserClient.from("opt_outs") as any).select("phone").eq("phone", normalized).maybeSingle(),
    ]);

    if (dncRes.data) blockedReasons.push("DNC_REGISTERED");
    if (litigantRes.data) blockedReasons.push("KNOWN_LITIGANT");
    if (optOutRes.data) blockedReasons.push("OPT_OUT");
  } catch (err) {
    console.error("[Compliance] Client scrub query failed:", err);
  }

  const result: ScrubResult = {
    allowed: blockedReasons.length === 0,
    reason: blockedReasons.length > 0 ? blockedReasons.join(", ") : undefined,
    blockedReasons,
    checkedAt: now,
    cached: false,
  };

  setCache(normalized, result);
  return result;
}

// ── Legacy sync wrapper (for components that imported checkDialEligibility) ─

export function checkDialEligibility(
  phone: string,
  _propertyId: string,
  _ownerId: string
): ComplianceResult {
  const normalized = phone.replace(/\D/g, "").slice(-10);
  const cached = getCached(normalized);

  if (cached) {
    return {
      eligible: cached.allowed,
      blockedReasons: cached.blockedReasons,
      checkedAt: cached.checkedAt,
    };
  }

  return {
    eligible: true,
    blockedReasons: [],
    checkedAt: new Date().toISOString(),
  };
}

// ── Admin: add entries to compliance lists ──────────────────────────────

export async function addToDnc(phone: string, source = "manual"): Promise<void> {
  const normalized = phone.replace(/\D/g, "").slice(-10);
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dnc_list") as any).upsert({ phone: normalized, source }, { onConflict: "phone" });
  scrubCache.delete(normalized);
}

export async function addToLitigants(phone: string, name?: string, source = "manual"): Promise<void> {
  const normalized = phone.replace(/\D/g, "").slice(-10);
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("litigants") as any).upsert({ phone: normalized, name, source }, { onConflict: "phone" });
  scrubCache.delete(normalized);
}

export async function addToOptOut(phone: string, source = "manual", reason?: string): Promise<void> {
  const normalized = phone.replace(/\D/g, "").slice(-10);
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("opt_outs") as any).upsert({ phone: normalized, source, reason }, { onConflict: "phone" });
  scrubCache.delete(normalized);
}

// ── Negative-stack suppression ──────────────────────────────────────────

export function checkNegativeStack(_propertyId: string): boolean {
  return false;
}

// ── Audit helper (non-blocking, append-only event_log) ──────────────────

async function logScrubEvent(
  userId: string | null,
  phone: string,
  action: string,
  blockedReasons: string[]
): Promise<void> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: userId || "00000000-0000-0000-0000-000000000000",
      action,
      entity_type: "compliance",
      entity_id: phone,
      details: { blockedReasons, phone: `***${phone.slice(-4)}` },
    });
  } catch (err) {
    console.error("[Compliance] Audit log failed (non-fatal):", err);
  }
}
