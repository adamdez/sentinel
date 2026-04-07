import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sb = createServerClient();
  const user = await getAuthenticatedUser(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: existingError } = await (sb.from("founder_work_logs") as any)
    .select("id, user_id, started_at, ended_at")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const endedAt = typeof body.ended_at === "string" ? body.ended_at : existing.ended_at;
  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  const source = typeof body.source === "string" && body.source.trim().length > 0
    ? body.source.trim()
    : undefined;
  const startedMs = new Date(existing.started_at).getTime();
  const endedMs = endedAt ? new Date(endedAt).getTime() : null;

  if (endedMs != null && (!Number.isFinite(endedMs) || endedMs <= startedMs)) {
    return NextResponse.json({ error: "ended_at must be after started_at" }, { status: 400 });
  }

  const update = {
    ...(endedAt !== undefined ? { ended_at: endedAt } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(source !== undefined ? { source } : {}),
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("founder_work_logs") as any)
    .update(update)
    .eq("id", id)
    .select("id, user_id, started_at, ended_at, source, note, metadata, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sb = createServerClient();
  const user = await getAuthenticatedUser(_req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: existingError } = await (sb.from("founder_work_logs") as any)
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("founder_work_logs") as any).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
