import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * PATCH /api/tasks/[id] — update task fields
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const allowed = [
      "title", "description", "assigned_to", "due_at", "priority",
      "status", "completed_at", "task_type", "lead_id", "deal_id", "contact_id",
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    // Auto-set completed_at when completing
    if (body.status === "completed" && !body.completed_at) {
      update.completed_at = new Date().toISOString();
    }

    // Clear completed_at when reopening to pending
    if (body.status === "pending") {
      update.completed_at = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("tasks") as any)
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ task: data });
  } catch (err) {
    console.error("[API/tasks/id] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/tasks/[id] — hard delete a task
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("tasks") as any).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API/tasks/id] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
