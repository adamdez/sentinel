import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/api-auth";
import { type LeadQueueResponse } from "@/lib/lead-queue-contract";
import { buildLeadQueueRow } from "@/lib/lead-queue-server";
import { createServerClient } from "@/lib/supabase";
import { isCallDrivingTaskType, pickPrimaryCallTask } from "@/lib/task-lead-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const LEAD_QUEUE_SELECT = `
  id,
  property_id,
  priority,
  status,
  assigned_to,
  next_follow_up_at,
  next_call_scheduled_at,
  follow_up_date,
  last_contact_at,
  created_at,
  promoted_at,
  motivation_level,
  seller_timeline,
  condition_level,
  decision_maker_confirmed,
  price_expectation,
  qualification_route,
  occupancy_score,
  equity_flexibility_score,
  qualification_score_total,
  source,
  tags,
  notes,
  total_calls,
  live_answers,
  voicemails_left,
  call_sequence_step,
  disposition_code,
  appointment_at,
  offer_amount,
  contract_at,
  assignment_fee_projected,
  seller_situation_summary_short,
  recommended_call_angle,
  top_fact_1,
  top_fact_2,
  top_fact_3,
  opportunity_score,
  contactability_score,
  confidence_score,
  dossier_url,
  next_action,
  next_action_due_at,
  pinned,
  pinned_at,
  pinned_by,
  dial_queue_active,
  dial_queue_added_at,
  intro_sop_active,
  intro_day_count,
  intro_last_call_date,
  intro_completed_at,
  intro_exit_category,
  properties (
    id,
    apn,
    county,
    address,
    city,
    state,
    zip,
    owner_name,
    owner_phone,
    owner_email,
    owner_flags,
    estimated_value,
    equity_percent,
    bedrooms,
    bathrooms,
    sqft,
    property_type,
    year_built,
    lot_size,
    loan_balance,
    last_sale_price,
    last_sale_date,
    foreclosure_stage,
    default_amount,
    delinquent_amount,
    is_vacant
  )
`;

const LEAD_QUEUE_SELECT_LEGACY = `
  id,
  property_id,
  priority,
  status,
  assigned_to,
  next_follow_up_at,
  next_call_scheduled_at,
  last_contact_at,
  created_at,
  promoted_at,
  motivation_level,
  seller_timeline,
  condition_level,
  decision_maker_confirmed,
  price_expectation,
  qualification_route,
  occupancy_score,
  equity_flexibility_score,
  qualification_score_total,
  source,
  tags,
  notes,
  total_calls,
  live_answers,
  voicemails_left,
  call_sequence_step,
  disposition_code,
  seller_situation_summary_short,
  recommended_call_angle,
  top_fact_1,
  top_fact_2,
  top_fact_3,
  opportunity_score,
  contactability_score,
  confidence_score,
  dossier_url,
  next_action,
  next_action_due_at,
  pinned,
  pinned_at,
  pinned_by,
  dial_queue_active,
  dial_queue_added_at,
  properties (
    id,
    apn,
    county,
    address,
    city,
    state,
    zip,
    owner_name,
    owner_phone,
    owner_email,
    owner_flags,
    estimated_value,
    equity_percent,
    bedrooms,
    bathrooms,
    sqft,
    property_type,
    year_built,
    lot_size
  )
`;

function isSchemaDriftError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /does not exist/i.test(error.message ?? "");
}

type PendingLeadTask = {
  id: string;
  lead_id: string | null;
  title: string | null;
  due_at: string | null;
  task_type: string | null;
  status: string | null;
  assigned_to: string | null;
  priority?: number | null;
  created_at?: string | null;
};

async function fetchLeadQueueRows(
  sb: ReturnType<typeof createServerClient>,
  includeNonIntro: boolean,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let primaryQuery = (sb.from("leads") as any)
    .select(LEAD_QUEUE_SELECT)
    .in("status", ["prospect", "lead"])
    .order("priority", { ascending: false });
  if (!includeNonIntro) {
    primaryQuery = primaryQuery.eq("intro_sop_active", true);
  }

  const primaryResult = await primaryQuery;
  if (!primaryResult.error || !isSchemaDriftError(primaryResult.error)) {
    return primaryResult;
  }

  console.warn("[API/leads/queue] Falling back to legacy select:", primaryResult.error);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fallbackQuery = (sb.from("leads") as any)
    .select(LEAD_QUEUE_SELECT_LEGACY)
    .in("status", ["prospect", "lead"])
    .order("priority", { ascending: false });
  if (!includeNonIntro) {
    // Legacy production schemas do not have intro tracking columns.
    // In that mode, treat active lead-stage records as the visible queue.
  }
  return fallbackQuery;
}

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const includeNonIntro = req.nextUrl.searchParams.get("include_non_intro") === "1";
    const { data: leadsRaw, error: leadsErr } = await fetchLeadQueueRows(sb, includeNonIntro);

    if (leadsErr) {
      console.error("[API/leads/queue] Lead query failed:", leadsErr);
      return NextResponse.json({ error: leadsErr.message }, { status: 500 });
    }

    if (!Array.isArray(leadsRaw) || leadsRaw.length === 0) {
      const payload: LeadQueueResponse = {
        leads: [],
        fetchedAt: new Date().toISOString(),
        total: 0,
      };
      const response = NextResponse.json(payload);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }

    const leadIds = [
      ...new Set(
        leadsRaw
          .map((lead) => (lead as { id?: string | null }).id)
          .filter((leadId): leadId is string => typeof leadId === "string" && leadId.length > 0),
      ),
    ];

    const taskMap = new Map<string, PendingLeadTask[]>();
    if (leadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pendingTasks, error: taskErr } = await (sb.from("tasks") as any)
        .select("id, lead_id, title, due_at, task_type, status, assigned_to, priority, created_at")
        .in("lead_id", leadIds)
        .eq("status", "pending");

      if (taskErr) {
        console.warn("[API/leads/queue] tasks degraded:", taskErr);
      } else if (Array.isArray(pendingTasks)) {
        for (const task of pendingTasks as PendingLeadTask[]) {
          if (!task.lead_id || !isCallDrivingTaskType(task.task_type)) continue;
          const bucket = taskMap.get(task.lead_id) ?? [];
          bucket.push(task);
          taskMap.set(task.lead_id, bucket);
        }
      }
    }

    const queueLeads = leadsRaw
      .map((lead) => {
        const leadRecord = lead as Record<string, unknown>;
        const leadId = typeof leadRecord.id === "string" ? leadRecord.id : null;
        const primaryTask = leadId ? pickPrimaryCallTask(taskMap.get(leadId) ?? []) : null;
        const isIntroLead = leadRecord.intro_sop_active !== false;

        if (!primaryTask && !isIntroLead) {
          return null;
        }

        return {
          ...leadRecord,
          next_action: primaryTask?.title ?? leadRecord.next_action ?? null,
          next_action_due_at: primaryTask?.due_at ?? leadRecord.next_action_due_at ?? null,
          next_call_scheduled_at:
            primaryTask && (primaryTask.task_type === "callback" || primaryTask.task_type === "call_back")
              ? primaryTask.due_at
              : leadRecord.next_call_scheduled_at ?? null,
          next_follow_up_at:
            primaryTask && (primaryTask.task_type === "follow_up" || primaryTask.task_type === "drive_by")
              ? primaryTask.due_at
              : leadRecord.next_follow_up_at ?? null,
        };
      })
      .filter((lead) => lead !== null);

    if (queueLeads.length === 0) {
      const payload: LeadQueueResponse = {
        leads: [],
        fetchedAt: new Date().toISOString(),
        total: 0,
      };
      const response = NextResponse.json(payload);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }

    const propertyIds = [
      ...new Set(
        queueLeads
          .map((lead) => (lead as { property_id?: string | null }).property_id)
          .filter((propertyId): propertyId is string => typeof propertyId === "string" && propertyId.length > 0),
      ),
    ];

    const predictionMap: Record<string, number> = {};
    if (propertyIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: predictions, error: predictionErr } = await (sb.from("scoring_predictions") as any)
        .select("property_id, predictive_score")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false });

      if (predictionErr) {
        console.warn("[API/leads/queue] scoring_predictions degraded:", predictionErr);
      } else if (Array.isArray(predictions)) {
        const seen = new Set<string>();
        for (const row of predictions as Array<{ property_id: string; predictive_score: number | null }>) {
          if (!row.property_id || seen.has(row.property_id)) continue;
          if (typeof row.predictive_score === "number") {
            predictionMap[row.property_id] = row.predictive_score;
          }
          seen.add(row.property_id);
        }
      }
    }

    const rows = queueLeads.map((lead) => {
      const propertyId = (lead as { property_id?: string | null }).property_id ?? null;
      return buildLeadQueueRow(
        lead as Record<string, unknown>,
        propertyId ? (predictionMap[propertyId] ?? null) : null,
      );
    });

    const payload: LeadQueueResponse = {
      leads: rows,
      fetchedAt: new Date().toISOString(),
      total: rows.length,
    };

    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[API/leads/queue] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
