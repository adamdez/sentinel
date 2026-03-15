/**
 * Dialer Publish Manager — PR3
 *
 * Writes post-call outcomes back to CRM tables.
 * This is the ONLY file in the dialer domain that writes CRM tables.
 *
 * BOUNDARY RULES:
 *   - Import ONLY from ./types and ./session-manager
 *   - NEVER import from @/lib/supabase or any CRM module
 *   - NEVER import crm-bridge.ts here (read-only; belongs in routes)
 *   - Must UPDATE calls_log by dialer_session_id — NEVER INSERT
 *   - A missing calls_log row is non-fatal; qualification writes still proceed
 *
 * OVERWRITE RULES (conservative by design):
 *   - disposition:    only if current value is null, blank, or in PROVISIONAL_DISPOSITIONS
 *   - duration_sec:   only if current value is falsy (0 or null)
 *   - notes:          always overwrites calls_log.notes when summary is provided
 *   - leads fields:   only explicitly provided qualification fields are written; others untouched
 *
 * Future developers: do not add CRM reads here.
 * Reads belong in crm-bridge.ts. This file is write-only toward CRM tables.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TERMINAL_STATUSES,
  PUBLISH_DISPOSITIONS,
  SELLER_TIMELINES,
  QUALIFICATION_ROUTES,
  type PublishInput,
  type PublishResult,
} from "./types";
import { getSession } from "./session-manager";

export type { PublishInput, PublishResult };
export { PUBLISH_DISPOSITIONS, SELLER_TIMELINES, QUALIFICATION_ROUTES };

// ─────────────────────────────────────────────────────────────
// Provisional dispositions — safe for publish to overwrite
// ─────────────────────────────────────────────────────────────

/**
 * Machine-set or transitional values on calls_log.disposition.
 * Publish is permitted to replace any of these with a human outcome.
 *
 * "completed" is intentionally included: Twilio sets it as a technical
 * call-ended signal, not a meaningful human classification. An operator
 * publishing a richer disposition ("voicemail", "follow_up", etc.)
 * supersedes it. Publishing "completed" over "completed" is a harmless no-op.
 *
 * Any value NOT listed here is treated as already operator-set and is
 * never overwritten.
 */
const PROVISIONAL_DISPOSITIONS = new Set<string | null>([
  null,
  "",
  "initiating",
  "initiated",
  "ringing",
  "ringing_agent",
  "agent_connected",
  "agent_answered",
  "in_progress",
  "completed",
]);

// ─────────────────────────────────────────────────────────────
// publishSession
// ─────────────────────────────────────────────────────────────

/**
 * Writes post-call outcomes to calls_log and leads for the given session.
 *
 * Ownership is verified via getSession() before any writes.
 * Returns ok=true even when no calls_log row exists — qualification
 * writes to leads proceed regardless.
 */
export async function publishSession(
  sb: SupabaseClient,
  sessionId: string,
  userId: string,
  input: PublishInput,
): Promise<PublishResult> {
  // ── Ownership gate ────────────────────────────────────────
  const sessionResult = await getSession(sb, sessionId, userId);
  if (sessionResult.error || !sessionResult.data) {
    return {
      ok: false,
      calls_log_id: null,
      lead_id: null,
      error: sessionResult.error ?? undefined,
      code: sessionResult.code,
    };
  }

  const session = sessionResult.data;

  // ── Terminal state guard ──────────────────────────────────
  if (!TERMINAL_STATUSES.has(session.status)) {
    return {
      ok: false,
      calls_log_id: null,
      lead_id: null,
      error: "Session must be in a terminal state (ended or failed) before publishing",
      code: "INVALID_TRANSITION",
    };
  }

  const leadId = session.lead_id ?? null;
  let callsLogId: string | null = null;

  // ── Step 1: calls_log update ──────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingLog } = await (sb.from("calls_log") as any)
    .select("id, disposition, duration_sec")
    .eq("dialer_session_id", sessionId)
    .maybeSingle();

  if (!existingLog) {
    console.warn(
      "[publish-manager] No calls_log row found for session",
      sessionId.slice(0, 8),
      "— skipping calls_log update",
    );
  } else {
    callsLogId = existingLog.id as string;

    const patch: Record<string, unknown> = {};

    if (PROVISIONAL_DISPOSITIONS.has(existingLog.disposition ?? null)) {
      patch.disposition = input.disposition;
    }

    if (input.duration_sec !== undefined && !existingLog.duration_sec) {
      patch.duration_sec = input.duration_sec;
    }

    if (input.summary?.trim()) {
      patch.notes = input.summary.trim();
    }

    if (Object.keys(patch).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (sb.from("calls_log") as any)
        .update(patch)
        .eq("id", callsLogId);

      if (updateErr) {
        console.error("[publish-manager] calls_log update failed:", updateErr.message);
        return {
          ok: false,
          calls_log_id: callsLogId,
          lead_id: leadId,
          error: updateErr.message,
          code: "DB_ERROR",
        };
      }
    }
  }

  // ── Step 2: leads qualification update ───────────────────

  if (leadId) {
    const qualPatch: Record<string, unknown> = {};
    if (input.motivation_level    !== undefined) qualPatch.motivation_level    = input.motivation_level;
    if (input.seller_timeline     !== undefined) qualPatch.seller_timeline     = input.seller_timeline;
    if (input.qualification_route !== undefined) qualPatch.qualification_route = input.qualification_route;

    if (Object.keys(qualPatch).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: leadErr } = await (sb.from("leads") as any)
        .update(qualPatch)
        .eq("id", leadId);

      if (leadErr) {
        console.error("[publish-manager] leads qualification update failed:", leadErr.message);
        return {
          ok: false,
          calls_log_id: callsLogId,
          lead_id: leadId,
          error: leadErr.message,
          code: "DB_ERROR",
        };
      }
    }
  }

  return { ok: true, calls_log_id: callsLogId, lead_id: leadId };
}
