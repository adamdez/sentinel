import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { completeGrokChat, buildSentinelSystemPrompt } from "@/lib/grok-client";
import { buildFullContext } from "@/lib/grok-memory";
import { buildOptimizationAgentPrompt, type PipelineMetrics } from "@/lib/agent/grok-agents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Grok API key not configured" }, { status: 503 });
  }

  try {
    const ctx = await buildFullContext(user.id);

    const pipelineMetrics: PipelineMetrics = {
      pipelineByStage: ctx.pipelineByStage,
      closedDeals30d: ctx.closedDeals30d,
      leadsPerDayLast7d: ctx.leadsPerDayLast7d,
      todayCalls: ctx.todayCalls,
    };

    const basePrompt = buildSentinelSystemPrompt(ctx);
    const optimizationHints = buildOptimizationAgentPrompt(pipelineMetrics);

    const systemPrompt = [
      basePrompt,
      optimizationHints,
      "",
      "## TASK: Generate Proactive Insights",
      "Based on ALL the data above, generate exactly 3-5 actionable insights for the Dominion team.",
      "Each insight should be immediately actionable and data-driven.",
      "",
      "Return ONLY a JSON array (no markdown, no explanation) in this format:",
      '[{"title":"Short title","body":"1-2 sentence explanation with specific numbers","action":"/leads or null","severity":"info|warning|critical"}]',
      "",
      "Severity guide:",
      '- critical: Revenue at risk or compliance issue',
      '- warning: Something needs attention (cooling leads, declining connect rates)',
      '- info: Positive insight or opportunity',
    ].join("\n");

    const raw = await completeGrokChat({
      apiKey,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate proactive insights for the Dominion Sentinel dashboard right now." },
      ],
    });

    let insights;
    try {
      const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
      insights = JSON.parse(cleaned);
    } catch {
      insights = [{ title: "Grok Analysis", body: raw.slice(0, 300), action: null, severity: "info" }];
    }

    return Response.json({ insights });
  } catch (err) {
    console.error("[Grok Insights Error]", err);
    return Response.json(
      { error: "Failed to generate insights" },
      { status: 502 },
    );
  }
}
