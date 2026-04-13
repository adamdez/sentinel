import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  appendOfferEventLog,
  applyOfferTerminalStatus,
  syncOfferStatusSnapshot,
} from "@/lib/offer-manager";

export const runtime = "nodejs";

function matchesConnectKey(req: NextRequest) {
  const expected = process.env.DOCUSIGN_CONNECT_KEY?.trim();
  if (!expected) return true;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const authHeader = req.headers.get("x-docusign-authentication")?.trim();
  const connectHeader = req.headers.get("x-docusign-connect-key")?.trim();

  return bearer === expected || authHeader === expected || connectHeader === expected;
}

function extractEnvelopePayload(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const summary =
    (root.data && typeof root.data === "object" && (root.data as Record<string, unknown>).envelopeSummary && typeof (root.data as Record<string, unknown>).envelopeSummary === "object"
      ? (root.data as Record<string, unknown>).envelopeSummary as Record<string, unknown>
      : root.envelopeSummary && typeof root.envelopeSummary === "object"
        ? root.envelopeSummary as Record<string, unknown>
        : root);

  const envelopeId = String(summary.envelopeId ?? summary.envelope_id ?? "").trim();
  const status = String(summary.status ?? summary.envelopeStatus ?? summary.envelope_status ?? "").trim().toLowerCase();
  if (!envelopeId || !status) return null;
  return { envelopeId, status, raw: root };
}

function mapDocusignStatus(status: string) {
  switch (status) {
    case "sent":
      return { providerStatus: "sent", snapshotStatus: "offer_sent" as const };
    case "delivered":
      return { providerStatus: "delivered", snapshotStatus: "seller_reviewing" as const };
    case "completed":
      return { providerStatus: "completed", terminalStatus: "accepted" as const, snapshotStatus: "accepted" as const };
    case "declined":
      return { providerStatus: "declined", terminalStatus: "rejected" as const, snapshotStatus: "passed_not_moving_forward" as const };
    case "voided":
      return { providerStatus: "voided", terminalStatus: "withdrawn" as const, snapshotStatus: "passed_not_moving_forward" as const };
    case "created":
    case "draft":
      return { providerStatus: "created" };
    default:
      return { providerStatus: status };
  }
}

export async function POST(req: NextRequest) {
  if (!matchesConnectKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid webhook body" }, { status: 400 });
  }

  const payload = extractEnvelopePayload(body);
  if (!payload) {
    return NextResponse.json({ error: "Missing envelope payload" }, { status: 400 });
  }

  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: execution, error: executionError } = await (sb.from("offer_executions") as any)
    .select("*, offers(*, deals(id, lead_id, property_id))")
    .eq("envelope_id", payload.envelopeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (executionError || !execution) {
    return NextResponse.json({ error: "Offer execution not found" }, { status: 404 });
  }

  const statusMapping = mapDocusignStatus(payload.status);
  const timestamp = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (sb.from("offer_executions") as any)
    .update({
      provider_status: statusMapping.providerStatus,
      sent_at: statusMapping.providerStatus === "sent" ? timestamp : execution.sent_at ?? null,
      completed_at: statusMapping.providerStatus === "completed" ? timestamp : execution.completed_at ?? null,
      voided_at: statusMapping.providerStatus === "voided" ? timestamp : execution.voided_at ?? null,
      last_provider_payload: payload.raw,
      updated_at: timestamp,
    })
    .eq("id", execution.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (statusMapping.terminalStatus) {
    await applyOfferTerminalStatus(sb, {
      offerId: execution.offer_id,
      status: statusMapping.terminalStatus,
      response: payload.status,
    });
  }

  if (statusMapping.snapshotStatus && execution.offers?.deals?.property_id) {
    await syncOfferStatusSnapshot(sb, {
      propertyId: execution.offers.deals.property_id,
      amount: execution.offers.amount ?? null,
      status: statusMapping.snapshotStatus,
      updatedBy: "DocuSign webhook",
      sellerResponseNote: payload.status,
    });
  }

  try {
    await appendOfferEventLog(sb, {
      userId: process.env.ESCALATION_TARGET_USER_ID ?? null,
      action: `offer.docusign_${statusMapping.providerStatus}`,
      entityType: "deal",
      entityId: execution.offers?.deal_id ?? execution.offer_id,
      details: {
        offer_id: execution.offer_id,
        envelope_id: payload.envelopeId,
        provider_status: statusMapping.providerStatus,
      },
    });
  } catch (error) {
    console.error("[webhooks/docusign] event log failed:", error);
  }

  return NextResponse.json({ ok: true });
}
