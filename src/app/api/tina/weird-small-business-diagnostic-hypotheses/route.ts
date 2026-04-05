import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { TINA_WEIRD_SMALL_BUSINESS_SCENARIOS } from "@/tina/data/weird-small-business-scenarios";
import { buildTinaWeirdSmallBusinessDiagnosticHypotheses } from "@/tina/lib/weird-small-business-diagnostic-hypotheses";
import { buildTinaWeirdSmallBusinessDiagnosticPreflight } from "@/tina/lib/weird-small-business-diagnostic-preflight";

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { scenarioIds?: string[] } = {};
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    payload = {};
  }

  const requestedIds = new Set(payload.scenarioIds ?? []);
  const scenarios =
    requestedIds.size === 0
      ? TINA_WEIRD_SMALL_BUSINESS_SCENARIOS
      : TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.filter((scenario) =>
          requestedIds.has(scenario.id)
        );

  if (requestedIds.size > 0 && scenarios.length !== requestedIds.size) {
    const foundIds = new Set(scenarios.map((scenario) => scenario.id));
    const missingIds = [...requestedIds].filter((id) => !foundIds.has(id));
    return NextResponse.json(
      { error: `Unknown weird small-business scenario ids: ${missingIds.join(", ")}` },
      { status: 400 }
    );
  }

  const diagnosticHypotheses = scenarios.map((scenario) => {
    const diagnosticPreflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(scenario);

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      diagnosticPreflight,
      diagnosticHypotheses: buildTinaWeirdSmallBusinessDiagnosticHypotheses(
        scenario,
        diagnosticPreflight
      ),
    };
  });

  return NextResponse.json({ diagnosticHypotheses });
}
