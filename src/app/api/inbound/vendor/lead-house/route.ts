import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { processInboundCandidateToIntakeQueue } from "@/lib/inbound-intake-server";
import { buildNormalizedVendorCandidate } from "@/lib/inbound-vendor-route";

const MAX_INBOUND_PAYLOAD_BYTES = 256 * 1024;

function isAuthorizedLeadHouseRequest(req: NextRequest): boolean {
  const configuredSecret = process.env.LEAD_HOUSE_INTAKE_SECRET ?? process.env.INBOUND_INTAKE_SECRET ?? "";
  const providedSecret =
    req.nextUrl.searchParams.get("secret")?.trim()
    ?? req.headers.get("x-intake-secret")?.trim()
    ?? "";

  return configuredSecret.length > 0 && providedSecret === configuredSecret;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorizedLeadHouseRequest(req)) {
      return NextResponse.json(
        { error: "Unauthorized. Use the full Lead House intake URL exactly as provided." },
        { status: 401 },
      );
    }

    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > MAX_INBOUND_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Inbound payload too large" }, { status: 413 });
    }

    const rawBody = await req.json();
    const candidate = buildNormalizedVendorCandidate(rawBody, {
      sourceVendor: "lead_house",
      sourceChannel: "vendor_inbound",
      intakeMethod: "lead_house_webhook",
    });
    const sb = createServerClient();
    const result = await processInboundCandidateToIntakeQueue({
      sb,
      candidate,
      actorId: null,
    });

    if (result.status === "failed") {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Lead received successfully.",
      intake_lead_id: result.intakeLeadId,
      source_category: result.sourceCategory,
      duplicate_status: result.duplicateStatus,
    });
  } catch (error) {
    console.error("[Lead House Vendor Intake] Failed:", error);
    return NextResponse.json(
      { error: "Unable to process the Lead House lead right now. Please retry the same request once." },
      { status: 500 },
    );
  }
}
