import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { buildMakeOfferSupportCheck, type MakeOfferServerPayload } from "@/lib/make-offer";
import { createDocusignOfferDraft } from "@/lib/docusign";
import {
  appendOfferEventLog,
  createOfferRecord,
  ensureDealForLead,
  insertOfferExecution,
  syncOfferStatusSnapshot,
} from "@/lib/offer-manager";

export const runtime = "nodejs";

function parsePayload(body: unknown): MakeOfferServerPayload | null {
  if (!body || typeof body !== "object") return null;
  const input = body as Partial<MakeOfferServerPayload>;
  if (
    typeof input.leadId !== "string"
    || typeof input.purchasePrice !== "number"
    || typeof input.earnestMoney !== "number"
    || typeof input.closeDate !== "string"
    || typeof input.inspectionPeriodDays !== "number"
    || typeof input.expirationAt !== "string"
    || typeof input.buyerEntity !== "string"
    || typeof input.buyerSignerName !== "string"
    || !Array.isArray(input.sellerSigners)
  ) {
    return null;
  }

  return {
    leadId: input.leadId,
    purchasePrice: input.purchasePrice,
    earnestMoney: input.earnestMoney,
    closeDate: input.closeDate,
    inspectionPeriodDays: input.inspectionPeriodDays,
    expirationAt: input.expirationAt,
    buyerEntity: input.buyerEntity,
    buyerSignerName: input.buyerSignerName,
    buyerSignerTitle: typeof input.buyerSignerTitle === "string" ? input.buyerSignerTitle : null,
    titleCompany: typeof input.titleCompany === "string" ? input.titleCompany : null,
    sellerSigners: input.sellerSigners
      .filter((item): item is { name: string; email: string } => (
        !!item
        && typeof item === "object"
        && typeof (item as { name?: unknown }).name === "string"
        && typeof (item as { email?: unknown }).email === "string"
      ))
      .map((item) => ({
        name: item.name,
        email: item.email,
      })),
    notes: typeof input.notes === "string" ? input.notes : null,
  };
}

function inferOfferType(existingCount: number) {
  return existingCount > 0 ? "counter" : "initial";
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return NextResponse.json({ error: "Invalid make offer payload" }, { status: 400 });
  }

  if (payload.purchasePrice <= 0 || payload.earnestMoney < 0 || payload.inspectionPeriodDays < 0) {
    return NextResponse.json({ error: "Offer economics must be positive values" }, { status: 400 });
  }

  if (payload.sellerSigners.length === 0) {
    return NextResponse.json({ error: "At least one seller signer is required" }, { status: 400 });
  }

  if (
    payload.sellerSigners.some((signer) => signer.name.trim().length === 0 || signer.email.trim().length === 0)
    || payload.buyerEntity.trim().length === 0
    || payload.buyerSignerName.trim().length === 0
  ) {
    return NextResponse.json({ error: "Signer names, signer emails, and buyer entity are required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadError } = await (sb.from("leads") as any)
    .select("id, property_id, decision_maker_confirmed, qualification_route, status, tags, source, source_list_name")
    .eq("id", payload.leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: property, error: propertyError } = await (sb.from("properties") as any)
    .select("id, address, city, state, zip, apn, owner_name, owner_flags")
    .eq("id", lead.property_id)
    .single();

  if (propertyError || !property) {
    return NextResponse.json({ error: "Property not found for lead" }, { status: 404 });
  }

  const supportCheck = buildMakeOfferSupportCheck({
    state: property.state,
    decisionMakerConfirmed: lead.decision_maker_confirmed,
    tags: lead.tags,
    source: lead.source,
    sourceListName: lead.source_list_name,
    qualificationRoute: lead.qualification_route,
  });

  if (!supportCheck.supported) {
    return NextResponse.json({
      error: "This file is not supported for Make Offer yet",
      unsupported_reasons: supportCheck.reasons,
    }, { status: 422 });
  }

  const expirationAt = new Date(payload.expirationAt);
  if (Number.isNaN(expirationAt.getTime())) {
    return NextResponse.json({ error: "expirationAt must be a valid ISO datetime" }, { status: 400 });
  }

  let deal;
  try {
    deal = await ensureDealForLead(sb, { leadId: lead.id, propertyId: lead.property_id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not initialize deal" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: existingOfferCount, error: offerCountError } = await (sb.from("offers") as any)
    .select("id", { count: "exact", head: true })
    .eq("deal_id", deal.id);

  if (offerCountError) {
    return NextResponse.json({ error: offerCountError.message }, { status: 500 });
  }

  const offerId = randomUUID();
  const propertyCityStateZip = [property.city, property.state, property.zip].filter(Boolean).join(", ");
  const terms = JSON.stringify({
    close_date: payload.closeDate,
    earnest_money: payload.earnestMoney,
    inspection_period_days: payload.inspectionPeriodDays,
    expiration_at: payload.expirationAt,
    buyer_entity: payload.buyerEntity,
    buyer_signer_name: payload.buyerSignerName,
    buyer_signer_title: payload.buyerSignerTitle,
    title_company: payload.titleCompany,
    notes: payload.notes,
    seller_signers: payload.sellerSigners,
  });

  let docusignDraft;
  try {
    docusignDraft = await createDocusignOfferDraft({
      externalOfferId: offerId,
      leadId: lead.id,
      dealId: deal.id,
      propertyAddress: property.address,
      propertyCityStateZip,
      apn: property.apn,
      purchasePrice: payload.purchasePrice,
      earnestMoney: payload.earnestMoney,
      closeDate: payload.closeDate,
      inspectionPeriodDays: payload.inspectionPeriodDays,
      expirationAt: payload.expirationAt,
      buyerEntity: payload.buyerEntity,
      buyerSignerName: payload.buyerSignerName,
      buyerSignerTitle: payload.buyerSignerTitle,
      titleCompany: payload.titleCompany,
      sellerSigners: payload.sellerSigners,
      notes: payload.notes,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "DocuSign could not prepare this offer yet",
    }, { status: 503 });
  }

  let offer;
  let execution;
  const warnings: string[] = [];
  try {
    offer = await createOfferRecord(sb, {
      offerId,
      dealId: deal.id,
      offerType: inferOfferType(existingOfferCount ?? 0),
      amount: payload.purchasePrice,
      terms,
      expiresAt: payload.expirationAt,
      offeredBy: user.id,
    });
    execution = await insertOfferExecution(sb, {
      offerId,
      provider: docusignDraft.provider,
      templateKey: docusignDraft.templateKey,
      envelopeId: docusignDraft.envelopeId,
      senderViewUrl: docusignDraft.senderViewUrl,
      providerStatus: docusignDraft.providerStatus,
      lastProviderPayload: docusignDraft,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Sentinel could not save the offer records",
      envelope_id: docusignDraft.envelopeId,
    }, { status: 500 });
  }

  try {
    await syncOfferStatusSnapshot(sb, {
      propertyId: property.id,
      amount: payload.purchasePrice,
      status: "offer_sent",
      updatedBy: user.email ?? user.id,
      sellerResponseNote: payload.notes,
    });
  } catch (error) {
    console.error("[offers/prepare] snapshot sync failed:", error);
    warnings.push("offer_status_snapshot_sync_failed");
  }

  try {
    await appendOfferEventLog(sb, {
      userId: user.id,
      action: "offer.prepared",
      entityType: "deal",
      entityId: deal.id,
      details: {
        offer_id: offer.id,
        envelope_id: docusignDraft.envelopeId,
        provider: "docusign",
        template_key: docusignDraft.templateKey,
      },
    });
    await appendOfferEventLog(sb, {
      userId: user.id,
      action: "offer.docusign_review_launched",
      entityType: "deal",
      entityId: deal.id,
      details: {
        offer_id: offer.id,
        envelope_id: docusignDraft.envelopeId,
      },
    });
  } catch (error) {
    console.error("[offers/prepare] event log failed:", error);
    warnings.push("offer_event_log_failed");
  }

  return NextResponse.json({
    offer,
    execution,
    sender_view_url: docusignDraft.senderViewUrl,
    ...(warnings.length > 0 ? { warnings } : {}),
  }, { status: 201 });
}
