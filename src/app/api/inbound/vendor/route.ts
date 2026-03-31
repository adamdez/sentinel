import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { authorizeInboundRequest, processInboundCandidateToIntakeQueue } from "@/lib/inbound-intake-server";
import { buildNormalizedVendorCandidate } from "@/lib/inbound-vendor-route";

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
    const candidate = buildNormalizedVendorCandidate(rawBody);

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
