import { NextRequest, NextResponse } from "next/server";
import { decodeScoutPhotoDataUri, fetchSpokaneScoutSummary } from "@/providers/spokane-scout/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/properties/scout-photo?apn=...&index=0
 *
 * Spokane SCOUT embeds property photos as data URIs in the summary HTML.
 * This route turns those embedded images into normal HTTP image responses
 * so the client file can reference stable URLs instead of huge DB blobs.
 */
export async function GET(req: NextRequest) {
  const apn = req.nextUrl.searchParams.get("apn")?.trim() ?? "";
  const index = Number.parseInt(req.nextUrl.searchParams.get("index") ?? "0", 10);

  if (!apn) {
    return NextResponse.json({ error: "apn is required" }, { status: 400 });
  }

  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "index must be a non-negative integer" }, { status: 400 });
  }

  try {
    const summary = await fetchSpokaneScoutSummary(apn);
    if (!summary || summary.photoDataUris.length === 0) {
      return NextResponse.json({ error: "No scout photos found" }, { status: 404 });
    }

    const dataUri = summary.photoDataUris[index];
    if (!dataUri) {
      return NextResponse.json({ error: "Photo index out of range" }, { status: 404 });
    }

    const decoded = decodeScoutPhotoDataUri(dataUri);
    if (!decoded) {
      return NextResponse.json({ error: "Could not decode scout photo" }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(decoded.bytes), {
      status: 200,
      headers: {
        "Content-Type": decoded.mimeType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scout-photo] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
