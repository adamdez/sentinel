/**
 * POST /api/dialer/v1/inbound/[event_id]/classify
 *
 * Classifies an inbound caller and captures structured intake.
 * Writes an inbound.classified dialer_event referencing the original inbound event.
 * Creates downstream tasks / signals based on caller_type.
 *
 * Body:
 *   {
 *     caller_type: "seller" | "buyer" | "vendor" | "spam" | "unknown",
 *
 *     // Seller-specific intake (all optional but encouraged for sellers):
 *     subject_address?: string,       // property address they're calling about
 *     situation_summary?: string,     // 1–2 sentence situation summary
 *     preferred_callback?: string,    // ISO datetime or freeform "Tues morning"
 *     warm_transfer_ready?: boolean,  // true = seller open to immediate warm transfer
 *
 *     // All types:
 *     notes?: string,                 // any free-text operator note
 *   }
 *
 * Routing actions by caller_type:
 *   seller   → callback task (if preferred_callback set) or warm-transfer task
 *   buyer    → buyer follow-up task (linked to buyer if matched)
 *   vendor   → closed with explicit disposition, no task
 *   spam     → closed with spam flag, no task
 *   unknown  → clarification-needed follow-up task
 *
 * BOUNDARY: writes dialer_events + tasks only.
 * Does NOT write to leads, contacts, buyers, or any CRM-owned table.
 * Does NOT touch publish-manager.ts or crm-bridge.ts.
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getActiveHandoffRule, getActiveScript, type HandoffRuleConfig } from "@/lib/voice-registry";
import { buildLedgerEntry, callerTypeToInteractionType } from "@/lib/voice-consent";

// ── Shared types (exported for UI use) ───────────────────────────────────────

export type InboundCallerType = "seller" | "buyer" | "vendor" | "spam" | "unknown";

const CALLER_TYPES: InboundCallerType[] = [
  "seller", "buyer", "vendor", "spam", "unknown",
];

export interface SellerIntake {
  subject_address?:    string | null;
  situation_summary?:  string | null;
  preferred_callback?: string | null;
  warm_transfer_ready?: boolean;
}

export interface ClassifyBody extends SellerIntake {
  caller_type: InboundCallerType;
  notes?:      string | null;
}

export interface ClassifyResult {
  ok:              true;
  event_id:        string;
  caller_type:     InboundCallerType;
  routing_action:  string;
  task_id:         string | null;
  handoff_warnings?: string[];
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
    const body: ClassifyBody = await req.json().catch(() => ({}));

    const callerType = body.caller_type;
    if (!CALLER_TYPES.includes(callerType)) {
      return NextResponse.json(
        { error: `caller_type must be one of: ${CALLER_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const sb = createDialerClient();

    // Resolve active voice registry versions for traceability — best-effort, never blocks routing
    const [handoffRule, classifyScript] = await Promise.all([
      getActiveHandoffRule().catch(() => ({ version: "unknown", rule_config: null })),
      getActiveScript("seller_qualifying").catch(() => null),
    ]);
    const handoffRuleVersion   = handoffRule.version;
    const classifyScriptVersion = classifyScript?.version ?? "unknown";

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

    // ── Routing: determine action + optional task creation ───────────────────
    let taskId:        string | null = null;
    let routingAction: string        = "classified";

    // Resolve handoff rules for enforcement (not just traceability)
    const rules: Partial<HandoffRuleConfig> = handoffRule.rule_config ?? {};
    const handoffWarnings: string[] = [];

    if (callerType === "seller") {
      const warmTransferReady = !!body.warm_transfer_ready;

      // Handoff rule enforcement — may downgrade warm_transfer_flagged to seller_follow_up
      let warmTransferBlocked = false;

      if (warmTransferReady) {
        if (rules.require_subject_address_for_transfer && !body.subject_address?.trim()) {
          warmTransferBlocked = true;
          handoffWarnings.push("subject_address required for warm transfer (handoff rule)");
        }
        if (rules.defer_to_logan_if_lead_unknown && !leadId) {
          warmTransferBlocked = true;
          handoffWarnings.push("lead not matched — deferring to manual follow-up (handoff rule)");
        }
      }

      if (warmTransferReady && !warmTransferBlocked) {
        routingAction = "warm_transfer_flagged";
        if (leadId) {
          const subjectAddr = body.subject_address?.trim() || null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: t } = await (sb.from("tasks") as any)
            .insert({
              title: `🔥 Warm transfer ready — ${subjectAddr ?? fromNumber ?? "inbound seller"}`,
              lead_id: leadId,
              due_at: new Date().toISOString(),
              status: "pending",
              priority: 4,
              notes: buildTaskNotes({ body, fromNumber, routingAction: "warm_transfer_flagged" }),
            })
            .select("id").single();
          taskId = t?.id ?? null;
        }
      } else if (warmTransferReady && warmTransferBlocked) {
        // Downgrade to seller_follow_up with visible handoff warnings
        routingAction = "seller_follow_up_handoff_blocked";
        if (leadId) {
          const dueAt = nextBusinessMorningPacific();
          const subjectAddr = body.subject_address?.trim() || null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: t } = await (sb.from("tasks") as any)
            .insert({
              title: `📋 Warm transfer blocked — follow up ${subjectAddr ?? fromNumber ?? "caller"}`,
              lead_id: leadId,
              due_at: dueAt.toISOString(),
              status: "pending",
              priority: 3,
              notes: [
                buildTaskNotes({ body, fromNumber, routingAction: "seller_follow_up_handoff_blocked" }),
                `Handoff blocked: ${handoffWarnings.join("; ")}`,
              ].join(" "),
            })
            .select("id").single();
          taskId = t?.id ?? null;
        }
      } else if (body.preferred_callback) {
        // Callback booking
        routingAction = "callback_booked";
        if (leadId) {
          const dueAt = parseCallbackDate(body.preferred_callback);
          const subjectAddr = body.subject_address?.trim() || null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: t } = await (sb.from("tasks") as any)
            .insert({
              title: `📞 Inbound seller callback — ${subjectAddr ?? fromNumber ?? "caller"}`,
              lead_id: leadId,
              due_at: dueAt.toISOString(),
              status: "pending",
              priority: 3,
              notes: buildTaskNotes({ body, fromNumber, routingAction: "callback_booked" }),
            })
            .select("id").single();
          taskId = t?.id ?? null;
        }
      } else {
        // Seller talked but no specific next step scheduled — create a follow-up
        routingAction = "seller_follow_up";
        if (leadId) {
          const dueAt = nextBusinessMorningPacific();
          const subjectAddr = body.subject_address?.trim() || null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: t } = await (sb.from("tasks") as any)
            .insert({
              title: `📋 Inbound seller — follow up ${subjectAddr ?? fromNumber ?? "caller"}`,
              lead_id: leadId,
              due_at: dueAt.toISOString(),
              status: "pending",
              priority: 2,
              notes: buildTaskNotes({ body, fromNumber, routingAction: "seller_follow_up" }),
            })
            .select("id").single();
          taskId = t?.id ?? null;
        }
      }

    } else if (callerType === "buyer") {
      routingAction = "buyer_follow_up";
      // Buyer-path: create a follow-up task. We don't auto-match to buyers table here
      // (that would require a CRM write path — deferred). Just tag and task.
      if (leadId) {
        const dueAt = nextBusinessMorningPacific();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: t } = await (sb.from("tasks") as any)
          .insert({
            title: `🏠 Inbound buyer — follow up ${fromNumber ?? "caller"}`,
            lead_id: leadId,
            due_at: dueAt.toISOString(),
            status: "pending",
            priority: 2,
            notes: body.notes?.trim() ?? `Inbound buyer call. From: ${fromNumber}.`,
          })
          .select("id").single();
        taskId = t?.id ?? null;
      }

    } else if (callerType === "vendor") {
      routingAction = "vendor_closed";
      // No task — just log and close

    } else if (callerType === "spam") {
      routingAction = "spam_closed";
      // No task — just log and close

    } else {
      // unknown
      routingAction = "clarification_needed";
      const dueAt = nextBusinessMorningPacific();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: t } = await (sb.from("tasks") as any)
        .insert({
          title: `❓ Inbound unknown caller — clarify ${fromNumber ?? "caller"}`,
          lead_id: leadId,
          due_at: dueAt.toISOString(),
          status: "pending",
          priority: 1,
          notes: body.notes?.trim() ?? `Unknown inbound caller. From: ${fromNumber}. Clarification needed.`,
        })
        .select("id").single();
      taskId = t?.id ?? null;
    }

    // ── Write inbound.classified event ────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: eventErr } = await (sb.from("dialer_events") as any)
      .insert({
        event_type: "inbound.classified",
        lead_id:    leadId,
        session_id: null,
        task_id:    taskId,
        metadata: {
          original_event_id:       event_id,
          caller_type:             callerType,
          routing_action:          routingAction,
          subject_address:         body.subject_address?.trim() || null,
          situation_summary:       body.situation_summary?.trim() || null,
          preferred_callback:      body.preferred_callback?.trim() || null,
          warm_transfer_ready:     body.warm_transfer_ready ?? false,
          notes:                   body.notes?.trim() || null,
          from_number:             fromNumber,
          classified_by:           user.id,
          classified_at:           new Date().toISOString(),
          handoff_rule_version:    handoffRuleVersion,
          classify_script_version: classifyScriptVersion,
          handoff_warnings:        handoffWarnings.length > 0 ? handoffWarnings : undefined,
        },
      });

    if (eventErr) {
      return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }

    // ── Best-effort ledger write ───────────────────────────────────────────
    // Never fails the main response. Captures interaction type, consent basis,
    // automation tier, and risk tier for operational review.
    try {
      const interactionType = callerTypeToInteractionType(
        callerType,
        body.warm_transfer_ready ?? false,
      );
      const ledgerRow = buildLedgerEntry({
        eventId:             event_id,
        leadId:              leadId,
        interactionType,
        consentBasis:        "inbound_response",  // inbound calls = caller initiated
        automationTier:      "operator_led",       // classify is always operator-initiated
        scriptClass:         classifyScriptVersion !== "unknown"
          ? `seller_qualifying@${classifyScriptVersion}`
          : null,
        handoffRuleVersion:  handoffRuleVersion !== "unknown" ? handoffRuleVersion : null,
        dncFlag:             false,
        aiAssisted:          false,
        operatorLed:         true,
        contextNotes:        [
          `routing_action: ${routingAction}`,
          body.subject_address ? `address: ${body.subject_address.trim()}` : null,
        ].filter(Boolean).join("; ") || null,
        createdBy:           user.id,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("voice_interaction_ledger") as any).insert(ledgerRow);
    } catch (ledgerErr) {
      console.error("[inbound/classify] ledger write failed (non-fatal):", ledgerErr);
    }

    const result: ClassifyResult = {
      ok:             true,
      event_id,
      caller_type:    callerType,
      routing_action: routingAction,
      task_id:        taskId,
      ...(handoffWarnings.length > 0 ? { handoff_warnings: handoffWarnings } : {}),
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[dialer/v1/inbound/classify] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCallbackDate(raw: string): Date {
  // Try as ISO first
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  // Fall back to next business morning
  return nextBusinessMorningPacific();
}

function buildTaskNotes({
  body,
  fromNumber,
  routingAction,
}: {
  body: ClassifyBody;
  fromNumber: string | null;
  routingAction: string;
}): string {
  const parts: string[] = [];
  parts.push(`Inbound seller call. Routing: ${routingAction}.`);
  if (fromNumber)              parts.push(`Caller: ${fromNumber}.`);
  if (body.subject_address)    parts.push(`Address: ${body.subject_address.trim()}.`);
  if (body.situation_summary)  parts.push(`Situation: ${body.situation_summary.trim()}`);
  if (body.preferred_callback) parts.push(`Preferred callback: ${body.preferred_callback.trim()}.`);
  if (body.warm_transfer_ready) parts.push("Warm transfer: seller indicated readiness.");
  if (body.notes)              parts.push(body.notes.trim());
  return parts.join(" ");
}
