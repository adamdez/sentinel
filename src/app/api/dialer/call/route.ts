import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { scrubLead } from "@/lib/compliance";
import { scheduleNextCall, suggestNextCadenceDate } from "@/lib/call-scheduler";
import { dispositionCategory } from "@/lib/comm-truth";
import { getTwilioCredentials, isTwilioError, friendlyTwilioError } from "@/lib/twilio";
import { validateStatusTransition } from "@/lib/lead-guardrails";
import type { LeadStatus } from "@/lib/types";
import { progressIntroSopForCallAttempt } from "@/lib/intro-sop";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const LEAD_STATUS_SET = new Set<LeadStatus>([
  "staging",
  "prospect",
  "lead",
  "active",
  "negotiation",
  "disposition",
  "nurture",
  "dead",
  "closed",
]);

function normalizeLeadStatus(raw: string | null | undefined): LeadStatus {
  const normalized = (raw ?? "").toLowerCase().replace(/\s+/g, "_");
  // Legacy compatibility only: "My Leads" is an assignment segment, never a canonical stage.
  if (normalized === "my_lead" || normalized === "my_leads" || normalized === "my_lead_status") {
    return "lead";
  }
  if (LEAD_STATUS_SET.has(normalized as LeadStatus)) {
    return normalized as LeadStatus;
  }
  return "prospect";
}

function resolveDialerNoContactStatusTarget(currentStatus: LeadStatus): LeadStatus | null {
  if (
    (currentStatus === "lead" || currentStatus === "active" || currentStatus === "negotiation" || currentStatus === "disposition")
    && validateStatusTransition(currentStatus, "nurture")
  ) {
    return "nurture";
  }
  return null;
}

type GuardedWorkflowResult =
  | { ok: true; statusAfter: LeadStatus; statusTarget: LeadStatus | null }
  | { ok: false; status: number; detail: string };

async function applyGuardedDialerWorkflowMutation(args: {
  req: NextRequest;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any;
  bearerToken: string;
  leadId: string;
  lockVersion: number;
  currentStatus: LeadStatus;
}): Promise<GuardedWorkflowResult> {
  const { req, sb, bearerToken, leadId } = args;

  const tryPatch = async (lockVersion: number, currentStatus: LeadStatus): Promise<GuardedWorkflowResult> => {
    const statusTarget = resolveDialerNoContactStatusTarget(currentStatus);
    const patchBody: Record<string, unknown> = {
      lead_id: leadId,
      assigned_to: null,
      next_call_scheduled_at: null,
      next_follow_up_at: null,
    };
    if (statusTarget && statusTarget !== currentStatus) {
      patchBody.status = statusTarget;
    }

    const prospectsUrl = new URL("/api/prospects", req.url).toString();
    const res = await fetch(prospectsUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
        "x-lock-version": String(lockVersion),
      },
      body: JSON.stringify(patchBody),
    });

    const payload = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        detail: String(payload.detail ?? payload.error ?? `HTTP ${res.status}`),
      };
    }

    const statusAfterRaw = typeof payload.status === "string" ? payload.status : currentStatus;
    return {
      ok: true,
      statusAfter: normalizeLeadStatus(statusAfterRaw),
      statusTarget,
    };
  };

  const first = await tryPatch(args.lockVersion, args.currentStatus);
  if (first.ok || first.status !== 409) {
    return first;
  }

  // Retry once after lock conflict using fresh lock/status.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latestLead, error: latestErr } = await (sb.from("leads") as any)
    .select("lock_version, status")
    .eq("id", leadId)
    .single();

  if (latestErr || !latestLead) {
    return {
      ok: false,
      status: 409,
      detail: "Workflow update conflict and latest lead state could not be loaded.",
    };
  }

  return tryPatch(
    Number.isInteger(latestLead.lock_version) ? latestLead.lock_version : 0,
    normalizeLeadStatus(latestLead.status),
  );
}

/**
 * POST /api/dialer/call
 *
 * Initiates a Twilio outbound call and logs it to calls_log.
 *
 * Body: { phone, leadId, propertyId, userId, ghostMode? }
 *
 * Flow:
 *   1. First-call consent guard (lead-linked calls)
 *   2. Compliance scrub (unless ghost mode)
 *   3. Create Twilio call via REST API
 *   4. Insert calls_log record
 *   5. Audit log
 *   6. Return call SID
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const reqAuthHeader = req.headers.get("authorization");
  const bearerToken = reqAuthHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(bearerToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    console.error("[Dialer] Twilio credential error:", creds.error, "—", creds.hint);
    return NextResponse.json({ error: creds.error }, { status: 500 });
  }
  const { sid, from: fallbackFrom, authHeader } = creds;

  let body: {
    phone: string;
    leadId?: string;
    propertyId?: string;
    userId?: string;
    ghostMode?: boolean;
    mode?: "voip" | "cell";
    sessionId?: string;    // PR2: links this calls_log row to the dialer call_sessions row
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  // Strip everything except digits, then normalise to exactly 10-digit US number
  let digits = body.phone.replace(/\D/g, "");
  // Strip leading country code "1" if present (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  if (digits.length < 10) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }
  // Always use exactly 10 digits for US E.164
  const phone = digits.slice(0, 10);
  const e164 = `+1${phone}`;
  const userId = user.id;

  // 1. Validate lead exists if lead-linked call
  if (body.leadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadRecord, error: leadErr } = await (sb.from("leads") as any)
      .select("id")
      .eq("id", body.leadId)
      .single();

    if (leadErr || !leadRecord) {
      return NextResponse.json({ error: "Lead not found for call" }, { status: 404 });
    }
  }

  // 2. Compliance scrub
  const scrub = await scrubLead(body.phone, userId, body.ghostMode ?? false);
  if (!scrub.allowed) {
    return NextResponse.json(
      { error: "Compliance blocked", reasons: scrub.blockedReasons },
      { status: 403 }
    );
  }

  const callMode = body.mode ?? "voip";

  // 3. Lookup agent's profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: agentProfile } = await (sb.from("user_profiles") as any)
    .select("personal_cell, twilio_phone_number, full_name")
    .eq("id", userId)
    .single();

  const agentCell = (agentProfile?.personal_cell as string) ?? "";
  const agentTwilioNumber = (agentProfile?.twilio_phone_number as string) ?? "";
  const agentFullName = (agentProfile?.full_name as string) ?? "";

  // ── VoIP Pre-flight Mode ──────────────────────────────────────────
  // Browser SDK handles the actual call. We just do compliance + logging.
  if (callMode === "voip") {
    const from = agentTwilioNumber || fallbackFrom;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: callLog, error: logErr } = await (sb.from("calls_log") as any)
      .insert({
        lead_id: body.leadId || null,
        property_id: body.propertyId || null,
        user_id: userId,
        phone_dialed: e164,
        disposition: "initiating",
        started_at: new Date().toISOString(),
        dialer_session_id: body.sessionId ?? null,  // PR2: FK to call_sessions
      })
      .select("id")
      .single();

    if (logErr) {
      console.error("[Dialer] calls_log insert failed:", logErr);
    }

    // Audit log (non-blocking)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("event_log") as any).insert({
      user_id: userId,
      action: "dialer.voip_preflight",
      entity_type: "call",
      entity_id: callLog?.id ?? "unknown",
      details: {
        phone: `***${phone.slice(-4)}`,
        lead_id: body.leadId,
        from_number: from,
        mode: "voip",
        ghost_mode: body.ghostMode ?? false,
      },
    });

    console.log("[Dialer] VoIP pre-flight:", e164.slice(-4), "callLogId:", callLog?.id);

    return NextResponse.json({
      success: true,
      callLogId: callLog?.id ?? null,
      phone: e164,
      mode: "voip",
      callerId: from,
    });
  }

  // ── Cell-bridge Mode (legacy) ─────────────────────────────────────
  // Agent-first flow requires a personal cell to ring
  if (!agentCell) {
    return NextResponse.json(
      { error: "Personal cell not configured — set it in Settings before using the dialer" },
      { status: 400 },
    );
  }

  let agentCellDigits = agentCell.replace(/\D/g, "");
  if (agentCellDigits.length === 11 && agentCellDigits.startsWith("1")) {
    agentCellDigits = agentCellDigits.slice(1);
  }
  const agentCellE164 = `+1${agentCellDigits.slice(0, 10)}`;

  const from = agentTwilioNumber || fallbackFrom;
  if (!from) {
    return NextResponse.json(
      { error: "No Twilio phone number configured for this user or in environment" },
      { status: 500 },
    );
  }

  const firstName = agentFullName.split(" ")[0] || "";
  const callerIdName = firstName
    ? `Dominion ${firstName}`.substring(0, 15)
    : "Dominion Homes";

  // 3. Twilio REST API — agent-first click-to-call
  //    Twilio calls the AGENT's cell. When the agent picks up, the
  //    voice webhook bridges the call to the PROSPECT.
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`;

  // Resolve the public URL for Twilio webhooks.
  // CRITICAL: Twilio MUST be able to reach these URLs from the internet.
  // localhost will NOT work in production — Twilio silently fails.
  let siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  // Force HTTPS in production (Twilio requires it)
  if (siteUrl && !siteUrl.startsWith("https://") && process.env.NODE_ENV === "production") {
    siteUrl = siteUrl.replace("http://", "https://");
  }

  if (!siteUrl || siteUrl.includes("localhost")) {
    console.error("[Dialer] FATAL: Webhook URL is unreachable:", siteUrl || "(empty)",
      "— Set NEXT_PUBLIC_SITE_URL to your public deployment URL");

    // In development, fall back to localhost but warn
    if (process.env.NODE_ENV !== "production" && !siteUrl) {
      siteUrl = "http://localhost:3000";
      console.warn("[Dialer] Using localhost for development — calls will connect but bridging won't work without ngrok/tunneling");
    } else if (!siteUrl) {
      return NextResponse.json({
        success: false,
        error: "Webhook URL not configured — set NEXT_PUBLIC_SITE_URL in Vercel environment variables to your public URL (e.g. https://sentinel.vercel.app)",
      }, { status: 500 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callLog, error: logErr } = await (sb.from("calls_log") as any)
    .insert({
      lead_id: body.leadId || null,
      property_id: body.propertyId || null,
      user_id: userId,
      phone_dialed: e164,
      transferred_to_cell: agentCellE164,
      disposition: "initiating",
      started_at: new Date().toISOString(),
      dialer_session_id: body.sessionId ?? null,  // PR2: FK to call_sessions
    })
    .select("id")
    .single();

  if (logErr) {
    console.error("[Dialer] calls_log insert failed:", logErr);
  }

  const voiceWebhookUrl = `${siteUrl}/api/twilio/voice?agentId=${encodeURIComponent(userId)}&callLogId=${encodeURIComponent(callLog?.id ?? "")}&prospectPhone=${encodeURIComponent(e164)}`;
  // PR2: thread sessionId into the StatusCallback URL so /api/twilio/voice/status
  // can forward it to the internal dialer session sync route.
  const sessionParam = body.sessionId ? `&sessionId=${encodeURIComponent(body.sessionId)}` : "";
  const statusCallbackUrl = `${siteUrl}/api/twilio/voice/status?callLogId=${encodeURIComponent(callLog?.id ?? "")}${sessionParam}&type=call_status`;

  const formData = new URLSearchParams({
    To: agentCellE164,
    From: from,
    Url: voiceWebhookUrl,
    StatusCallback: statusCallbackUrl,
    StatusCallbackEvent: "initiated ringing answered completed",
  });

  let twilioSid: string | null = null;
  let twilioError: string | null = null;

  try {
    const res = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      const rawMsg = data.message ?? `Twilio HTTP ${res.status}`;
      twilioError = friendlyTwilioError(rawMsg);
      console.error("[Dialer] Twilio error:", data);
    } else {
      twilioSid = data.sid;
      console.log("[Dialer] Call initiated:", twilioSid, "From:", from, "CallerID:", callerIdName);
    }
  } catch (err) {
    twilioError = err instanceof Error ? err.message : "Network error";
    console.error("[Dialer] Twilio fetch failed:", err);
  }

  // 3. Update calls_log with Twilio SID
  if (callLog?.id && twilioSid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("calls_log") as any)
      .update({ twilio_sid: twilioSid, disposition: "in_progress" })
      .eq("id", callLog.id);
  }

  // 4. Audit log (non-blocking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: userId,
    action: "dialer.call_initiated",
    entity_type: "call",
    entity_id: callLog?.id ?? twilioSid ?? "unknown",
    details: {
      phone: `***${phone.slice(-4)}`,
      lead_id: body.leadId,
      twilio_sid: twilioSid,
      from_number: from,
      caller_id_name: callerIdName,
      transferred_to: agentCell ? `***${agentCell.slice(-4)}` : null,
      ghost_mode: body.ghostMode ?? false,
    },
  });

  if (twilioError) {
    return NextResponse.json({
      success: false,
      error: twilioError,
      callLogId: callLog?.id ?? null,
    }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    callSid: twilioSid,
    callLogId: callLog?.id ?? null,
    phone: e164,
    transferTo: agentCell || null,
  });
}

/**
 * PATCH /api/dialer/call
 *
 * Updates a call record with disposition, duration, notes.
 * Body: { callLogId, disposition, durationSec?, notes?, endedAt? }
 */
export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const patchToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user: patchUser } } = await sb.auth.getUser(patchToken);
  if (!patchUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    callLogId: string;
    disposition: string;
    durationSec?: number;
    notes?: string;
    endedAt?: string;
    userId?: string;
    /**
     * Set by PostCallPanel when a dialer session exists.
     * publish-manager already wrote calls_log; skip the duplicate write here
     * so only one path owns the final calls_log outcome. Counter RPC still runs.
     */
    skipCallsLogWrite?: boolean;
    /**
     * Operator-set callback date from PostCallPanel (ISO string).
     * Overrides cadence-calculated next_call_scheduled_at in increment_lead_call_counters.
     * Only set for follow_up / appointment dispositions.
     */
    nextCallScheduledAt?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.callLogId || !body.disposition) {
    return NextResponse.json({ error: "callLogId and disposition required" }, { status: 400 });
  }

  const endedAt = body.endedAt ?? new Date().toISOString();

  // publish-manager owns calls_log for session-backed calls (PR3b).
  // Skip the duplicate write; proceed to increment_lead_call_counters below.
  if (!body.skipCallsLogWrite) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("calls_log") as any)
      .update({
        disposition: body.disposition,
        duration_sec: body.durationSec ?? 0,
        notes: body.notes ?? null,
        ended_at: endedAt,
      })
      .eq("id", body.callLogId);

    if (error) {
      console.error("[Dialer] calls_log update failed:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // ── 7-Day Power Sequence: update lead counters + schedule next call ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callRow } = await (sb.from("calls_log") as any)
    .select("lead_id")
    .eq("id", body.callLogId)
    .single();

  if (callRow?.lead_id) {
    // ── Fetch lead state for scheduling decisions ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadForSchedule, error: leadFetchErr } = await (sb.from("leads") as any)
      .select("status, lock_version, call_sequence_step, total_calls")
      .eq("id", callRow.lead_id)
      .single();

    if (leadFetchErr) {
      console.error("[Dialer] leads fetch failed:", leadFetchErr);
      return NextResponse.json({ error: "Could not load lead state for call update" }, { status: 500 });
    }

    if (leadForSchedule) {
      const step: number = leadForSchedule.call_sequence_step ?? 1;
      const isDriveByDisposition = body.disposition === "drive_by";
      const dispoCategory = dispositionCategory(body.disposition);
      const isLive = dispoCategory === "live";
      const isVM = dispoCategory === "voicemail";
      const currentStatus = normalizeLeadStatus(leadForSchedule.status);
      const newTotalCalls = (leadForSchedule.total_calls ?? 0) + 1;

      // Use 30-day cadence for follow-up scheduling (Day 1, 3, 7, 10, 14, 21, 30)
      // Falls back to power sequence for special dispositions (interested, dead, etc.)
      const sched = scheduleNextCall(step, endedAt, body.disposition);
      const cadenceNext = suggestNextCadenceDate(endedAt, newTotalCalls);
      const sequenceCompleteWithoutLiveAnswer = !isDriveByDisposition && sched.isComplete && !isLive;
      const shouldClearSequence = isDriveByDisposition || sequenceCompleteWithoutLiveAnswer;

      // Prefer cadence-based scheduling for standard follow-ups;
      // use power sequence override for hot dispositions (interested/appointment)
      const isHotDispo = ["interested", "appointment", "contract"].includes(body.disposition);
      const calculatedNextCallAt = isHotDispo
        ? sched.nextCallAt
        : cadenceNext
          ? cadenceNext.toISOString()
          : sched.nextCallAt;
      // Operator-set date from PostCallPanel takes precedence over cadence calculation
      const nextCallAt = isDriveByDisposition
        ? null
        : body.nextCallScheduledAt ?? calculatedNextCallAt;

      // ── Atomic counter increment via RPC ──
      // Replaces read-modify-write pattern to prevent race conditions
      // when concurrent calls update the same lead's counters.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcErr } = await (sb as any).rpc(
        "increment_lead_call_counters",
        {
          p_lead_id: callRow.lead_id,
          p_is_live: isLive,
          p_is_voicemail: isVM,
          p_last_contact_at: endedAt,
          p_call_sequence_step: shouldClearSequence ? 1 : sched.sequenceStep,
          p_next_call_scheduled_at: shouldClearSequence ? null : nextCallAt,
          p_clear_sequence: shouldClearSequence,
        },
      );

      if (rpcErr) {
        console.error("[Dialer] atomic lead counter update failed:", rpcErr);
        return NextResponse.json({ error: "Could not update lead call sequence" }, { status: 500 });
      }

      if (sequenceCompleteWithoutLiveAnswer) {
        if (!patchToken) {
          return NextResponse.json({ error: "Missing auth token for guarded workflow update" }, { status: 401 });
        }

        const lockVersion = rpcResult?.lock_version ?? (Number.isInteger(leadForSchedule.lock_version) ? leadForSchedule.lock_version : 0);

        const guardedResult = await applyGuardedDialerWorkflowMutation({
          req,
          sb,
          bearerToken: patchToken,
          leadId: callRow.lead_id,
          lockVersion: lockVersion,
          currentStatus,
        });

        if (!guardedResult.ok) {
          console.error("[Dialer] guarded workflow mutation failed:", guardedResult.detail);
          return NextResponse.json(
            { error: "Workflow update failed", detail: guardedResult.detail },
            { status: guardedResult.status },
          );
        }

        // Non-blocking dialer-specific workflow audit context.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("event_log") as any).insert({
          user_id: patchUser.id,
          action: "dialer.sequence_routed",
          entity_type: "lead",
          entity_id: callRow.lead_id,
          details: {
            trigger: "7_day_no_live_answer",
            status_before: currentStatus,
            status_target: guardedResult.statusTarget,
            status_after: guardedResult.statusAfter,
            assignment_cleared: true,
          },
        }).then(({ error: auditErr }: { error: unknown }) => {
          if (auditErr) {
            console.error("[Dialer] sequence route audit failed (non-fatal):", auditErr);
          }
        });
      }
    }

    try {
      await progressIntroSopForCallAttempt({
        sb,
        leadId: callRow.lead_id,
        attemptedAtIso: endedAt,
      });
    } catch (introError) {
      console.warn("[Dialer] intro SOP progress failed (non-fatal):", introError);
    }
  }

  // Audit log (non-blocking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: patchUser.id,
    action: "dialer.call_dispositioned",
    entity_type: "call",
    entity_id: body.callLogId,
    details: {
      disposition: body.disposition,
      duration_sec: body.durationSec,
    },
  });

  return NextResponse.json({ success: true });
}
