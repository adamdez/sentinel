import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { streamGrokChat, buildSentinelSystemPrompt, type GrokMessage } from "@/lib/grok-client";

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

  // Fetch live metrics for the system prompt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: activeLeads } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .in("status", ["prospect", "lead", "negotiation"]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: closedDeals } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "closed")
    .gte("updated_at", thirtyDaysAgo);

  const systemPrompt = buildSentinelSystemPrompt({
    activeLeads: activeLeads ?? 0,
    closedDeals30d: closedDeals ?? 0,
  });

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
