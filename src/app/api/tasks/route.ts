import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { syncTaskToLead } from "@/lib/task-lead-sync";

/**
 * GET /api/tasks — list tasks with filters
 * Query params: status, view, assigned_to, lead_id, deal_id
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "pending";
    const view = url.searchParams.get("view") ?? "all";
    const assignedTo = url.searchParams.get("assigned_to");
    const leadId = url.searchParams.get("lead_id");
    const dealId = url.searchParams.get("deal_id");

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const sevenDaysOut = new Date(now);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sb.from("tasks") as any).select("*");

    // Status filter
    if (status === "completed") {
      query = query.eq("status", "completed");
    } else if (status === "pending") {
      query = query.eq("status", "pending");
    }
    // status === "all" applies no filter

    // View filter (only applies to non-completed)
    if (status !== "completed") {
      if (view === "today") {
        query = query.lte("due_at", endOfToday.toISOString()).is("completed_at", null);
      } else if (view === "overdue") {
        query = query.lt("due_at", startOfToday.toISOString()).is("completed_at", null);
      } else if (view === "upcoming") {
        query = query
          .gt("due_at", endOfToday.toISOString())
          .lte("due_at", sevenDaysOut.toISOString())
          .is("completed_at", null);
      }
    }

    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    if (leadId) query = query.eq("lead_id", leadId);
    if (dealId) query = query.eq("deal_id", dealId);

    // Completed tasks: show most recently completed first
    // Pending tasks: show soonest due first
    if (status === "completed") {
      query = query.order("completed_at", { ascending: false, nullsFirst: false });
    } else {
      query = query.order("due_at", { ascending: true, nullsFirst: false });
    }

    const { data: tasks, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Join lead context for tasks that have lead_id
    const leadIds = [...new Set((tasks ?? []).filter((t: { lead_id: string | null }) => t.lead_id).map((t: { lead_id: string }) => t.lead_id))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let leadMap: Record<string, any> = {};

    if (leadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leads } = await (sb.from("leads") as any)
        .select("id, property_id, status")
        .in("id", leadIds.slice(0, 100));

      const propIds = [...new Set((leads ?? []).filter((l: { property_id: string | null }) => l.property_id).map((l: { property_id: string }) => l.property_id))];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let propMap: Record<string, any> = {};
      if (propIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: props } = await (sb.from("properties") as any)
          .select("id, address, owner_name")
          .in("id", propIds.slice(0, 200));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props ?? []).forEach((p: any) => { propMap[p.id] = p; });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (leads ?? []).forEach((l: any) => {
        const prop = propMap[l.property_id] ?? {};
        leadMap[l.id] = {
          lead_address: prop.address ?? null,
          lead_owner: prop.owner_name ?? null,
          lead_status: l.status ?? null,
        };
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = (tasks ?? []).map((t: any) => ({
      ...t,
      ...(leadMap[t.lead_id] ?? { lead_address: null, lead_owner: null, lead_status: null }),
    }));

    return NextResponse.json({ tasks: enriched });
  } catch (err) {
    console.error("[API/tasks] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/tasks — create a new task
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { title } = body;
    if (!title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const record = {
      title: body.title.trim(),
      description: body.description || null,
      assigned_to: body.assigned_to || user.id,
      lead_id: body.lead_id || null,
      deal_id: body.deal_id || null,
      contact_id: body.contact_id || null,
      due_at: body.due_at || null,
      priority: body.priority ?? 1,
      task_type: body.task_type || "follow_up",
      status: "pending",
      completed_at: null,
      created_at: now,
      updated_at: now,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("tasks") as any).insert(record).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Bidirectional sync: project task onto lead's next_action fields
    if (data?.lead_id) {
      await syncTaskToLead(sb, data.lead_id, data.title, data.due_at);
    }

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (err) {
    console.error("[API/tasks] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
