/**
 * GET /api/dialer/v1/qa/queue
 *
 * Returns recent calls with pending QA findings for Adam's review.
 * Groups findings by call_log_id — one row per call, with all pending findings
 * for that call attached.
 *
 * Query params:
 *   days    — lookback window (default 14, max 60)
 *   limit   — max calls to return (default 20, max 50)
 *   severity — filter by severity: "flag" | "warn" | "info" | "all" (default "all")
 *
 * Response:
 *   { calls: QaQueueRow[], summary: { pending: number, flagged: number } }
 *
 * BOUNDARY: reads call_qa_findings, calls_log, leads, contacts, properties.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export interface QaFindingItem {
  id:          string;
  check_type:  string;
  severity:    string;
  finding:     string;
  ai_derived:  boolean;
  status:      string;
}

export interface QaQueueRow {
  callLogId:    string;
  leadId:       string | null;
  address:      string | null;
  ownerName:    string | null;
  disposition:  string | null;
  callDate:     string;
  durationSec:  number | null;
  findings:     QaFindingItem[];
  flagCount:    number;
  warnCount:    number;
  pendingCount: number;
}

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params   = req.nextUrl.searchParams;
  const days     = Math.min(60, Math.max(1, parseInt(params.get("days")   ?? "14", 10)));
  const limit    = Math.min(50, Math.max(1, parseInt(params.get("limit")  ?? "20", 10)));
  const severity = params.get("severity") ?? "all";
  const since    = new Date(Date.now() - days * 86_400_000).toISOString();

  const sb = createDialerClient();

  // ── 1. Fetch pending findings within window ────────────────────────────────
  let query = (sb.from("call_qa_findings") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("id, call_log_id, check_type, severity, finding, ai_derived, status, created_at")
    .eq("status", "pending_review")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (severity !== "all" && ["flag", "warn", "info"].includes(severity)) {
    query = query.eq("severity", severity);
  }

  const { data: findingRows, error: findErr } = await query;
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  if (!findingRows || findingRows.length === 0) {
    return NextResponse.json({ calls: [], summary: { pending: 0, flagged: 0 } });
  }

  // Group findings by call_log_id
  type FindingRow = {
    id: string; call_log_id: string; check_type: string; severity: string;
    finding: string; ai_derived: boolean; status: string;
  };

  const findingsByCall = new Map<string, FindingRow[]>();
  for (const row of findingRows as FindingRow[]) {
    const arr = findingsByCall.get(row.call_log_id) ?? [];
    arr.push(row);
    findingsByCall.set(row.call_log_id, arr);
  }

  const callLogIds = Array.from(findingsByCall.keys()).slice(0, limit);

  // ── 2. Fetch call metadata ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callRows } = await (sb.from("calls_log") as any)
    .select("id, lead_id, disposition, duration_sec, started_at")
    .in("id", callLogIds);

  type CallRow = { id: string; lead_id: string | null; disposition: string | null; duration_sec: number | null; started_at: string };
  const callMap = new Map<string, CallRow>((callRows ?? []).map((c: CallRow) => [c.id, c]));

  // ── 3. Fetch lead / address / name (bulk) ─────────────────────────────────
  const leadIds = [...new Set(
    (callRows ?? []).map((c: CallRow) => c.lead_id).filter(Boolean) as string[]
  )];

  type LeadRow = { id: string; property_id: string | null; contact_id: string | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadRows } = leadIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (sb.from("leads") as any)
        .select("id, property_id, contact_id")
        .in("id", leadIds)
    : { data: [] };

  const leadMap = new Map<string, LeadRow>((leadRows ?? []).map((l: LeadRow) => [l.id, l]));

  const propIds = [...new Set(
    (leadRows ?? []).map((l: LeadRow) => l.property_id).filter(Boolean) as string[]
  )];
  const contactIds = [...new Set(
    (leadRows ?? []).map((l: LeadRow) => l.contact_id).filter(Boolean) as string[]
  )];

  type PropRow    = { id: string; street_address: string | null; city: string | null; state: string | null };
  type ContactRow = { id: string; first_name: string | null; last_name: string | null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propRows } = propIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (sb.from("properties") as any).select("id, street_address, city, state").in("id", propIds)
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contactRows } = contactIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (sb.from("contacts") as any).select("id, first_name, last_name").in("id", contactIds)
    : { data: [] };

  const propMap    = new Map<string, PropRow>((propRows    ?? []).map((p: PropRow)    => [p.id, p]));
  const contactMap = new Map<string, ContactRow>((contactRows ?? []).map((c: ContactRow) => [c.id, c]));

  // ── 4. Assemble result rows ────────────────────────────────────────────────
  const result: QaQueueRow[] = [];
  let totalPending = 0;
  let totalFlagged = 0;

  for (const callLogId of callLogIds) {
    const call     = callMap.get(callLogId);
    const findings = findingsByCall.get(callLogId) ?? [];
    if (!call) continue;

    const lead    = call.lead_id ? leadMap.get(call.lead_id)    : null;
    const prop    = lead?.property_id ? propMap.get(lead.property_id)       : null;
    const contact = lead?.contact_id  ? contactMap.get(lead.contact_id)     : null;

    const address = prop
      ? [prop.street_address, prop.city, prop.state].filter(Boolean).join(", ") || null
      : null;
    const ownerName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null
      : null;

    const pendingFindings = findings.filter((f) => f.status === "pending_review");
    const flagCount = pendingFindings.filter((f) => f.severity === "flag").length;
    const warnCount = pendingFindings.filter((f) => f.severity === "warn").length;

    totalPending += pendingFindings.length;
    totalFlagged += flagCount;

    result.push({
      callLogId,
      leadId:      call.lead_id ?? null,
      address,
      ownerName,
      disposition: call.disposition ?? null,
      callDate:    call.started_at,
      durationSec: call.duration_sec ?? null,
      findings:    pendingFindings.map((f) => ({
        id:         f.id,
        check_type: f.check_type,
        severity:   f.severity,
        finding:    f.finding,
        ai_derived: f.ai_derived,
        status:     f.status,
      })),
      flagCount,
      warnCount,
      pendingCount: pendingFindings.length,
    });
  }

  // Sort: most flags first, then most warns, then most recent
  result.sort((a, b) => {
    if (b.flagCount !== a.flagCount) return b.flagCount - a.flagCount;
    if (b.warnCount !== a.warnCount) return b.warnCount - a.warnCount;
    return new Date(b.callDate).getTime() - new Date(a.callDate).getTime();
  });

  return NextResponse.json({
    calls:   result,
    summary: { pending: totalPending, flagged: totalFlagged },
  });
}
