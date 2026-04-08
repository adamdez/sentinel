import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getLeadResearchStatus, runLeadResearch } from "@/lib/lead-research";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const status = await getLeadResearchStatus(id);
    return NextResponse.json(status);
  } catch (error) {
    console.error("[API/leads/research-run] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await runLeadResearch({
      leadId: id,
      startedBy: user.id,
      force: Boolean(body.force),
      model: typeof body.model === "string" ? body.model : undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[API/leads/research-run] POST error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = /not found|no property/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
