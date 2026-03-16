/**
 * GET /api/dialer/v1/qual-gaps
 *
 * Read-only review endpoint. Surfaces leads that had a live-answer call in the
 * last N days but still have qualification gaps — i.e., the operator talked
 * to the seller but didn't capture one or more key fields.
 *
 * Useful for Adam's weekly review: "Which leads did we talk to but still don't
 * have a timeline, condition, or decision-maker confirmation on?"
 *
 * Query params:
 *   days     — lookback window in days (default 30, max 90)
 *   limit    — max rows (default 20, max 50)
 *
 * Response shape:
 *   {
 *     summary:  { total_gaps: number, by_field: Record<QualItemKey, number> }
 *     leads:    QualGapLeadRow[]
 *   }
 *
 * BOUNDARY:
 *   - Reads: calls_log, leads, contacts, properties
 *   - Never writes
 *   - Auth via getDialerUser
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getQualGaps } from "@/lib/dialer/qual-checklist";
import type { QualCheckInput, QualItemKey } from "@/lib/dialer/qual-checklist";

// Dispositions that represent a live answer where we should have captured qual
const LIVE_DISPOS = ["completed", "follow_up", "appointment", "offer_made", "not_interested"];

export interface QualGapLeadRow {
  leadId:        string;
  address:       string | null;
  ownerName:     string | null;
  lastCallDate:  string;           // ISO
  disposition:   string;
  gapLabels:     string[];         // e.g. ["Decision-maker", "Timeline"]
  gapCount:      number;
  nextQuestion:  string | null;
}

export interface QualGapsSummary {
  total_live_calls:  number;
  leads_with_gaps:   number;
  by_field:          Partial<Record<QualItemKey, number>>;
}

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params  = req.nextUrl.searchParams;
  const days    = Math.min(90, Math.max(1, parseInt(params.get("days")  ?? "30", 10)));
  const limit   = Math.min(50, Math.max(1, parseInt(params.get("limit") ?? "20", 10)));
  const since   = new Date(Date.now() - days * 86_400_000).toISOString();

  const sb = createDialerClient();

  // ── 1. Recent live-answer calls ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callRows, error: callErr } = await (sb.from("calls_log") as any)
    .select("lead_id, disposition, started_at")
    .in("disposition", LIVE_DISPOS)
    .gte("started_at", since)
    .not("lead_id", "is", null)
    .order("started_at", { ascending: false });

  if (callErr) {
    console.error("[qual-gaps] calls_log query failed:", callErr.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!callRows || callRows.length === 0) {
    return NextResponse.json({
      summary: { total_live_calls: 0, leads_with_gaps: 0, by_field: {} },
      leads: [],
    });
  }

  // Deduplicate: one entry per lead (most recent call)
  const seenLeads = new Map<string, { disposition: string; started_at: string }>();
  for (const row of callRows as Array<{ lead_id: string; disposition: string; started_at: string }>) {
    if (!seenLeads.has(row.lead_id)) {
      seenLeads.set(row.lead_id, { disposition: row.disposition, started_at: row.started_at });
    }
  }

  const leadIds = Array.from(seenLeads.keys()).slice(0, 200); // guard

  // ── 2. Fetch lead qual fields ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadRows } = await (sb.from("leads") as any)
    .select(`
      id, property_id, contact_id,
      motivation_level, seller_timeline,
      condition_level, occupancy_score,
      decision_maker_confirmed
    `)
    .in("id", leadIds);

  if (!leadRows || leadRows.length === 0) {
    return NextResponse.json({
      summary: { total_live_calls: seenLeads.size, leads_with_gaps: 0, by_field: {} },
      leads: [],
    });
  }

  // ── 3. Fetch addresses + names (bulk) ─────────────────────────────────────
  const propertyIds = [...new Set(
    (leadRows as Array<{ property_id: string | null }>)
      .map((l) => l.property_id).filter(Boolean) as string[]
  )];
  const contactIds = [...new Set(
    (leadRows as Array<{ contact_id: string | null }>)
      .map((l) => l.contact_id).filter(Boolean) as string[]
  )];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propRows } = propertyIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (sb.from("properties") as any)
        .select("id, street_address, city, state")
        .in("id", propertyIds)
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contactRows } = contactIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (sb.from("contacts") as any)
        .select("id, first_name, last_name")
        .in("id", contactIds)
    : { data: [] };

  type PropRow    = { id: string; street_address: string | null; city: string | null; state: string | null };
  type ContactRow = { id: string; first_name: string | null; last_name: string | null };

  const propMap    = new Map<string, PropRow>((propRows    ?? []).map((p: PropRow)    => [p.id, p]));
  const contactMap = new Map<string, ContactRow>((contactRows ?? []).map((c: ContactRow) => [c.id, c]));

  // ── 4. Compute gaps ────────────────────────────────────────────────────────
  type LeadRow = {
    id: string;
    property_id: string | null;
    contact_id:  string | null;
    motivation_level:         number | null;
    seller_timeline:          string | null;
    condition_level:          number | null;
    occupancy_score:          number | null;
    decision_maker_confirmed: boolean;
  };

  const fieldCounts: Partial<Record<QualItemKey, number>> = {};
  const resultRows: QualGapLeadRow[] = [];

  for (const lead of (leadRows as LeadRow[])) {
    const call    = seenLeads.get(lead.id);
    if (!call) continue;

    const prop    = lead.property_id ? propMap.get(lead.property_id) : null;
    const contact = lead.contact_id  ? contactMap.get(lead.contact_id) : null;
    const address = prop
      ? [prop.street_address, prop.city, prop.state].filter(Boolean).join(", ") || null
      : null;
    const ownerName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null
      : null;

    const checkInput: QualCheckInput = {
      address,
      decisionMakerConfirmed: lead.decision_maker_confirmed ?? false,
      sellerTimeline:         lead.seller_timeline ?? null,
      conditionLevel:         lead.condition_level ?? null,
      occupancyScore:         lead.occupancy_score ?? null,
      motivationLevel:        lead.motivation_level ?? null,
      hasOpenTask:            false, // not queried here — task column not needed for review
    };

    const gaps = getQualGaps(checkInput);
    if (gaps.length === 0) continue; // fully qualified

    // Tally by field
    for (const gap of gaps) {
      fieldCounts[gap.key] = (fieldCounts[gap.key] ?? 0) + 1;
    }

    resultRows.push({
      leadId:       lead.id,
      address,
      ownerName,
      lastCallDate: call.started_at,
      disposition:  call.disposition,
      gapLabels:    gaps.map((g) => g.label),
      gapCount:     gaps.length,
      nextQuestion: gaps[0].question,
    });
  }

  // Sort by gap count desc, then by recency
  resultRows.sort((a, b) =>
    b.gapCount !== a.gapCount
      ? b.gapCount - a.gapCount
      : new Date(b.lastCallDate).getTime() - new Date(a.lastCallDate).getTime()
  );

  return NextResponse.json({
    summary: {
      total_live_calls:  seenLeads.size,
      leads_with_gaps:   resultRows.length,
      by_field:          fieldCounts,
    },
    leads: resultRows.slice(0, limit),
  });
}
