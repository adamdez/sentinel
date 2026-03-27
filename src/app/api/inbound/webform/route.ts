import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { normalizeInboundCandidate } from "@/lib/inbound-intake";
import { authorizeInboundRequest, processInboundCandidateToIntakeQueue } from "@/lib/inbound-intake-server";

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

    const body = await req.json();
    const candidate = normalizeInboundCandidate({
      sourceChannel: "webform",
      sourceVendor: typeof body.source_vendor === "string" ? body.source_vendor : "website",
      sourceCampaign: typeof body.source_campaign === "string" ? body.source_campaign : null,
      intakeMethod: typeof body.intake_method === "string" ? body.intake_method : "webform_post",
      rawSourceRef: typeof body.raw_source_ref === "string" ? body.raw_source_ref : body.form_id ?? null,
      ownerName: body.owner_name ?? body.name ?? null,
      phone: body.phone ?? body.contact_phone ?? null,
      email: body.email ?? body.contact_email ?? null,
      propertyAddress: body.property_address ?? body.address ?? null,
      propertyCity: body.city ?? null,
      propertyState: body.state ?? null,
      propertyZip: body.zip ?? null,
      county: body.county ?? null,
      apn: body.apn ?? null,
      notes: body.notes ?? body.message ?? null,
      rawText: body.message ?? body.notes ?? null,
      rawPayload: body && typeof body === "object" ? body as Record<string, unknown> : null,
      receivedAt: typeof body.received_at === "string" ? body.received_at : null,
      gclid: typeof body.gclid === "string" ? body.gclid : null,
      landingPage: typeof body.landing_page === "string" ? body.landing_page : null,
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
    console.error("[Inbound Webform] Failed:", error);
    return NextResponse.json(
      { error: "Unable to process inbound webform right now. Please retry or enter the lead manually." },
      { status: 500 },
    );
  }
}
