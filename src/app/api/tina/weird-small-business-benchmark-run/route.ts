import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { runTinaWeirdSmallBusinessBenchmark } from "@/tina/lib/weird-small-business-benchmark-runner";

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { scenarioIds?: string[]; topPriorityOnly?: boolean } = {};
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    payload = {};
  }

  try {
    const benchmarkRun = await runTinaWeirdSmallBusinessBenchmark({
      scenarioIds: payload.scenarioIds,
      topPriorityOnly: payload.topPriorityOnly,
    });

    return NextResponse.json({ benchmarkRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run weird small-business benchmark.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
