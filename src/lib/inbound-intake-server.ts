import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { findDuplicateCandidate, requireImportUser, updateExistingRecordFromImport } from "@/lib/imports-server";
import { inboundCandidateToRecord, withDuplicateStatus, type NormalizedInboundCandidate } from "@/lib/inbound-intake";
import { notifyNewInboundLead, notifyIntakeLeadArrived } from "@/lib/notify";
import { trackedDelivery } from "@/lib/delivery-tracker";

type SupabaseLike = ReturnType<typeof createServerClient>;

/**
 * Map source_vendor to intake_provider name for provider categorization.
 * Used when writing to intake_leads table.
 */
function mapSourceVendorToProvider(sourceVendor: string | null | undefined): string | null {
  if (!sourceVendor) return null;

  const vendorMap: Record<string, string> = {
    "lead_house": "Lead House",
    "leadhouse": "Lead House",
    "ppl_partner_a": "PPL Partner A",
    "ppl_partner_b": "Other PPL",
    "gmail": "Gmail Intake",
    "website": "Website Form",
    "webform": "Website Form",
  };

  return vendorMap[sourceVendor.toLowerCase()] ?? null;
}

export async function authorizeInboundRequest(req: NextRequest, sb: SupabaseLike) {
  const user = await requireImportUser(req.headers.get("authorization"), sb);
  if (user) return { userId: user.id, mode: "user" as const };

  const intakeSecret = process.env.INBOUND_INTAKE_SECRET;
  const secretHeader = req.headers.get("x-intake-secret");
  if (intakeSecret && secretHeader === intakeSecret) {
    return { userId: null, mode: "external" as const };
  }

  return null;
}

/**
 * Process an inbound candidate into the intake queue (pending review).
 * Writes to intake_leads table instead of creating leads directly.
 * This implements the approval gate: leads must be "claimed" by an operator.
 */
export async function processInboundCandidateToIntakeQueue(args: {
  sb: SupabaseLike;
  candidate: NormalizedInboundCandidate;
  actorId: string | null;
}) {
  const { sb, candidate, actorId } = args;

  // Find duplicate leads if any
  const duplicateCache = new Map<string, Awaited<ReturnType<typeof findDuplicateCandidate>>>();
  const record = inboundCandidateToRecord(candidate);
  const duplicate = await findDuplicateCandidate(sb, record, duplicateCache);

  // Map source vendor to provider name
  const sourceCategory = mapSourceVendorToProvider(candidate.sourceVendor) || candidate.sourceChannel;

  // Insert into intake_leads table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedIntakeLead, error: insertError } = await (sb.from("intake_leads") as any)
    .insert({
      raw_payload: candidate.rawPayload,
      source_channel: candidate.sourceChannel,
      source_vendor: candidate.sourceVendor,
      source_category: sourceCategory,
      intake_method: candidate.intakeMethod,
      owner_name: candidate.ownerName,
      owner_phone: candidate.phone,
      owner_email: candidate.email,
      property_address: candidate.propertyAddress,
      property_city: candidate.propertyCity,
      property_state: candidate.propertyState,
      property_zip: candidate.propertyZip,
      county: candidate.county,
      apn: candidate.apn,
      status: "pending_review",
      duplicate_of_lead_id: duplicate.leadId || null,
      duplicate_confidence: duplicate.level === "high" ? 90 : duplicate.level === "possible" ? 60 : null,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[Inbound Intake Queue] Failed to insert:", insertError);
    return {
      intakeLeadId: null,
      status: "failed",
      error: insertError.message,
    };
  }

  const intakeLeadId = insertedIntakeLead?.id;

  // Log the intake event (non-fatal — don't let event_log failure block the intake)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try {
    await (sb.from("event_log") as any).insert({
      user_id: actorId,
      action: "intake.queued",
      entity_type: "intake_lead",
      entity_id: intakeLeadId,
      details: {
        intake_lead_id: intakeLeadId,
        source_channel: candidate.sourceChannel,
        source_vendor: candidate.sourceVendor,
        source_category: sourceCategory,
        intake_method: candidate.intakeMethod,
        duplicate_status: duplicate.level,
        duplicate_of_lead_id: duplicate.leadId || null,
        owner_name: candidate.ownerName,
        phone: candidate.phone,
        email: candidate.email,
        county: candidate.county,
        property_address: candidate.propertyAddress,
      },
    });
  } catch { /* non-fatal */ }

  // Send SMS alert to Logan + Adam for every intake lead — speed-to-lead matters
  notifyIntakeLeadArrived({
    ownerName: candidate.ownerName,
    phone: candidate.phone,
    propertyAddress: candidate.propertyAddress,
    sourceProvider: sourceCategory,
    intakeLeadId: intakeLeadId || "",
    receivedAt: candidate.receivedAt,
  }).catch(() => {});

  return {
    intakeLeadId,
    status: "queued",
    sourceCategory,
    duplicateStatus: duplicate.level,
    duplicateOfLeadId: duplicate.leadId || null,
  };
}

export async function processInboundCandidate(args: {
  req: NextRequest;
  sb: SupabaseLike;
  authHeader: string | null;
  actorId: string | null;
  candidate: NormalizedInboundCandidate;
  duplicateStrategy?: "skip" | "update_missing";
}) {
  const { req, sb, authHeader, actorId, duplicateStrategy = "update_missing" } = args;
  const duplicateCache = new Map<string, Awaited<ReturnType<typeof findDuplicateCandidate>>>();
  const record = inboundCandidateToRecord(args.candidate);
  const duplicate = await findDuplicateCandidate(sb, record, duplicateCache);
  const candidate = withDuplicateStatus(args.candidate, duplicate);
  const intakeId = `inbound_${randomUUID()}`;

  let leadId: string | null = null;
  let resolved = false;
  let resolution: "created" | "held" | "updated_existing" = "held";

  if (duplicate.level === "high" && duplicateStrategy === "update_missing") {
    const updated = await updateExistingRecordFromImport({
      sb,
      duplicate,
      record: inboundCandidateToRecord(candidate),
      defaults: {
        sourceChannel: candidate.sourceChannel,
        sourceVendor: candidate.sourceVendor ?? "",
        sourceListName: candidate.sourceCampaign ?? "",
        sourcePullDate: candidate.receivedAt.slice(0, 10),
        nicheTag: "",
        importBatchId: "",
        templateId: "",
        skipTraceStatus: "not_started",
        outreachType: "cold_call",
      },
    });
    if (updated) {
      leadId = duplicate.leadId ?? null;
      resolved = true;
      resolution = "updated_existing";
    }
  }

  const shouldCreateLead =
    !resolved &&
    candidate.reviewStatus !== "possible_duplicate" &&
    candidate.reviewStatus !== "missing_property_address" &&
    candidate.reviewStatus !== "junk";

  if (shouldCreateLead) {
    const response = await fetch(new URL("/api/prospects", req.nextUrl.origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        owner_name: candidate.ownerName ?? "",
        owner_phone: candidate.phone,
        owner_email: candidate.email,
        address: candidate.propertyAddress ?? "",
        city: candidate.propertyCity ?? "",
        state: candidate.propertyState ?? "WA",
        zip: candidate.propertyZip ?? "",
        mailing_address: candidate.mailingAddress,
        mailing_city: candidate.mailingCity,
        mailing_state: candidate.mailingState,
        mailing_zip: candidate.mailingZip,
        county: candidate.county ?? "",
        apn: candidate.apn ?? "",
        notes: candidate.notes,
        source: candidate.sourceChannel,
        source_channel: candidate.sourceChannel,
        source_vendor: candidate.sourceVendor,
        source_list_name: candidate.sourceCampaign,
        source_campaign: candidate.sourceCampaign,
        intake_method: candidate.intakeMethod,
        raw_source_ref: candidate.rawSourceRef,
        duplicate_status: candidate.duplicate.level,
        received_at: candidate.receivedAt,
        outbound_status: candidate.reviewStatus,
        skip_trace_status: "not_started",
        gclid: candidate.gclid,
        landing_page: candidate.landingPage,
        source_metadata: {
          raw_payload: candidate.rawPayload,
          warnings: [...candidate.warnings, ...candidate.duplicate.reasons],
          confidence: candidate.confidence,
          source_campaign: candidate.sourceCampaign,
          intake_method: candidate.intakeMethod,
          raw_source_ref: candidate.rawSourceRef,
        },
        actor_id: actorId,
      }),
      cache: "no-store",
    });
    const data = await response.json();
    if (response.ok && data?.success) {
      leadId = data.lead_id as string;
      resolved = true;
      resolution = "created";

      // Speed-to-lead: instant SMS alert to Logan (tracked delivery)
      trackedDelivery(
        { channel: "sms", eventType: "new_inbound_lead", entityType: "lead", entityId: leadId ?? undefined },
        () => notifyNewInboundLead({
          channel: candidate.sourceChannel,
          ownerName: candidate.ownerName,
          phone: candidate.phone,
          propertyAddress: candidate.propertyAddress,
          source: candidate.sourceVendor ?? candidate.sourceChannel,
          leadId: leadId!,
          receivedAt: candidate.receivedAt,
        })
      );

      // n8n outbound webhook (fire-and-forget)
      import("@/lib/n8n-dispatch").then(({ n8nInboundLeadReceived }) => {
        n8nInboundLeadReceived({
          leadId: leadId ?? "",
          source: candidate.sourceVendor ?? candidate.sourceChannel,
          channel: candidate.sourceChannel,
          ownerName: candidate.ownerName,
          phone: candidate.phone,
          address: candidate.propertyAddress,
        }).catch(() => {});
      }).catch(() => {});
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: actorId,
    action: "inbound.received",
    entity_type: "inbound_intake_item",
    entity_id: intakeId,
    details: {
      lead_id: leadId,
      resolution,
      source_channel: candidate.sourceChannel,
      source_vendor: candidate.sourceVendor,
      source_campaign: candidate.sourceCampaign,
      intake_method: candidate.intakeMethod,
      raw_source_ref: candidate.rawSourceRef,
      duplicate_status: candidate.duplicate.level,
      received_at: candidate.receivedAt,
      review_status: candidate.reviewStatus,
      warnings: candidate.warnings,
      confidence: candidate.confidence,
      owner_name: candidate.ownerName,
      property_address: candidate.propertyAddress,
      phone: candidate.phone,
      email: candidate.email,
      county: candidate.county,
      raw_payload: candidate.rawPayload,
      duplicate_reasons: candidate.duplicate.reasons,
    },
  });

  return {
    intakeId,
    leadId,
    resolved,
    resolution,
    reviewStatus: candidate.reviewStatus,
    duplicateStatus: candidate.duplicate.level,
  };
}
