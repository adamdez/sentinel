/**
 * Assignment-triggered skip-trace with intel-layer dedup.
 *
 * Shared helper used by:
 *   - PATCH /api/prospects (claim / assignment)
 *   - POST /api/leads/[id]/queue (dialer queue)
 *   - POST /api/properties/promote-to-lead (promotion)
 *
 * Write path: dualSkipTrace -> dossier_artifact -> filtered fact_assertions.
 * Fingerprints existing phones/emails from properties, lead_phones, and
 * fact_assertions before creating new facts, so duplicates are not re-saved.
 *
 * Debounce: skips if a successful intel skip trace ran within DEBOUNCE_HOURS
 * for the same property (checked via owner_flags.skip_trace_intel_at).
 */

import { createServerClient } from "@/lib/supabase";
import { dualSkipTrace, type SkipTraceResult } from "@/lib/skip-trace";
import { createArtifact, createFact } from "@/lib/intelligence";

const DEBOUNCE_HOURS = 4;

export function normalizePhoneForDedup(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

export function normalizeEmailForDedup(raw: string): string {
  return raw.toLowerCase().trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "unknown_error";
}

let _founderIds: Set<string> | null = null;

function getFounderIds(): Set<string> {
  if (_founderIds) return _founderIds;
  const raw = process.env.FOUNDER_USER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  _founderIds = new Set(ids);
  return _founderIds;
}

/**
 * Should skip-trace fire for this assignment transition?
 *   - null -> non-null (first claim)
 *   - any -> founder UUID (reassignment to Logan/Adam)
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
      for (const phone of allPhones) {
        if (typeof phone.number === "string") {
          phones.add(normalizePhoneForDedup(phone.number));
        }
      }
    }

    const allEmails = flags.all_emails as Array<{ email?: string }> | undefined;
    if (Array.isArray(allEmails)) {
      for (const email of allEmails) {
        if (typeof email.email === "string") {
          emails.add(normalizeEmailForDedup(email.email));
        }
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
      if (typeof row.phone === "string") {
        phones.add(normalizePhoneForDedup(row.phone));
      }
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
    for (const fact of facts) {
      const value = fact.fact_value as string;
      if (fact.fact_type === "primary_phone" || fact.fact_type === "phone_number") {
        phones.add(normalizePhoneForDedup(value));
      } else {
        emails.add(normalizeEmailForDedup(value));
      }
    }
  }

  return { phones, emails };
}

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

export interface SkipTraceIntelContext {
  leadId: string;
  propertyId: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  ownerName?: string;
  reason: string;
  force?: boolean;
}

export interface SkipTraceIntelResult {
  ran: boolean;
  reason: string;
  phonesFound: number;
  emailsFound: number;
  newFactsCreated: number;
  phonesPromoted: number;
  saveFailures?: number;
  saveErrors?: string[];
  providers: string[];
}

/**
 * Run skip-trace through the intel pipeline with dedup.
 */
export async function runSkipTraceIntel(
  ctx: SkipTraceIntelContext,
): Promise<SkipTraceIntelResult> {
  const sb = createServerClient();
  const tag = `[SkipTraceIntel:${ctx.reason}]`;

  if (!ctx.address) {
    console.log(`${tag} Skipped - no address for lead ${ctx.leadId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("leads") as any)
      .update({
        skip_trace_status: "failed",
        skip_trace_last_attempted_at: new Date().toISOString(),
        skip_trace_last_error: "missing_address",
      })
      .eq("id", ctx.leadId);

    return {
      ran: false,
      reason: "no_address",
      phonesFound: 0,
      emailsFound: 0,
      newFactsCreated: 0,
      phonesPromoted: 0,
      saveFailures: 0,
      saveErrors: [],
      providers: [],
    };
  }

  if (!ctx.force && await isDebounced(sb, ctx.propertyId)) {
    console.log(`${tag} Debounced - skip trace ran within ${DEBOUNCE_HOURS}h for property ${ctx.propertyId}`);
    return {
      ran: false,
      reason: "debounced",
      phonesFound: 0,
      emailsFound: 0,
      newFactsCreated: 0,
      phonesPromoted: 0,
      saveFailures: 0,
      saveErrors: [],
      providers: [],
    };
  }

  const t0 = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("leads") as any)
    .update({
      skip_trace_status: "running",
      skip_trace_last_attempted_at: new Date().toISOString(),
      skip_trace_last_error: null,
    })
    .eq("id", ctx.leadId);

  const fingerprints = await collectFingerprints(sb, ctx.leadId, ctx.propertyId);
  console.log(`${tag} Fingerprints: ${fingerprints.phones.size} phones, ${fingerprints.emails.size} emails already known`);

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
  } catch (error) {
    console.error(`${tag} dualSkipTrace failed:`, error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("leads") as any)
      .update({
        skip_trace_status: "failed",
        skip_trace_last_error: "provider_error",
      })
      .eq("id", ctx.leadId);

    return {
      ran: true,
      reason: "provider_error",
      phonesFound: 0,
      emailsFound: 0,
      newFactsCreated: 0,
      phonesPromoted: 0,
      saveFailures: 0,
      saveErrors: [],
      providers: [],
    };
  }

  console.log(`${tag} Providers returned: ${result.totalPhoneCount} phones, ${result.totalEmailCount} emails [${result.providers.join("+")}] in ${Date.now() - t0}ms`);

  let artifactId: string | null = null;
  const persistenceWarnings: string[] = [];
  const recordPersistenceWarning = (label: string, error: unknown) => {
    const message = `${label}:${getErrorMessage(error)}`.slice(0, 500);
    persistenceWarnings.push(message);
    console.error(`${tag} ${label}:`, error);
  };

  try {
    artifactId = await createArtifact({
      leadId: ctx.leadId,
      propertyId: ctx.propertyId,
      sourceType: `skiptrace_${ctx.reason}`,
      sourceLabel: `Skip trace (${result.providers.join(", ")}) - ${ctx.reason}`,
      rawExcerpt: JSON.stringify({
        phones: result.phones,
        emails: result.emails,
        persons: result.persons,
        primaryPhone: result.primaryPhone,
        primaryEmail: result.primaryEmail,
        isLitigator: result.isLitigator,
        hasDncNumbers: result.hasDncNumbers,
      }).slice(0, 10000),
      capturedBy: undefined,
    });
  } catch (error) {
    recordPersistenceWarning("artifact_persist_failed", error);
  }

  let newFacts = 0;
  const providerLabel = result.providers.join("+");
  type PersistFactInput = Omit<Parameters<typeof createFact>[0], "artifactId">;

  const persistFact = async (input: PersistFactInput): Promise<boolean> => {
    if (!artifactId) return false;
    try {
      await createFact({
        artifactId,
        ...input,
      });
      return true;
    } catch (error) {
      recordPersistenceWarning(`fact_${input.factType}_persist_failed`, error);
      return false;
    }
  };

  if (result.primaryPhone && !fingerprints.phones.has(normalizePhoneForDedup(result.primaryPhone))) {
    fingerprints.phones.add(normalizePhoneForDedup(result.primaryPhone));
    if (await persistFact({
      leadId: ctx.leadId,
      factType: "primary_phone",
      factValue: result.primaryPhone,
      confidence: "medium",
      promotedField: "phone",
      assertedBy: undefined,
    })) {
      newFacts++;
    }
  }

  if (result.primaryEmail && !fingerprints.emails.has(normalizeEmailForDedup(result.primaryEmail))) {
    fingerprints.emails.add(normalizeEmailForDedup(result.primaryEmail));
    if (await persistFact({
      leadId: ctx.leadId,
      factType: "primary_email",
      factValue: result.primaryEmail,
      confidence: "medium",
      promotedField: "email",
      assertedBy: undefined,
    })) {
      newFacts++;
    }
  }

  if (result.isLitigator) {
    if (await persistFact({
      leadId: ctx.leadId,
      factType: "litigator_flag",
      factValue: "true",
      confidence: "high",
      assertedBy: undefined,
    })) {
      newFacts++;
    }
  }

  for (const phone of result.phones.slice(0, 5)) {
    const normalizedPhone = normalizePhoneForDedup(phone.number);
    if (fingerprints.phones.has(normalizedPhone)) continue;
    fingerprints.phones.add(normalizedPhone);
    if (await persistFact({
      leadId: ctx.leadId,
      factType: "phone_number",
      factValue: phone.number,
      confidence: phone.confidence >= 80 ? "high" : phone.confidence >= 50 ? "medium" : "low",
      assertedBy: undefined,
    })) {
      newFacts++;
    }
  }

  for (const email of result.emails.slice(0, 4)) {
    const normalizedEmail = normalizeEmailForDedup(email.email);
    if (fingerprints.emails.has(normalizedEmail)) continue;
    fingerprints.emails.add(normalizedEmail);
    if (await persistFact({
      leadId: ctx.leadId,
      factType: "email",
      factValue: email.email,
      confidence: email.deliverable ? "medium" : "low",
      assertedBy: undefined,
    })) {
      newFacts++;
    }
  }

  let phonesPromoted = 0;
  let saveFailures = 0;
  const saveErrors: string[] = [];
  const phonesToPromote: Array<{ number: string; source: string; isPrimary: boolean }> = [];

  if (result.primaryPhone) {
    phonesToPromote.push({ number: result.primaryPhone, source: providerLabel, isPrimary: true });
  }
  for (const phone of result.phones.slice(0, 5)) {
    phonesToPromote.push({ number: phone.number, source: phone.source, isPrimary: false });
  }

  if (phonesToPromote.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingPhones } = await (sb.from("lead_phones") as any)
      .select("phone, position")
      .eq("lead_id", ctx.leadId);

    const existingNormalized = new Set(
      (existingPhones ?? []).map((phone: { phone: string }) => normalizePhoneForDedup(phone.phone))
    );

    let nextPosition = Math.max(
      -1,
      ...(existingPhones ?? []).map((phone: { position: number }) => phone.position ?? -1),
    ) + 1;

    for (const phone of phonesToPromote) {
      const normalizedPhone = normalizePhoneForDedup(phone.number);
      if (existingNormalized.has(normalizedPhone)) continue;

      const formattedPhone = normalizedPhone.length === 10 ? `+1${normalizedPhone}` : phone.number;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sb.from("lead_phones") as any)
        .insert({
          lead_id: ctx.leadId,
          property_id: ctx.propertyId,
          phone: formattedPhone,
          label: phone.isPrimary ? "primary" : "mobile",
          source: `skiptrace:${phone.source}`,
          status: "active",
          is_primary: phone.isPrimary && nextPosition === 0,
          position: nextPosition,
        });

      if (!error) {
        phonesPromoted++;
        existingNormalized.add(normalizedPhone);
        nextPosition++;
      } else if (error.code !== "23505") {
        console.error(`${tag} lead_phones insert failed:`, error.message);
        saveFailures++;
        saveErrors.push(error.message);
      }
    }

    console.log(`${tag} Promoted ${phonesPromoted} phones to lead_phones for lead ${ctx.leadId}`);
  }

  await markDebounce(sb, ctx.propertyId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("leads") as any)
    .update({
      skip_trace_status: saveFailures > 0 ? "partial_failure" : "completed",
      skip_trace_completed_at: saveFailures > 0 ? null : new Date().toISOString(),
      skip_trace_last_error: saveFailures > 0 ? saveErrors.join("; ").slice(0, 500) : null,
    })
    .eq("id", ctx.leadId);

  if (persistenceWarnings.length > 0) {
    console.warn(`${tag} Completed with intelligence persistence warnings: ${persistenceWarnings.join("; ")}`);
  }

  console.log(`${tag} Complete for lead ${ctx.leadId}: ${newFacts} new facts, ${phonesPromoted} phones promoted (${result.totalPhoneCount} phones, ${result.totalEmailCount} emails total) in ${Date.now() - t0}ms`);

  return {
    ran: true,
    reason: "completed",
    phonesFound: result.totalPhoneCount,
    emailsFound: result.totalEmailCount,
    newFactsCreated: newFacts,
    phonesPromoted,
    saveFailures,
    saveErrors,
    providers: result.providers,
  };
}
