import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { runDiagnostics } from "@/lib/diagnostics";

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

  let body: { depth?: number } = {};
  try {
    body = await req.json();
  } catch {
    // default depth
  }

  const depth = Math.min(body.depth ?? 50, 200);

  try {
    const diagnostics = await runDiagnostics(depth);
    return Response.json(diagnostics);
  } catch (err) {
    console.error("[Grok Troubleshoot Error]", err);
    return Response.json(
      { error: "Failed to run diagnostics" },
      { status: 500 },
    );
  }
}
