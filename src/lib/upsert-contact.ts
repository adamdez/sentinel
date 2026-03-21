/**
 * Contact Deduplication — P1-13
 *
 * Upserts a contact by normalized phone number. If a contact with the
 * same phone already exists, returns it (optionally backfilling null
 * name/email fields). If not, inserts a new one.
 *
 * Phone normalization: strips non-digits, ensures E.164 format
 * (assumes US +1 if 10 digits).
 *
 * BOUNDARY:
 *   - Reads/writes contacts table only
 *   - Pure server-side — uses Supabase service role client
 *   - Never touches leads, properties, or any other table
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Phone normalization ──────────────────────────────────────────────

/**
 * Normalizes a phone number to E.164 format.
 * - Strips all non-digit characters
 * - If 10 digits, prepends +1 (US)
 * - If 11 digits starting with 1, prepends +
 * - Otherwise prepends + if not already there
 * - Returns null if fewer than 10 digits after stripping
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");

  if (digits.length < 10) return null;

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // International or longer number — just prefix with +
  return `+${digits}`;
}

// ── Types ────────────────────────────────────────────────────────────

export interface UpsertContactInput {
  phone: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  source?: string | null;
  contact_type?: string | null;
}

export interface UpsertContactResult {
  id: string;
  created: boolean;
  phone: string;
}

// ── Main upsert function ─────────────────────────────────────────────

/**
 * Upserts a contact by phone number.
 *
 * 1. Normalizes the phone to E.164
 * 2. Searches contacts for an existing match (checks raw, +1-prefixed, and digits-only)
 * 3. If found: optionally backfills null first_name, last_name, email
 * 4. If not found: inserts a new contact
 * 5. Returns the contact id + whether it was newly created
 *
 * Throws on DB errors.
 */
export async function upsertContact(
  sb: SupabaseClient,
  input: UpsertContactInput,
): Promise<UpsertContactResult> {
  const normalized = normalizePhone(input.phone);
  if (!normalized) {
    throw new Error(`Invalid phone number: "${input.phone}" — must have at least 10 digits`);
  }

  const digitsOnly = normalized.replace(/\D/g, "");
  // Also check without country code for legacy data
  const withoutCountry = digitsOnly.length === 11 && digitsOnly.startsWith("1")
    ? digitsOnly.slice(1)
    : digitsOnly;

  // ── Search for existing contact ─────────────────────────────────
  // Check multiple phone formats to catch legacy data stored differently
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: searchErr } = await (sb.from("contacts") as any)
    .select("id, first_name, last_name, email, phone")
    .or(
      `phone.eq.${normalized},phone.eq.${digitsOnly},phone.eq.${withoutCountry},phone.eq.+${withoutCountry}`
    )
    .limit(1);

  if (searchErr) {
    throw new Error(`Contact search failed: ${searchErr.message}`);
  }

  // ── Existing contact found — optionally backfill ────────────────
  if (existing && existing.length > 0) {
    const contact = existing[0] as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
    };

    const updates: Record<string, unknown> = {};
    let needsUpdate = false;

    // Backfill null fields with provided values
    if (!contact.first_name && input.first_name) {
      updates.first_name = input.first_name;
      needsUpdate = true;
    }
    if (!contact.last_name && input.last_name) {
      updates.last_name = input.last_name;
      needsUpdate = true;
    }
    if (!contact.email && input.email) {
      updates.email = input.email;
      needsUpdate = true;
    }
    // Normalize stored phone if it's not already E.164
    if (contact.phone !== normalized) {
      updates.phone = normalized;
      needsUpdate = true;
    }

    if (needsUpdate) {
      updates.updated_at = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("contacts") as any)
        .update(updates)
        .eq("id", contact.id);
    }

    return { id: contact.id, created: false, phone: normalized };
  }

  // ── No existing contact — insert new ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newContact, error: insertErr } = await (sb.from("contacts") as any)
    .insert({
      first_name: input.first_name ?? "Unknown",
      last_name: input.last_name ?? "",
      phone: normalized,
      email: input.email ?? null,
      source: input.source ?? null,
      contact_type: input.contact_type ?? "owner",
    })
    .select("id")
    .single();

  if (insertErr) {
    // Race condition: another process inserted between our check and insert
    // Retry the search once
    if (insertErr.code === "23505" || (insertErr.message ?? "").includes("duplicate")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: retry } = await (sb.from("contacts") as any)
        .select("id")
        .or(
          `phone.eq.${normalized},phone.eq.${digitsOnly},phone.eq.${withoutCountry}`
        )
        .limit(1);

      if (retry && retry.length > 0) {
        return { id: retry[0].id, created: false, phone: normalized };
      }
    }
    throw new Error(`Contact insert failed: ${insertErr.message}`);
  }

  return { id: newContact.id, created: true, phone: normalized };
}
