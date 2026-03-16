/**
 * POST /api/dialer/v1/inbound/[event_id]/commit
 *
 * Commits an operator-approved inbound writeback draft to CRM tables.
 * This is the durable write endpoint — it calls commitInboundWriteback()
 * from the contract library after validating the input.
 *
 * Preconditions:
 *   - event_id must reference an existing inbound.answered or inbound.missed event
 *   - The draft must not already be committed (idempotent guard in commitInboundWriteback)
 *   - Operator must be authenticated
 *
 * Body:
 *   {
 *     caller_type:        "seller" | "buyer" | "vendor" | "spam" | "unknown"
 *     disposition:        InboundDisposition
 *     note_draft?:        string        // approved note text for calls_log.notes
 *     subject_address?:   string
 *     situation_summary?: string
 *     callback_at?:       string        // ISO datetime
 *     update_lead_notes?: boolean       // explicit opt-in to write note_draft to leads.notes
 *     note_source?:       "operator" | "ai_draft"
 *   }
 *
 * Returns:
 *   { ok, calls_log_id, lead_notes_updated }
 *
 * CRM writes (only what is approved):
 *   1. calls_log INSERT  — always (one row per committed inbound call)
 *   2. leads.notes UPDATE — only when update_lead_notes = true AND lead_id is known
 *
 * BOUNDARY:
 *   - Reads: dialer_events (for event chain + lead_id/from_number)
 *   - Writes: calls_log, dialer_events (via commitInboundWriteback)
 *   - Conditionally writes: leads.notes (explicit operator approval only)
 *   - Never writes: leads qualification fields, contacts, buyers, call_sessions
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { commitInboundWriteback } from "@/lib/dialer/inbound-writeback";
import type { InboundWritebackInput, InboundCallerType, InboundDisposition } from "@/lib/dialer/types";
import { INBOUND_DISPOSITIONS } from "@/lib/dialer/types";

type RouteContext = { params: Promise<{ event_id: string }> };

const VALID_CALLER_TYPES: InboundCallerType[] = ["seller", "buyer", "vendor", "spam", "unknown"];

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await getDialerUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_id } = await params;
    const body = await req.json().catch(() => ({})) as Partial<InboundWritebackInput> & {
      note_draft?: string | null;
    };

    // ── Validation ────────────────────────────────────────────────────────────

    if (!body.caller_type || !VALID_CALLER_TYPES.includes(body.caller_type)) {
      return NextResponse.json(
        { error: `caller_type must be one of: ${VALID_CALLER_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    if (!body.disposition || !INBOUND_DISPOSITIONS.includes(body.disposition as InboundDisposition)) {
      return NextResponse.json(
        { error: `disposition must be one of: ${INBOUND_DISPOSITIONS.join(", ")}` },
        { status: 400 },
      );
    }

    // Enforce note length cap (prevent giant freeform blobs)
    const noteDraft = (body.note_draft ?? body.situation_summary ?? "").trim().slice(0, 1200) || null;

    const input: InboundWritebackInput = {
      caller_type:       body.caller_type,
      subject_address:   (body.subject_address ?? "").trim().slice(0, 500) || null,
      situation_summary: (body.situation_summary ?? "").trim().slice(0, 1200) || null,
      note_draft:        noteDraft,
      disposition:       body.disposition as InboundDisposition,
      callback_at:       body.callback_at ?? null,
      update_lead_notes: body.update_lead_notes === true,   // explicit boolean — no coercion
      note_source:       body.note_source ?? "operator",
    };

    // ── Fetch inbound event chain for lead_id and from_number ──────────────

    const sb = createDialerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: baseEvent, error: baseErr } = await (sb.from("dialer_events") as any)
      .select("id, lead_id, metadata")
      .eq("id", event_id)
      .in("event_type", ["inbound.answered", "inbound.missed"])
      .maybeSingle();

    if (baseErr || !baseEvent) {
      return NextResponse.json({ error: "Inbound event not found" }, { status: 404 });
    }

    const leadId     = (baseEvent.lead_id ?? baseEvent.metadata?.lead_id ?? null) as string | null;
    const fromNumber = (baseEvent.metadata?.from_number ?? null) as string | null;

    // ── Commit ─────────────────────────────────────────────────────────────

    const result = await commitInboundWriteback(
      sb,
      user.id,
      event_id,
      leadId,
      fromNumber,
      input,
    );

    if (!result.ok && result.error?.startsWith("Already committed")) {
      // Idempotent — return the existing result
      return NextResponse.json({
        ok:                  true,
        calls_log_id:        result.calls_log_id,
        lead_notes_updated:  false,
        already_committed:   true,
      });
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Commit failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok:                 true,
      calls_log_id:       result.calls_log_id,
      lead_notes_updated: result.lead_notes_updated,
    });
  } catch (err) {
    console.error("[inbound/commit] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
