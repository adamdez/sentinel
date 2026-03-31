import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { normalizeInboundCandidate } from "@/lib/inbound-intake";
import { authorizeInboundRequest, processInboundCandidateToIntakeQueue } from "@/lib/inbound-intake-server";
import { isVendorPayloadRecord, readVendorString, unwrapVendorPayload } from "@/lib/inbound-vendor-payload";

const MAX_INBOUND_PAYLOAD_BYTES = 256 * 1024;

export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const auth = await authorizeInboundRequest(req, sb);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > MAX_INBOUND_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Inbound payload too large" }, { status: 413 });
    }

    const rawBody = await req.json();
    const body = unwrapVendorPayload(rawBody);
    const sourceChannel = readVendorString(body, "source_channel") ?? "vendor_inbound";

    const candidate = normalizeInboundCandidate({
      sourceChannel,
      sourceVendor: readVendorString(body, "source_vendor") ?? "vendor",
      sourceCampaign: readVendorString(body, "source_campaign") ?? readVendorString(body, "campaign"),
      intakeMethod: readVendorString(body, "intake_method") ?? "vendor_post",
      rawSourceRef: readVendorString(body, "raw_source_ref") ?? readVendorString(body, "lead_id") ?? readVendorString(body, "reference_id"),
      ownerName: readVendorString(body, "owner_name") ?? readVendorString(body, "name") ?? readVendorString(body, "full_name"),
      phone: readVendorString(body, "phone") ?? readVendorString(body, "contact_phone") ?? readVendorString(body, "phone_number"),
      email: readVendorString(body, "email") ?? readVendorString(body, "contact_email"),
      propertyAddress: readVendorString(body, "property_address") ?? readVendorString(body, "address") ?? readVendorString(body, "property"),
      propertyCity: readVendorString(body, "city"),
      propertyState: readVendorString(body, "state"),
      propertyZip: readVendorString(body, "zip") ?? readVendorString(body, "postal_code"),
      county: readVendorString(body, "county"),
      apn: readVendorString(body, "apn") ?? readVendorString(body, "parcel_number"),
      notes: readVendorString(body, "notes") ?? readVendorString(body, "message") ?? readVendorString(body, "description"),
      rawText: readVendorString(body, "message") ?? readVendorString(body, "description"),
      rawPayload: isVendorPayloadRecord(rawBody) ? rawBody : null,
      receivedAt: readVendorString(body, "received_at"),
    });

    const result = await processInboundCandidateToIntakeQueue({
      sb,
      candidate,
      actorId: auth.userId,
    });

    if (result.status === "failed") {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      intake_lead_id: result.intakeLeadId,
      source_category: result.sourceCategory,
      status: result.status,
      duplicate_status: result.duplicateStatus,
    });
  } catch (error) {
    console.error("[Inbound Vendor] Failed:", error);
    return NextResponse.json(
      { error: "Unable to process inbound vendor lead right now. Please retry or use manual entry." },
      { status: 500 },
    );
  }
}
