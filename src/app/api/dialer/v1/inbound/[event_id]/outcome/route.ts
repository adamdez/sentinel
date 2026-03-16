/**
 * POST /api/dialer/v1/inbound/[event_id]/outcome
 *
 * Logs the outcome of a live inbound call.
 * Writes an inbound.outcome dialer_event referencing the original inbound.answered event.
 * Optionally creates a follow-up task (for follow_up / appointment outcomes).
 *
 * Body:
 *   {
 *     disposition: "answered" | "voicemail" | "wrong_number" | "callback_requested" | "appointment",
 *     notes?: string,           // optional free-text note
 *     callback_date?: string,   // ISO — for callback_requested / appointment
 *   }
 *
 * BOUNDARY: writes dialer_events + tasks only.
 * Does NOT write to calls_log, leads, or any CRM-owned table.
 * This keeps inbound outcome capture lightweight and boundary-safe.
 * If the operator wants to promote the call into the full CRM history,
 * that is a future enhancement using the existing publish path.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export type InboundDisposition =
  | "answered"           // talked to seller, no specific follow-up
  | "voicemail"          // left voicemail or got machine
  | "wrong_number"       // not the seller
  | "callback_requested" // seller asked us to call back later
  | "appointment";       // set an appointment

const VALID_DISPOSITIONS: InboundDisposition[] = [
  "answered", "voicemail", "wrong_number", "callback_requested", "appointment",
];

// Dispositions that create a follow-up task
const TASK_DISPOS = new Set<InboundDisposition>(["callback_requested", "appointment"]);

// ── nextBusinessMorningPacific (copy to avoid importing publish-manager) ──────
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ event_id: string }> }
) {
  try {
    const user = await getDialerUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_id } = await params;
    const body = await req.json().catch(() => ({}));

    const disposition: InboundDisposition = body.disposition;
    if (!VALID_DISPOSITIONS.includes(disposition)) {
      return NextResponse.json(
        { error: `disposition must be one of: ${VALID_DISPOSITIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const notes        = (body.notes        ?? "").trim() || null;
    const callbackDate = (body.callback_date ?? "").trim() || null;

    const sb = createDialerClient();

    // Fetch the original inbound event for lead_id + phone context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: original, error: fetchErr } = await (sb.from("dialer_events") as any)
      .select("id, lead_id, metadata")
      .eq("id", event_id)
      .in("event_type", ["inbound.answered", "inbound.missed"])
      .maybeSingle();

    if (fetchErr || !original) {
      return NextResponse.json(
        { error: "Inbound event not found" },
        { status: 404 }
      );
    }

    const leadId     = original.lead_id ?? null;
    const fromNumber = (original.metadata?.from_number as string) ?? null;

    // ── Optional task creation for callback / appointment ─────────────────
    let taskId: string | null = null;
    if (TASK_DISPOS.has(disposition) && leadId) {
      const dueAt = callbackDate ? new Date(callbackDate) : nextBusinessMorningPacific();
      const taskTitle = disposition === "appointment"
        ? `📅 Inbound appointment — ${fromNumber ?? "caller"}`
        : `📞 Inbound callback requested — ${fromNumber ?? "caller"}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: taskRow, error: taskErr } = await (sb.from("tasks") as any)
        .insert({
          title: taskTitle,
          lead_id: leadId,
          due_at: dueAt.toISOString(),
          status: "pending",
          priority: disposition === "appointment" ? 3 : 2,
          notes: notes ?? `Inbound call outcome: ${disposition}.`,
        })
        .select("id")
        .single();

      if (taskErr) {
        console.error("[inbound/outcome] Task creation failed:", taskErr.message);
      } else {
        taskId = taskRow?.id ?? null;
      }
    }

    // ── Write inbound.outcome event ───────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: eventErr } = await (sb.from("dialer_events") as any)
      .insert({
        event_type: "inbound.outcome",
        lead_id:    leadId,
        session_id: null,
        task_id:    taskId,
        metadata: {
          original_event_id: event_id,
          disposition,
          notes,
          callback_date:   callbackDate,
          from_number:     fromNumber,
          logged_by:       user.id,
          logged_at:       new Date().toISOString(),
        },
      });

    if (eventErr) {
      return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      event_id,
      disposition,
      task_created: !!taskId,
      task_id: taskId,
    });
  } catch (err) {
    console.error("[dialer/v1/inbound/outcome] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
