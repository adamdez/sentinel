export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { DEEP_DIVE_NEXT_ACTION, evaluateDeepDiveQueueState, isDeepDiveNextAction } from "@/lib/deep-dive";
import type { UnifiedResearchMetadata, UnifiedResearchQuality } from "@/lib/research-run-types";

type DeepDiveLeadRow = {
  id: string;
  status: string | null;
  assigned_to: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  last_contact_at: string | null;
  total_calls: number | null;
  notes: string | null;
  created_at: string;
  properties: {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
    owner_name: string | null;
    owner_phone: string | null;
  } | null;
};

type DossierRow = {
  lead_id: string;
  status: string | null;
  created_at: string;
  likely_decision_maker: string | null;
  raw_ai_output?: Record<string, unknown> | null;
};

type ResearchSummary = {
  quality: UnifiedResearchQuality | null;
  quality_reason: string | null;
  gap_count: number;
  gaps: string[];
  staged_at: string | null;
  likely_decision_maker: string | null;
  decision_maker_confidence: number | null;
  next_of_kin_count: number;
};

type PendingResearchTaskRow = {
  id: string;
  lead_id: string | null;
  title: string | null;
  assigned_to: string | null;
  due_at: string | null;
  status: string | null;
  completed_at: string | null;
  task_type: string | null;
  source_type: string | null;
  source_key: string | null;
};

type ResearchTaskSummary = {
  id: string;
  title: string | null;
  assigned_to: string | null;
  due_at: string | null;
  completed_at?: string | null;
  source_type: string | null;
  source_key: string | null;
};

function extractResearchSummary(dossier: DossierRow): ResearchSummary {
  const raw = dossier.raw_ai_output ?? null;
  const metadata = raw && typeof raw.research_run === "object"
    ? raw.research_run as UnifiedResearchMetadata
    : null;
  const primaryCandidate = metadata?.people_intel?.next_of_kin?.[0] ?? null;

  return {
    quality: metadata?.run_quality ?? null,
    quality_reason: metadata?.quality_reason ?? null,
    gap_count: metadata?.research_gaps?.length ?? 0,
    gaps: Array.isArray(metadata?.research_gaps)
      ? metadata.research_gaps.filter((gap): gap is string => typeof gap === "string" && gap.trim().length > 0)
      : [],
    staged_at: metadata?.staged_at ?? null,
    likely_decision_maker: dossier.likely_decision_maker ?? primaryCandidate?.name ?? null,
    decision_maker_confidence: typeof primaryCandidate?.confidence === "number" ? primaryCandidate.confidence : null,
    next_of_kin_count: metadata?.people_intel?.next_of_kin?.length ?? 0,
  };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const user = await getDialerUser(authHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createDialerClient(authHeader);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads, error: leadErr } = await (sb.from("leads") as any)
    .select(`
      id,
      status,
      assigned_to,
      next_action,
      next_action_due_at,
      last_contact_at,
      total_calls,
      notes,
      created_at,
      properties (
        address,
        city,
        state,
        zip,
        county,
        owner_name,
        owner_phone
      )
    `)
    .eq("assigned_to", user.id)
    .ilike("next_action", `${DEEP_DIVE_NEXT_ACTION}%`)
    .not("status", "in", '("dead","closed")')
    .order("next_action_due_at", { ascending: true, nullsFirst: false })
    .limit(200);

  if (leadErr) {
    console.error("[deep-dive] lead query failed:", leadErr.message);
    return NextResponse.json({ error: "Failed to load deep-dive queue" }, { status: 500 });
  }

  const deepDiveLeads = ((leads ?? []) as DeepDiveLeadRow[]).filter((lead) => isDeepDiveNextAction(lead.next_action));
  const leadIds = deepDiveLeads.map((lead) => lead.id);

  let latestEventByLead = new Map<string, { created_at: string; reason: string | null }>();
  let dossierStatusByLead = new Map<string, string | null>();
  let researchSummaryByLead = new Map<string, ResearchSummary>();
  let prepStatusByLead = new Map<string, string | null>();
  let pendingResearchTasksByLead = new Map<string, PendingResearchTaskRow[]>();
  let completedResearchTasksByLead = new Map<string, PendingResearchTaskRow[]>();

  if (leadIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: events } = await (sb.from("dialer_events") as any)
      .select("lead_id, created_at, metadata")
      .eq("event_type", "queue.deep_dive")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    for (const event of (events ?? []) as Array<{ lead_id: string; created_at: string; metadata?: { reason?: string | null } }>) {
      if (!latestEventByLead.has(event.lead_id)) {
        latestEventByLead.set(event.lead_id, {
          created_at: event.created_at,
          reason: typeof event.metadata?.reason === "string" && event.metadata.reason.trim().length > 0
            ? event.metadata.reason.trim()
            : null,
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dossiers } = await (sb.from("dossiers") as any)
      .select("lead_id, status, created_at, likely_decision_maker, raw_ai_output")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    for (const dossier of (dossiers ?? []) as DossierRow[]) {
      if (!dossierStatusByLead.has(dossier.lead_id)) {
        dossierStatusByLead.set(dossier.lead_id, dossier.status ?? null);
        researchSummaryByLead.set(dossier.lead_id, extractResearchSummary(dossier));
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prepFrames } = await (sb.from("outbound_prep_frames") as any)
      .select("lead_id, review_status, created_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    for (const frame of (prepFrames ?? []) as Array<{ lead_id: string; review_status: string | null }>) {
      if (!prepStatusByLead.has(frame.lead_id)) {
        prepStatusByLead.set(frame.lead_id, frame.review_status ?? null);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tasks } = await (sb.from("tasks") as any)
      .select("id, lead_id, title, assigned_to, due_at, status, completed_at, task_type, source_type, source_key")
      .in("lead_id", leadIds)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true, nullsFirst: false });

    for (const task of (tasks ?? []) as PendingResearchTaskRow[]) {
      if (!task.lead_id) continue;
      const normalizedType = typeof task.task_type === "string" ? task.task_type.trim().toLowerCase() : null;
      const normalizedSource = typeof task.source_type === "string" ? task.source_type.trim().toLowerCase() : null;
      const isResearchTask = normalizedType === "research"
        || normalizedSource === "deep_search_gap"
        || normalizedSource === "deep_dive_blocker";
      if (!isResearchTask) continue;
      const targetMap = task.status === "completed" || task.completed_at
        ? completedResearchTasksByLead
        : pendingResearchTasksByLead;
      if (!targetMap.has(task.lead_id)) {
        targetMap.set(task.lead_id, []);
      }
      targetMap.get(task.lead_id)?.push(task);
    }
  }

  const items = deepDiveLeads.map((lead) => {
    const parkedEvent = latestEventByLead.get(lead.id);
    const researchSummary = researchSummaryByLead.get(lead.id) ?? null;
    const pendingResearchTasks = pendingResearchTasksByLead.get(lead.id) ?? [];
    const completedResearchTasks = completedResearchTasksByLead.get(lead.id) ?? [];
    const queueState = evaluateDeepDiveQueueState({
      leadId: lead.id,
      research_quality: researchSummary?.quality ?? null,
      research_gap_count: researchSummary?.gap_count ?? 0,
      research_gaps: researchSummary?.gaps ?? [],
      research_staged_at: researchSummary?.staged_at ?? null,
      likely_decision_maker: researchSummary?.likely_decision_maker ?? null,
      openResearchTasks: pendingResearchTasks,
      completedResearchTasks,
    });
    return {
      id: lead.id,
      status: lead.status,
      assigned_to: lead.assigned_to,
      next_action: lead.next_action,
      next_action_due_at: lead.next_action_due_at,
      last_contact_at: lead.last_contact_at,
      total_calls: lead.total_calls ?? 0,
      notes: lead.notes,
      parked_at: parkedEvent?.created_at ?? null,
      parked_reason: parkedEvent?.reason ?? null,
      latest_dossier_status: dossierStatusByLead.get(lead.id) ?? null,
      latest_prep_status: prepStatusByLead.get(lead.id) ?? null,
      research_quality: researchSummary?.quality ?? null,
      research_quality_reason: researchSummary?.quality_reason ?? null,
      research_gap_count: researchSummary?.gap_count ?? 0,
      research_gaps: researchSummary?.gaps ?? [],
      research_staged_at: researchSummary?.staged_at ?? null,
      likely_decision_maker: researchSummary?.likely_decision_maker ?? null,
      decision_maker_confidence: researchSummary?.decision_maker_confidence ?? null,
      next_of_kin_count: researchSummary?.next_of_kin_count ?? 0,
      queue_status: queueState.queueStatus,
      ready_for_rerun: queueState.readyForRerun,
      actionable_research_count: queueState.actionableItems.length,
      actionable_open_count: queueState.actionableOpenCount,
      actionable_completed_count: queueState.actionableCompletedCount,
      actionable_unresolved_count: queueState.actionableUnresolvedCount,
      last_research_task_completed_at: queueState.lastResearchTaskCompletedAt,
      open_research_task_count: pendingResearchTasks.length,
      open_research_tasks: pendingResearchTasks.slice(0, 5).map((task) => ({
        id: task.id,
        title: task.title,
        assigned_to: task.assigned_to,
        due_at: task.due_at,
        source_type: task.source_type,
        source_key: task.source_key,
      })) satisfies ResearchTaskSummary[],
      completed_research_task_count: completedResearchTasks.length,
      completed_research_tasks: completedResearchTasks.slice(0, 3).map((task) => ({
        id: task.id,
        title: task.title,
        assigned_to: task.assigned_to,
        due_at: task.due_at,
        completed_at: task.completed_at,
        source_type: task.source_type,
        source_key: task.source_key,
      })) satisfies ResearchTaskSummary[],
      properties: lead.properties,
    };
  });

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    items,
  });
}
