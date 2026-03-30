import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { syncTaskToLead, clearTaskFromLead } from "@/lib/task-lead-sync";
import { syncJeffInteractionStatusFromTask } from "@/lib/jeff-interactions";

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
      "source_type", "source_key", "voice_session_id", "jeff_interaction_id", "notes",
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

    // Fetch current task for lead sync context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: current } = await (sb.from("tasks") as any)
      .select("lead_id, status, title")
      .eq("id", id)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("tasks") as any)
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Bidirectional sync: project task changes onto lead
    const leadId = data?.lead_id ?? current?.lead_id;
    if (leadId) {
      if (data.status === "completed") {
        await clearTaskFromLead(sb, leadId, id);
      } else if (data.status === "pending") {
        await syncTaskToLead(sb, leadId, data.title, data.due_at);
      }
    }

    await syncJeffInteractionStatusFromTask(id, data.status);

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

    // Fetch lead_id before deletion for sync
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: taskBefore } = await (sb.from("tasks") as any)
      .select("lead_id, jeff_interaction_id")
      .eq("id", id)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("tasks") as any).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Bidirectional sync: clear lead's next_action or promote next pending task
    if (taskBefore?.lead_id) {
      await clearTaskFromLead(sb, taskBefore.lead_id, id);
    }

    if (taskBefore?.jeff_interaction_id) {
      await syncJeffInteractionStatusFromTask(id, "deleted", true, taskBefore.jeff_interaction_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API/tasks/id] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
