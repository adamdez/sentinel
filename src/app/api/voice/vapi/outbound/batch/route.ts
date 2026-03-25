/**
 * POST /api/voice/vapi/outbound/batch
 *
 * Queue a batch of leads for outbound calls via Jeff (Vapi).
 * Returns immediately with a batchId. Processing happens in the
 * background via Inngest (sequential calls with 3s delay).
 *
 * Request: { leadIds: string[] }
 * Response: { batchId: string, queued: number, skipped: Array<{ leadId, reason }> }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDialerUser, createDialerClient } from "@/lib/dialer/db";
import { isDnc } from "@/lib/dnc-check";
import { inngest } from "@/inngest/client";

const MAX_BATCH_SIZE = 10;

export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { leadIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { leadIds } = body;
  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds array is required" }, { status: 400 });
  }

  if (leadIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BATCH_SIZE} leads per batch` },
      { status: 400 },
    );
  }

  const sb = createDialerClient();

  // ── Fetch leads + DNC filter ──────────────────────────────────────────
  // Fetch leads with primary phone from lead_phones and owner name from properties
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select(`
      id,
      properties ( owner_name, address ),
      lead_phones ( phone, is_primary, position )
    `)
    .in("id", leadIds);

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: "No matching leads found" }, { status: 404 });
  }

  const validLeads: Array<{ id: string; phone: string; name: string }> = [];
  const skipped: Array<{ leadId: string; reason: string }> = [];

  for (const lead of leads) {
    // Pick the best phone: primary first, then lowest position
    const phones = (lead.lead_phones as Array<{ phone: string; is_primary: boolean; position: number }>) ?? [];
    const sorted = [...phones].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return (a.position ?? 999) - (b.position ?? 999);
    });
    const bestPhone = sorted[0]?.phone;
    const ownerName = (lead.properties as Record<string, unknown>)?.owner_name as string || "Unknown";

    if (!bestPhone) {
      skipped.push({ leadId: lead.id, reason: "No phone number" });
      continue;
    }

    try {
      const dncResult = await isDnc(bestPhone);
      if (dncResult.isDnc) {
        skipped.push({ leadId: lead.id, reason: `DNC: ${dncResult.reason}` });
        continue;
      }
    } catch {
      // DNC check failed — proceed with caution
    }

    validLeads.push({
      id: lead.id,
      phone: bestPhone,
      name: ownerName,
    });
  }

  // Track leads not found in DB
  const foundIds = new Set(leads.map((l: Record<string, unknown>) => l.id));
  for (const id of leadIds) {
    if (!foundIds.has(id)) {
      skipped.push({ leadId: id, reason: "Lead not found" });
    }
  }

  if (validLeads.length === 0) {
    return NextResponse.json({
      batchId: null,
      queued: 0,
      skipped,
      error: "No valid leads to call after DNC filtering",
    });
  }

  // ── Build site URL for Inngest function ───────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  // ── Queue Inngest job ─────────────────────────────────────────────────
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await inngest.send({
    name: "voice/outbound-batch.requested",
    data: {
      batchId,
      leads: validLeads,
      initiatedBy: user.id,
      siteUrl,
    },
  });

  console.log("[outbound/batch] Batch queued:", {
    batchId,
    queued: validLeads.length,
    skipped: skipped.length,
    initiatedBy: user.id,
  });

  return NextResponse.json({
    batchId,
    queued: validLeads.length,
    skipped,
  });
}
