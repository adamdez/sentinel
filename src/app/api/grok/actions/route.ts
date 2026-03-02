import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { executeAction, GROK_ACTIONS } from "@/lib/grok-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY ?? "";

  let body: { action: string; params: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.action || typeof body.action !== "string") {
    return Response.json({ error: "action field required" }, { status: 400 });
  }

  const actionDef = GROK_ACTIONS[body.action];
  if (!actionDef) {
    return Response.json(
      { error: `Unknown action: ${body.action}`, available: Object.keys(GROK_ACTIONS) },
      { status: 400 },
    );
  }

  try {
    const result = await executeAction(body.action, body.params ?? {}, sb, apiKey);
    return Response.json(result);
  } catch (err) {
    console.error("[Grok Actions Error]", err);
    return Response.json(
      { success: false, message: "Action execution failed" },
      { status: 500 },
    );
  }
}
