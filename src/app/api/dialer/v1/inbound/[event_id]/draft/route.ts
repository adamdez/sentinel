/**
 * GET  /api/dialer/v1/inbound/[event_id]/draft
 * POST /api/dialer/v1/inbound/[event_id]/draft
 *
 * GET — returns the current pending writeback draft for an inbound event.
 *   Assembles the draft from the event chain (inbound.answered/missed +
 *   inbound.classified + inbound.outcome) or returns an existing saved draft
 *   from a prior inbound.draft_pending event.
 *
 * POST — saves/updates a pending draft (operator edits before commit).
 *   Writes an inbound.draft_pending event with the updated draft fields.
 *   Idempotent: replaces the prior draft_pending event for this inbound_event_id.
 *
 * BOUNDARY: reads dialer_events only. Writes dialer_events only.
 * Does NOT touch calls_log, leads, or any CRM-owned table.
 * Use POST .../commit to trigger durable CRM writes.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { buildDraftFromEvents } from "@/lib/dialer/inbound-writeback";
import type { InboundWritebackDraft } from "@/lib/dialer/types";
import { INBOUND_DISPOSITIONS } from "@/lib/dialer/types";

type RouteContext = { params: Promise<{ event_id: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await getDialerUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_id } = await params;
    const sb = createDialerClient();

    // Fetch all events in the inbound chain for this event_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: events, error: eventsErr } = await (sb.from("dialer_events") as any)
      .select("id, event_type, lead_id, metadata, created_at")
      .or(
        `id.eq.${event_id},` +
        `and(event_type.eq.inbound.classified,metadata->>original_event_id.eq.${event_id}),` +
        `and(event_type.eq.inbound.outcome,metadata->>original_event_id.eq.${event_id}),` +
        `and(event_type.eq.inbound.draft_pending,metadata->>inbound_event_id.eq.${event_id}),` +
        `and(event_type.eq.inbound.committed,metadata->>inbound_event_id.eq.${event_id})`
      )
      .order("created_at", { ascending: true });

    if (eventsErr) return NextResponse.json({ error: eventsErr.message }, { status: 500 });
    if (!events || events.length === 0) {
      return NextResponse.json({ error: "Inbound event not found" }, { status: 404 });
    }

    // Check if already committed
    const committedEvent = events.find((e: { event_type: string }) => e.event_type === "inbound.committed");
    if (committedEvent) {
      const draft: InboundWritebackDraft = {
        ...(committedEvent.metadata as Record<string, unknown>),
        inbound_event_id: event_id,
        committed:        true,
        calls_log_id:     (committedEvent.metadata?.calls_log_id as string) ?? null,
        saved_at:         committedEvent.created_at,
      } as InboundWritebackDraft;
      return NextResponse.json({ draft, committed: true });
    }

    // Use most recent saved draft if present
    const savedDraft = events
      .filter((e: { event_type: string }) => e.event_type === "inbound.draft_pending")
      .pop();

    if (savedDraft) {
      return NextResponse.json({
        draft: { ...savedDraft.metadata, committed: false } as InboundWritebackDraft,
        committed: false,
      });
    }

    // Build draft from the event chain
    // Normalize events for buildDraftFromEvents
    const normalizedEvents = (events as Array<{ id: string; event_type: string; lead_id: string | null; metadata: Record<string, unknown> }>).map((e) => ({
      event_type: e.event_type,
      metadata: {
        ...e.metadata,
        id:      e.id,
        lead_id: e.lead_id ?? e.metadata?.lead_id,
      },
    }));

    const builtDraft = buildDraftFromEvents(normalizedEvents);
    const draft: InboundWritebackDraft = {
      ...builtDraft,
      inbound_event_id: event_id,
      saved_at:         new Date().toISOString(),
      committed:        false,
      calls_log_id:     null,
    };

    return NextResponse.json({ draft, committed: false });
  } catch (err) {
    console.error("[inbound/draft] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await getDialerUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_id } = await params;
    const body = await req.json().catch(() => ({})) as Partial<InboundWritebackDraft>;

    // Validate disposition if provided
    if (body.disposition && !INBOUND_DISPOSITIONS.includes(body.disposition)) {
      return NextResponse.json(
        { error: `disposition must be one of: ${INBOUND_DISPOSITIONS.join(", ")}` },
        { status: 400 },
      );
    }

    const sb = createDialerClient();

    // Check not already committed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: committed } = await (sb.from("dialer_events") as any)
      .select("id")
      .eq("event_type", "inbound.committed")
      .contains("metadata", { inbound_event_id: event_id })
      .maybeSingle();

    if (committed) {
      return NextResponse.json({ error: "Already committed — cannot update draft" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const draftMeta: Record<string, unknown> = {
      inbound_event_id:  event_id,
      lead_id:           body.lead_id   ?? null,
      from_number:       body.from_number ?? null,
      caller_type:       body.caller_type ?? "unknown",
      subject_address:   body.subject_address ?? null,
      situation_summary: body.situation_summary ?? null,
      note_draft:        body.note_draft ?? null,
      disposition:       body.disposition ?? "seller_answered",
      callback_at:       body.callback_at ?? null,
      note_source:       body.note_source ?? "operator",
      update_lead_notes: body.update_lead_notes ?? false,
      committed:         false,
      calls_log_id:      null,
      saved_at:          now,
      saved_by:          user.id,
    };

    // Upsert: delete prior draft_pending for this inbound_event_id, then insert
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("dialer_events") as any)
      .delete()
      .eq("event_type", "inbound.draft_pending")
      .contains("metadata", { inbound_event_id: event_id });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await (sb.from("dialer_events") as any)
      .insert({
        event_type: "inbound.draft_pending",
        lead_id:    body.lead_id ?? null,
        session_id: null,
        task_id:    null,
        metadata:   draftMeta,
      });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, draft: { ...draftMeta } });
  } catch (err) {
    console.error("[inbound/draft] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
