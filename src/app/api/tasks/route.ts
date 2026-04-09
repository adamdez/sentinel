import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import {
  isCallDrivingTaskType,
  pickPrimaryCallTask,
  syncTaskToLead,
} from "@/lib/task-lead-sync";

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
    const leadMap: Record<string, any> = {};

    if (leadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leads } = await (sb.from("leads") as any)
        .select("id, property_id, status, dial_queue_active")
        .in("id", leadIds.slice(0, 100));

      const propIds = [...new Set((leads ?? []).filter((l: { property_id: string | null }) => l.property_id).map((l: { property_id: string }) => l.property_id))];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propMap: Record<string, any> = {};
      if (propIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: props } = await (sb.from("properties") as any)
          .select("id, address, owner_name, owner_phone")
          .in("id", propIds.slice(0, 200));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props ?? []).forEach((p: any) => { propMap[p.id] = p; });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (leads ?? []).forEach((l: any) => {
        const prop = propMap[l.property_id] ?? {};
        const rawOwner = typeof prop.owner_name === "string" ? prop.owner_name.trim() : null;
        const owner = rawOwner && rawOwner !== "Unknown Owner" ? rawOwner : null;
        leadMap[l.id] = {
          lead_address: prop.address ?? null,
          lead_owner: owner,
          lead_phone: prop.owner_phone ?? null,
          lead_status: l.status ?? null,
          dial_queue_active: l.dial_queue_active === true,
        };
      });
    }

    const assignedUserIds = [
      ...new Set(
        (tasks ?? [])
          .map((t: { assigned_to: string | null }) => t.assigned_to)
          .filter((value: string | null): value is string => typeof value === "string" && value.length > 0)
      ),
    ];
    const assigneeNameMap: Record<string, string> = {};
    if (assignedUserIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profiles } = await (sb.from("user_profiles") as any)
        .select("id, full_name")
        .in("id", assignedUserIds.slice(0, 200));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (profiles ?? []).forEach((profile: any) => {
        if (typeof profile?.id === "string") {
          assigneeNameMap[profile.id] = typeof profile?.full_name === "string" ? profile.full_name : "Unknown";
        }
      });
    }

    // Fetch last call context for each lead
    const callMap: Record<string, { last_call_date: string; last_call_disposition: string | null; last_call_notes: string | null }> = {};
    if (leadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: calls } = await (sb.from("calls_log") as any)
        .select("lead_id, created_at, disposition, notes")
        .in("lead_id", leadIds.slice(0, 100))
        .order("created_at", { ascending: false });

      // Keep only the most recent call per lead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (calls ?? []).forEach((c: any) => {
        if (!callMap[c.lead_id]) {
          callMap[c.lead_id] = {
            last_call_date: c.created_at,
            last_call_disposition: c.disposition ?? null,
            last_call_notes: c.notes ? String(c.notes).slice(0, 120) : null,
          };
        }
      });
    }

    const pendingTaskStatsByLeadId: Record<string, { open_task_count: number; open_call_task_count: number; primary_task_id: string | null }> = {};
    if (leadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pendingTasks } = await (sb.from("tasks") as any)
        .select("id, lead_id, due_at, task_type, status, priority, created_at")
        .in("lead_id", leadIds)
        .eq("status", "pending");

      const grouped: Record<string, Array<Record<string, unknown>>> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pendingTasks ?? []).forEach((task: any) => {
        if (typeof task?.lead_id !== "string") return;
        if (!grouped[task.lead_id]) grouped[task.lead_id] = [];
        grouped[task.lead_id].push(task);
      });

      for (const leadIdKey of Object.keys(grouped)) {
        const tasksForLead = grouped[leadIdKey];
        const primary = pickPrimaryCallTask(tasksForLead as Array<{
          id: string;
          title: string | null;
          due_at: string | null;
          task_type: string | null;
          status: string | null;
          lead_id: string | null;
          assigned_to: string | null;
          priority?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        }>);
        pendingTaskStatsByLeadId[leadIdKey] = {
          open_task_count: tasksForLead.length,
          open_call_task_count: tasksForLead.filter((task) => isCallDrivingTaskType(typeof task.task_type === "string" ? task.task_type : null)).length,
          primary_task_id: primary?.id ?? null,
        };
      }
    }

    const noCallContext = { last_call_date: null, last_call_disposition: null, last_call_notes: null };
    const noLeadContext = {
      lead_address: null,
      lead_owner: null,
      lead_phone: null,
      lead_status: null,
      dial_queue_active: false,
      is_call_task: false,
      is_primary_for_lead: false,
      open_task_count: 0,
      open_call_task_count: 0,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = (tasks ?? []).map((t: any) => ({
      ...t,
      ...(leadMap[t.lead_id] ?? noLeadContext),
      ...(callMap[t.lead_id] ?? noCallContext),
      assigned_to_name: typeof t.assigned_to === "string" ? (assigneeNameMap[t.assigned_to] ?? null) : null,
      is_call_task: isCallDrivingTaskType(typeof t.task_type === "string" ? t.task_type : null),
      is_primary_for_lead:
        typeof t.lead_id === "string"
        && !!pendingTaskStatsByLeadId[t.lead_id]
        && pendingTaskStatsByLeadId[t.lead_id].primary_task_id === t.id,
      open_task_count: typeof t.lead_id === "string" ? (pendingTaskStatsByLeadId[t.lead_id]?.open_task_count ?? 0) : 0,
      open_call_task_count: typeof t.lead_id === "string" ? (pendingTaskStatsByLeadId[t.lead_id]?.open_call_task_count ?? 0) : 0,
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
      source_type: body.source_type || null,
      source_key: body.source_key || null,
      voice_session_id: body.voice_session_id || null,
      jeff_interaction_id: body.jeff_interaction_id || null,
      notes: body.notes || null,
      status: "pending",
      completed_at: null,
      created_at: now,
      updated_at: now,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("tasks") as any).insert(record).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Project the lead compatibility fields from the canonical task state.
    if (data?.lead_id) {
      await syncTaskToLead(sb, data.lead_id, data.title, data.due_at);
    }

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (err) {
    console.error("[API/tasks] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
