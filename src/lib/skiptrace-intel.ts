/**
 * Assignment-triggered skip-trace with intel-layer dedup.
 *
 * Shared helper used by:
 *   - PATCH /api/prospects (claim / assignment)
 *   - POST /api/leads/[id]/queue (dialer queue)
 *   - POST /api/properties/promote-to-lead (promotion)
 *
 * Write path: dualSkipTrace → dossier_artifact → filtered fact_assertions.
 * Fingerprints existing phones/emails from properties, lead_phones, and
 * fact_assertions before creating new facts — no duplicates.
 *
 * Debounce: skips if a successful intel skiptrace ran within DEBOUNCE_HOURS
 * for the same property (checked via owner_flags.skip_trace_intel_at).
 */

import { createServerClient } from "@/lib/supabase";
import { dualSkipTrace, type SkipTraceResult } from "@/lib/skip-trace";
import { createArtifact, createFact } from "@/lib/intelligence";

const DEBOUNCE_HOURS = 4;

// ── Shared normalizer (matches skip-trace.ts internal normalizePhone) ──

export function normalizePhoneForDedup(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

export function normalizeEmailForDedup(raw: string): string {
  return raw.toLowerCase().trim();
}

// ── Founder check ──────────────────────────────────────────────────────

let _founderIds: Set<string> | null = null;

function getFounderIds(): Set<string> {
  if (_founderIds) return _founderIds;
  const raw = process.env.FOUNDER_USER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  _founderIds = new Set(ids);
  return _founderIds;
}

/**
 * Should skip-trace fire for this assignment transition?
 *   - null → non-null (first claim)
 *   - any → founder UUID (reassignment to Logan/Adam)
 */
export function shouldTriggerSkiptrace(
  prevAssignedTo: string | null,
  nextAssignedTo: string | null,
): boolean {
  if (!nextAssignedTo) return false;
  const becameOwned = prevAssignedTo == null;
  const assignedToFounder = getFounderIds().has(nextAssignedTo);
  return becameOwned || assignedToFounder;
}

// ── Fingerprint collection ─────────────────────────────────────────────

interface ExistingFingerprints {
  phones: Set<string>;
  emails: Set<string>;
}

async function collectFingerprints(
  sb: ReturnType<typeof createServerClient>,
  leadId: string,
  propertyId: string,
): Promise<ExistingFingerprints> {
  const phones = new Set<string>();
  const emails = new Set<string>();

  // 1. Property: owner_phone, owner_email, owner_flags.all_phones / all_emails
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (sb.from("properties") as any)
    .select("owner_phone, owner_email, owner_flags")
    .eq("id", propertyId)
    .maybeSingle();

  if (prop) {
    if (typeof prop.owner_phone === "string" && prop.owner_phone.trim()) {
      phones.add(normalizePhoneForDedup(prop.owner_phone));
    }
    if (typeof prop.owner_email === "string" && prop.owner_email.trim()) {
      emails.add(normalizeEmailForDedup(prop.owner_email));
    }
    const flags = (prop.owner_flags ?? {}) as Record<string, unknown>;
    const allPhones = flags.all_phones as Array<{ number?: string }> | undefined;
    if (Array.isArray(allPhones)) {
      for (const p of allPhones) {
        if (typeof p.number === "string") phones.add(normalizePhoneForDedup(p.number));
      }
    }
    const allEmails = flags.all_emails as Array<{ email?: string }> | undefined;
    if (Array.isArray(allEmails)) {
      for (const e of allEmails) {
        if (typeof e.email === "string") emails.add(normalizeEmailForDedup(e.email));
      }
    }
  }

  // 2. lead_phones rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadPhoneRows } = await (sb.from("lead_phones") as any)
    .select("phone")
    .eq("lead_id", leadId);

  if (Array.isArray(leadPhoneRows)) {
    for (const row of leadPhoneRows) {
      if (typeof row.phone === "string") phones.add(normalizePhoneForDedup(row.phone));
    }
  }

  // 3. fact_assertions for phone/email types (pending + accepted)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: facts } = await (sb.from("fact_assertions") as any)
    .select("fact_type, fact_value")
    .eq("lead_id", leadId)
    .in("fact_type", ["primary_phone", "phone_number", "primary_email", "email"])
    .in("review_status", ["pending", "accepted"]);

  if (Array.isArray(facts)) {
    for (const f of facts) {
      const val = f.fact_value as string;
      if (f.fact_type === "primary_phone" || f.fact_type === "phone_number") {
        phones.add(normalizePhoneForDedup(val));
      } else {
        emails.add(normalizeEmailForDedup(val));
      }
    }
  }

  return { phones, emails };
}

// ── Debounce check ─────────────────────────────────────────────────────

async function isDebounced(
  sb: ReturnType<typeof createServerClient>,
  propertyId: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (sb.from("properties") as any)
    .select("owner_flags")
    .eq("id", propertyId)
    .maybeSingle();

  if (!prop) return false;
  const flags = (prop.owner_flags ?? {}) as Record<string, unknown>;
  const lastRun = flags.skip_trace_intel_at as string | undefined;
  if (!lastRun) return false;

  const elapsed = Date.now() - new Date(lastRun).getTime();
  return elapsed < DEBOUNCE_HOURS * 60 * 60 * 1000;
}

async function markDebounce(
  sb: ReturnType<typeof createServerClient>,
  propertyId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (sb.from("properties") as any)
    .select("owner_flags")
    .eq("id", propertyId)
    .maybeSingle();

  const existing = ((prop?.owner_flags as Record<string, unknown>) ?? {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("properties") as any)
    .update({ owner_flags: { ...existing, skip_trace_intel_at: new Date().toISOString() } })
    .eq("id", propertyId);
}

// ── Main entry point ───────────────────────────────────────────────────

export interface SkipTraceIntelContext {
  leadId: string;
  propertyId: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  ownerName?: string;
  reason: string; // e.g. "promotion", "claim", "queue", "reassignment"
  force?: boolean;
}

export interface SkipTraceIntelResult {
  ran: boolean;
  reason: string;
  phonesFound: number;
  emailsFound: number;
  newFactsCreated: number;
  phonesPromoted: number;
  providers: string[];
}

/**
 * Run skip-trace through the intel pipeline with dedup.
 * Fire-and-forget safe — catches internally and logs.
 */
export async function runSkipTraceIntel(
  ctx: SkipTraceIntelContext,
): Promise<SkipTraceIntelResult> {
  const sb = createServerClient();
  const tag = `[SkipTraceIntel:${ctx.reason}]`;

  if (!ctx.address) {
    console.log(`${tag} Skipped — no address for lead ${ctx.leadId}`);
    return { ran: false, reason: "no_address", phonesFound: 0, emailsFound: 0, newFactsCreated: 0, phonesPromoted: 0, providers: [] };
  }

  if (!ctx.force && await isDebounced(sb, ctx.propertyId)) {
    console.log(`${tag} Debounced — skip-trace ran within ${DEBOUNCE_HOURS}h for property ${ctx.propertyId}`);
    return { ran: false, reason: "debounced", phonesFound: 0, emailsFound: 0, newFactsCreated: 0, phonesPromoted: 0, providers: [] };
  }

  const t0 = Date.now();

  // 1. Collect existing fingerprints
  const fingerprints = await collectFingerprints(sb, ctx.leadId, ctx.propertyId);
  console.log(`${tag} Fingerprints: ${fingerprints.phones.size} phones, ${fingerprints.emails.size} emails already known`);

  // 2. Run dual skip-trace (unchanged)
  let result: SkipTraceResult;
  try {
    result = await dualSkipTrace({
      id: ctx.propertyId,
      address: ctx.address,
      city: ctx.city,
      state: ctx.state,
      zip: ctx.zip,
      owner_name: ctx.ownerName,
    });
  } catch (err) {
    console.error(`${tag} dualSkipTrace failed:`, err);
    return { ran: true, reason: "provider_error", phonesFound: 0, emailsFound: 0, newFactsCreated: 0, phonesPromoted: 0, providers: [] };
  }

  console.log(`${tag} Providers returned: ${result.totalPhoneCount} phones, ${result.totalEmailCount} emails [${result.providers.join("+")}] in ${Date.now() - t0}ms`);

  // 3. Store raw artifact (full payload, always — even if zero new facts)
  const artifactId = await createArtifact({
    leadId: ctx.leadId,
    propertyId: ctx.propertyId,
    sourceType: `skiptrace_${ctx.reason}`,
    sourceLabel: `Skip trace (${result.providers.join(", ")}) — ${ctx.reason}`,
    rawExcerpt: JSON.stringify({
      phones: result.phones,
      emails: result.emails,
      persons: result.persons,
      primaryPhone: result.primaryPhone,
      primaryEmail: result.primaryEmail,
      isLitigator: result.isLitigator,
      hasDncNumbers: result.hasDncNumbers,
    }).slice(0, 10000),
    capturedBy: `skiptrace-intel:${ctx.reason}`,
  });

  // 4. Filtered fact creation — skip numbers/emails already in client file
  let newFacts = 0;
  const providerLabel = result.providers.join("+");

  if (result.primaryPhone && !fingerprints.phones.has(normalizePhoneForDedup(result.primaryPhone))) {
    await createFact({
      artifactId,
      leadId: ctx.leadId,
      factType: "primary_phone",
      factValue: result.primaryPhone,
      confidence: "medium",
      promotedField: "phone",
      assertedBy: `skiptrace:${providerLabel}`,
    });
    fingerprints.phones.add(normalizePhoneForDedup(result.primaryPhone));
    newFacts++;
  }

  if (result.primaryEmail && !fingerprints.emails.has(normalizeEmailForDedup(result.primaryEmail))) {
    await createFact({
      artifactId,
      leadId: ctx.leadId,
      factType: "primary_email",
      factValue: result.primaryEmail,
      confidence: "medium",
      promotedField: "email",
      assertedBy: `skiptrace:${providerLabel}`,
    });
    fingerprints.emails.add(normalizeEmailForDedup(result.primaryEmail));
    newFacts++;
  }

  if (result.isLitigator) {
    await createFact({
      artifactId,
      leadId: ctx.leadId,
      factType: "litigator_flag",
      factValue: "true",
      confidence: "high",
      assertedBy: `skiptrace:${providerLabel}`,
    });
    newFacts++;
  }

  for (const phone of result.phones.slice(0, 5)) {
    const norm = normalizePhoneForDedup(phone.number);
    if (fingerprints.phones.has(norm)) continue;
    fingerprints.phones.add(norm);
    await createFact({
      artifactId,
      leadId: ctx.leadId,
      factType: "phone_number",
      factValue: phone.number,
      confidence: phone.confidence >= 80 ? "high" : phone.confidence >= 50 ? "medium" : "low",
      assertedBy: `skiptrace:${phone.source}`,
    });
    newFacts++;
  }

  for (const email of result.emails.slice(0, 4)) {
    const norm = normalizeEmailForDedup(email.email);
    if (fingerprints.emails.has(norm)) continue;
    fingerprints.emails.add(norm);
    await createFact({
      artifactId,
      leadId: ctx.leadId,
      factType: "email",
      factValue: email.email,
      confidence: email.deliverable ? "medium" : "low",
      assertedBy: `skiptrace:${email.source}`,
    });
    newFacts++;
  }

  // 5. Promote new phones into lead_phones (contact file)
  //    Uses upsert with ignoreDuplicates — UNIQUE(lead_id, phone) is the safety net.
  let phonesPromoted = 0;
  const phonesToPromote: Array<{ number: string; source: string; isPrimary: boolean }> = [];

  if (result.primaryPhone) {
    phonesToPromote.push({ number: result.primaryPhone, source: providerLabel, isPrimary: true });
  }
  for (const phone of result.phones.slice(0, 5)) {
    phonesToPromote.push({ number: phone.number, source: phone.source, isPrimary: false });
  }

  if (phonesToPromote.length > 0) {
    // Get current max position for this lead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: maxPosRow } = await (sb.from("lead_phones") as any)
      .select("position")
      .eq("lead_id", ctx.leadId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextPosition = ((maxPosRow?.position as number) ?? -1) + 1;

    for (const p of phonesToPromote) {
      const normalizedPhone = normalizePhoneForDedup(p.number);
      // Format as +1XXXXXXXXXX for consistency
      const formattedPhone = normalizedPhone.length === 10 ? `+1${normalizedPhone}` : p.number;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sb.from("lead_phones") as any)
        .insert({
          lead_id: ctx.leadId,
          property_id: ctx.propertyId,
          phone: formattedPhone,
          label: p.isPrimary ? "primary" : "mobile",
          source: `skiptrace:${p.source}`,
          status: "active",
          is_primary: p.isPrimary && nextPosition === 0,
          position: nextPosition,
        });

      if (!error) {
        phonesPromoted++;
        nextPosition++;
      } else if (error.code === "23505") {
        // UNIQUE constraint violation — phone already in contact file, skip
      } else {
        console.error(`${tag} lead_phones insert failed:`, error.message);
      }
    }

    console.log(`${tag} Promoted ${phonesPromoted} phones to lead_phones for lead ${ctx.leadId}`);
  }

  // 6. Mark debounce timestamp
  await markDebounce(sb, ctx.propertyId);

  console.log(`${tag} Complete for lead ${ctx.leadId}: ${newFacts} new facts, ${phonesPromoted} phones promoted (${result.totalPhoneCount} phones, ${result.totalEmailCount} emails total) in ${Date.now() - t0}ms`);

  return {
    ran: true,
    reason: "completed",
    phonesFound: result.totalPhoneCount,
    emailsFound: result.totalEmailCount,
    newFactsCreated: newFacts,
    phonesPromoted,
    providers: result.providers,
  };
}
