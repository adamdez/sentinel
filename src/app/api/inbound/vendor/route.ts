import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { normalizeInboundCandidate } from "@/lib/inbound-intake";
import { authorizeInboundRequest, processInboundCandidate } from "@/lib/inbound-intake-server";

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
    const sourceChannel =
      typeof body.source_channel === "string" && body.source_channel.trim().length > 0
        ? body.source_channel
        : "vendor_inbound";

    const candidate = normalizeInboundCandidate({
      sourceChannel,
      sourceVendor: typeof body.source_vendor === "string" ? body.source_vendor : "vendor",
      sourceCampaign: typeof body.source_campaign === "string" ? body.source_campaign : body.campaign ?? null,
      intakeMethod: typeof body.intake_method === "string" ? body.intake_method : "vendor_post",
      rawSourceRef: typeof body.raw_source_ref === "string" ? body.raw_source_ref : body.lead_id ?? body.reference_id ?? null,
      ownerName: body.owner_name ?? body.name ?? body.full_name ?? null,
      phone: body.phone ?? body.contact_phone ?? body.phone_number ?? null,
      email: body.email ?? body.contact_email ?? null,
      propertyAddress: body.property_address ?? body.address ?? body.property ?? null,
      propertyCity: body.city ?? null,
      propertyState: body.state ?? null,
      propertyZip: body.zip ?? body.postal_code ?? null,
      county: body.county ?? null,
      apn: body.apn ?? body.parcel_number ?? null,
      notes: body.notes ?? body.message ?? body.description ?? null,
      rawText: body.message ?? body.description ?? null,
      rawPayload: body && typeof body === "object" ? body as Record<string, unknown> : null,
      receivedAt: typeof body.received_at === "string" ? body.received_at : null,
    });

    const result = await processInboundCandidate({
      req,
      sb,
      authHeader: req.headers.get("authorization"),
      actorId: auth.userId,
      candidate,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Inbound Vendor] Failed:", error);
    return NextResponse.json(
      { error: "Unable to process inbound vendor lead right now. Please retry or use manual entry." },
      { status: 500 },
    );
  }
}
