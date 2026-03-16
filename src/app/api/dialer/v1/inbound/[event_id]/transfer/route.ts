/**
 * POST /api/dialer/v1/inbound/[event_id]/transfer
 *
 * Logs the outcome of a warm-transfer attempt for an inbound seller call.
 * The [event_id] must be the original inbound.answered or inbound.missed event.
 *
 * This endpoint is operator-initiated — Logan taps one of 4 outcomes after the
 * transfer attempt. No Twilio conferencing, no real-time bridging. Sentinel
 * records what Logan reports happened.
 *
 * Body:
 *   {
 *     outcome: "connected" | "no_answer" | "callback_fallback" | "failed",
 *     recipient_name?: string,     // who was the transfer target (e.g. "Adam")
 *     fallback_callback_date?: string,  // ISO — if falling back to callback booking
 *     notes?: string,
 *   }
 *
 * outcome → event_type mapping:
 *   connected         → transfer.connected      (success)
 *   no_answer         → transfer.failed_fallback (recipient didn't answer)
 *   callback_fallback → transfer.failed_fallback (operator chose to book callback instead)
 *   failed            → transfer.failed_fallback (technical or other failure)
 *
 * On callback_fallback or no_answer: optionally creates a follow-up callback task.
 *
 * BOUNDARY: writes dialer_events + tasks only.
 * Does NOT touch leads, calls_log, or any CRM-owned table.
 * Does NOT touch publish-manager.ts or crm-bridge.ts.
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getActiveHandoffRule, getActiveScript, type HandoffRuleConfig } from "@/lib/voice-registry";
import { buildLedgerEntry } from "@/lib/voice-consent";

// ── Exported types (for UI use) ───────────────────────────────────────────────

export type TransferOutcome = "connected" | "no_answer" | "callback_fallback" | "failed";

const TRANSFER_OUTCOMES: TransferOutcome[] = [
  "connected", "no_answer", "callback_fallback", "failed",
];

const TRANSFER_OUTCOME_LABELS: Record<TransferOutcome, string> = {
  connected:         "Connected",
  no_answer:         "No answer",
  callback_fallback: "Booked callback instead",
  failed:            "Transfer failed",
};

export interface TransferResult {
  ok:           true;
  event_id:     string;
  outcome:      TransferOutcome;
  event_type:   "transfer.connected" | "transfer.failed_fallback";
  task_id:      string | null;
}

// ── nextBusinessMorningPacific ────────────────────────────────────────────────
function nextBusinessMorningPacific(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? "0", 10);
  const y = get("year"); const mo = get("month") - 1; const d = get("day");
  const pad = (n: number) => String(n).padStart(2, "0");
  const candidate = new Date(`${y}-${pad(mo + 1)}-${pad(d)}T09:00:00-08:00`);
  let target = candidate <= now ? new Date(candidate.getTime() + 86_400_000) : candidate;
  const dow = target.getDay();
  if (dow === 0) target = new Date(target.getTime() + 86_400_000);
  if (dow === 6) target = new Date(target.getTime() + 2 * 86_400_000);
  return target;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ event_id: string }> }
) {
  try {
    const user = await getDialerUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_id } = await params;
    const body = await req.json().catch(() => ({}));

    const outcome: TransferOutcome = body.outcome;
    if (!TRANSFER_OUTCOMES.includes(outcome)) {
      return NextResponse.json(
        { error: `outcome must be one of: ${TRANSFER_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }

    const recipientName       = (body.recipient_name          ?? "").trim() || null;
    const fallbackCallbackDate = (body.fallback_callback_date  ?? "").trim() || null;
    const notes               = (body.notes                   ?? "").trim() || null;

    const sb = createDialerClient();

    // Resolve active voice registry versions for traceability and enforcement
    const [handoffRule, transferScript] = await Promise.all([
      getActiveHandoffRule().catch(() => ({ version: "unknown", rule_config: null as Required<HandoffRuleConfig> | null })),
      getActiveScript("warm_transfer").catch(() => null),
    ]);
    const handoffRuleVersion    = handoffRule.version;
    const transferScriptVersion = transferScript?.version ?? "unknown";
    const rules: Partial<HandoffRuleConfig> = handoffRule.rule_config ?? {};

    // Fetch original inbound event for lead_id + phone context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: original, error: fetchErr } = await (sb.from("dialer_events") as any)
      .select("id, lead_id, metadata")
      .eq("id", event_id)
      .in("event_type", ["inbound.answered", "inbound.missed"])
      .maybeSingle();

    if (fetchErr || !original) {
      return NextResponse.json({ error: "Inbound event not found" }, { status: 404 });
    }

    const leadId     = original.lead_id ?? null;
    const fromNumber = (original.metadata?.from_number as string) ?? null;

    // ── Handoff rule enforcement for connected transfers ──────────────────────
    // Soft block: return a clear error with handoff_warning so the UI can show why.
    // Fallback outcomes (no_answer, callback_fallback, failed) always proceed.
    if (outcome === "connected") {
      // Check if the classify event flagged a subject address
      if (rules.require_subject_address_for_transfer) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: classifyEvt } = await (sb.from("dialer_events") as any)
          .select("metadata")
          .eq("event_type", "inbound.classified")
          .filter("metadata->>original_event_id", "eq", event_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const subjectAddr = (classifyEvt?.metadata?.subject_address as string)?.trim();
        if (!subjectAddr) {
          return NextResponse.json({
            error: "Subject address is required before marking a transfer as connected (handoff rule: require_subject_address_for_transfer).",
            handoff_warning: "require_subject_address_for_transfer",
          }, { status: 422 });
        }
      }
    }

    // Map outcome to event_type
    const eventType: "transfer.connected" | "transfer.failed_fallback" =
      outcome === "connected" ? "transfer.connected" : "transfer.failed_fallback";

    // ── Optional task for fallback / no_answer ────────────────────────────────
    let taskId: string | null = null;
    if ((outcome === "callback_fallback" || outcome === "no_answer") && leadId) {
      const dueAt = fallbackCallbackDate
        ? new Date(fallbackCallbackDate)
        : nextBusinessMorningPacific();

      const taskTitle = outcome === "callback_fallback"
        ? `📞 Transfer fallback — callback ${fromNumber ?? "seller"}`
        : `⚠️ Warm transfer no answer — follow up ${fromNumber ?? "seller"}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: taskRow, error: taskErr } = await (sb.from("tasks") as any)
        .insert({
          title:    taskTitle,
          lead_id:  leadId,
          due_at:   dueAt.toISOString(),
          status:   "pending",
          priority: 3,
          notes: [
            `Warm transfer ${outcome.replace("_", " ")} at ${new Date().toISOString()}.`,
            fromNumber ? `Caller: ${fromNumber}.` : "",
            recipientName ? `Transfer recipient: ${recipientName}.` : "",
            notes ?? "",
          ].filter(Boolean).join(" "),
        })
        .select("id")
        .single();

      if (taskErr) {
        console.error("[inbound/transfer] task creation failed:", taskErr.message);
      } else {
        taskId = taskRow?.id ?? null;
      }
    }

    // ── Write transfer event ──────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: eventErr } = await (sb.from("dialer_events") as any)
      .insert({
        event_type: eventType,
        lead_id:    leadId,
        session_id: null,
        task_id:    taskId,
        metadata: {
          original_event_id:       event_id,
          outcome,
          recipient_name:          recipientName,
          fallback_callback_date:  fallbackCallbackDate,
          notes,
          from_number:             fromNumber,
          logged_by:               user.id,
          logged_at:               new Date().toISOString(),
          // Voice registry traceability — which rule + script version drove this transfer decision
          handoff_rule_version:    handoffRuleVersion,
          transfer_script_version: transferScriptVersion,
        },
      });

    if (eventErr) {
      return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }

    // ── Best-effort ledger write for transfer attempt ─────────────────────
    // Risk tier: ai_assisted = false (transfer is operator-led), but if the
    // handoff_rule_version is unknown the system defaults to "medium" via
    // consentBasis = inbound_response (still clean).
    try {
      const ledgerRow = buildLedgerEntry({
        eventId:             event_id,
        leadId:              leadId,
        interactionType:     "warm_transfer_attempt",
        consentBasis:        "inbound_response",
        automationTier:      "operator_led",
        scriptClass:         transferScriptVersion !== "unknown"
          ? `warm_transfer@${transferScriptVersion}`
          : null,
        handoffRuleVersion:  handoffRuleVersion !== "unknown" ? handoffRuleVersion : null,
        dncFlag:             false,
        aiAssisted:          false,
        operatorLed:         true,
        contextNotes:        [
          `transfer_outcome: ${outcome}`,
          recipientName ? `recipient: ${recipientName}` : null,
        ].filter(Boolean).join("; ") || null,
        createdBy:           user.id,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("voice_interaction_ledger") as any).insert(ledgerRow);
    } catch (ledgerErr) {
      console.error("[inbound/transfer] ledger write failed (non-fatal):", ledgerErr);
    }

    const result: TransferResult = {
      ok:         true,
      event_id,
      outcome,
      event_type: eventType,
      task_id:    taskId,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[dialer/v1/inbound/transfer] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── GET: fetch transfer state for an inbound event ────────────────────────────
// Lightweight read — returns the most recent transfer event for this inbound event.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ event_id: string }> }
) {
  try {
    const user = await getDialerUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_id } = await params;
    const sb = createDialerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: transferEvent } = await (sb.from("dialer_events") as any)
      .select("id, event_type, task_id, metadata, created_at")
      .in("event_type", ["transfer.connected", "transfer.failed_fallback"])
      .filter("metadata->original_event_id", "eq", event_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!transferEvent) {
      return NextResponse.json({ transfer: null });
    }

    return NextResponse.json({
      transfer: {
        event_type:      transferEvent.event_type,
        outcome:         transferEvent.metadata?.outcome ?? null,
        recipient_name:  transferEvent.metadata?.recipient_name ?? null,
        logged_at:       transferEvent.metadata?.logged_at ?? transferEvent.created_at,
        task_id:         transferEvent.task_id ?? null,
      },
    });
  } catch (err) {
    console.error("[dialer/v1/inbound/transfer] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
