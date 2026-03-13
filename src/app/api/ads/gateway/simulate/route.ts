import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { simulateImplementation } from "@/lib/ads/gateway/simulator";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/gateway/simulate
 * 
 * Securely exposes the dry-run simulator layer.
 * 
 * Rules:
 * 1. Must be authenticated.
 * 2. ID MUST be for a recommendation with status 'approved'.
 * 3. Enforces all simulator safety checks (freshness, entity revalidation).
 * 4. Records a MOCK outcome in ads_implementation_logs.
 * 5. Does NOT execute real changes in Google Ads.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  
  // 1. Authentication
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Body Validation
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { recommendationId } = body;
  if (!recommendationId) {
    return NextResponse.json({ error: "recommendationId is required" }, { status: 400 });
  }

  // 3. Trigger Simulator
  // All revalidation, freshness, and duplicate-prevention logic is handled here.
  const result = await simulateImplementation(sb, recommendationId, user.id);

  if (!result.success) {
    const errorMap: Record<string, number> = {
      "ENTITY_NOT_FOUND": 404,
      "INVALID_STATE": 403,
      "STALE": 409, // Conflict (freshness window closed)
      "MARKET_MISMATCH": 409,
      "DUPLICATE_RUN": 409,
      "DB_ERROR": 500
    };
    
    return NextResponse.json({
      ok: false,
      code: result.code,
      message: result.message
    }, { status: errorMap[result.code] || 500 });
  }

  // 4. Successful Dry-Run Result
  return NextResponse.json({
    ok: true,
    simulation: true,
    code: "SUCCESS",
    message: result.message,
    details: {
      ...result.details,
      disclaimer: "DRY-RUN ONLY: No changes were made to Google Ads."
    }
  });
}
