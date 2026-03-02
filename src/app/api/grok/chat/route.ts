import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { streamGrokChat, buildSentinelSystemPrompt, type GrokMessage } from "@/lib/grok-client";
import { buildFullContext } from "@/lib/grok-memory";
import {
  detectAgentIntent,
  buildOptimizationAgentPrompt,
  buildForecastingAgentPrompt,
  type PipelineMetrics,
} from "@/lib/agent/grok-agents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (token) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any).auth.getUser = async () => {
      const { data, error } = await sb.auth.getUser(token);
      return { data, error };
    };
  }

  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error("[Grok API Error] Neither GROK_API_KEY nor XAI_API_KEY is set in environment");
    return new Response(
      JSON.stringify({ error: "Grok API key not configured — add GROK_API_KEY or XAI_API_KEY to Vercel env." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { messages: GrokMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ctx = await buildFullContext(user.id);

  let systemPrompt = buildSentinelSystemPrompt(ctx);

  const lastUserMsg = [...body.messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg) {
    const intent = detectAgentIntent(lastUserMsg.content);
    if (intent) {
      const pm: PipelineMetrics = {
        pipelineByStage: ctx.pipelineByStage,
        closedDeals30d: ctx.closedDeals30d,
        leadsPerDayLast7d: ctx.leadsPerDayLast7d,
        todayCalls: ctx.todayCalls,
      };

      switch (intent) {
        case "optimization":
          systemPrompt += buildOptimizationAgentPrompt(pm);
          break;
        case "forecasting":
          systemPrompt += buildForecastingAgentPrompt(pm);
          break;
        case "call-copilot":
          systemPrompt += "\n\n## Agent Mode: CALL CO-PILOT\nThe user wants help with a call. Provide pre-call guidance, objection handlers, and script suggestions based on the lead data in context.";
          break;
        case "outreach":
          systemPrompt += "\n\n## Agent Mode: OUTREACH SPECIALIST\nThe user wants to draft outreach. Help them create personalized SMS or email text. Follow compliance rules strictly.";
          break;
      }
    }
  }

  const messages: GrokMessage[] = [
    { role: "system", content: systemPrompt },
    ...body.messages.slice(-20),
  ];

  try {
    const stream = await streamGrokChat({ messages, apiKey });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Grok API Error]", message, err);
    return new Response(
      JSON.stringify({ error: "Grok is temporarily unavailable. Please try again in a moment." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
