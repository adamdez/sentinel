import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { findDuplicateCandidate, requireImportUser, updateExistingRecordFromImport } from "@/lib/imports-server";
import { inboundCandidateToRecord, withDuplicateStatus, type NormalizedInboundCandidate } from "@/lib/inbound-intake";
import { notifyNewInboundLead } from "@/lib/notify";

type SupabaseLike = ReturnType<typeof createServerClient>;

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

      // Speed-to-lead: instant SMS alert to Logan (fire-and-forget)
      notifyNewInboundLead({
        channel: candidate.sourceChannel,
        ownerName: candidate.ownerName,
        phone: candidate.phone,
        propertyAddress: candidate.propertyAddress,
        source: candidate.sourceVendor ?? candidate.sourceChannel,
        leadId,
        receivedAt: candidate.receivedAt,
      }).catch(() => {});

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
