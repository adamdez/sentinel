import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { buildTinaWeirdSmallBusinessBenchmarkSnapshot } from "@/tina/lib/weird-small-business-benchmark";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    weirdSmallBusinessBenchmark: buildTinaWeirdSmallBusinessBenchmarkSnapshot(),
  });
}
