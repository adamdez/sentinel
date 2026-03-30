export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getJeffInteractionById, listJeffInteractions, updateJeffInteraction } from "@/lib/jeff-interactions";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get("leadId");
  const unresolvedOnly = req.nextUrl.searchParams.get("unresolvedOnly") === "true";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 100);

  const interactions = await listJeffInteractions({
    leadId,
    unresolvedOnly,
    limit,
  });

  return NextResponse.json({ interactions });
}

export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    id?: string;
    status?: "needs_review" | "task_open" | "reviewed" | "resolved";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id || !body.status) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }

  if (body.status === "task_open") {
    return NextResponse.json({ error: "task_open is system-managed" }, { status: 400 });
  }

  const current = await getJeffInteractionById(body.id);
  if (!current) {
    return NextResponse.json({ error: "Jeff interaction not found" }, { status: 404 });
  }

  if (body.status === "resolved" && current.task_id) {
    return NextResponse.json(
      { error: "Complete or remove the linked task before resolving this Jeff interaction" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  await updateJeffInteraction(body.id, {
    status: body.status,
    reviewedAt: body.status === "reviewed" ? now : undefined,
    resolvedAt: body.status === "resolved" ? now : body.status === "needs_review" ? null : undefined,
  });

  return NextResponse.json({ ok: true });
}
