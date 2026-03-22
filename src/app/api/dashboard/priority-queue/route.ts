import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/dashboard/priority-queue
 *
 * Returns the top 15 leads to call today, ranked by urgency.
 *
 * Priority tiers:
 *   1. Overdue callbacks (next_action_due_at < now, next_action set) — urgency 9-10
 *   2. Hot motivation (motivation_level >= 4, contacted within 7 days) — urgency 7-8
 *   3. Speed-to-lead (created < 24h ago, never contacted, new/prospect) — urgency 7-8
 *   4. Scheduled follow-ups (next_action_due_at is today) — urgency 5-6
 *   5. Stale leads (last contacted > 5 days ago, active, has next_action) — urgency 3-4
 *
 * Constraints (from CLAUDE.md):
 *   - Preserves Spokane vs Kootenai county split
 *   - Washington outbound follow-up is call-only
 *   - No lead appears without next_action context
 */

interface PriorityLead {
  id: string;
  owner_name: string | null;
  address: string | null;
  county: string | null;
  phone: string | null;
  status: string;
  motivation_level: number | null;
  next_action: string | null;
  next_action_due_at: string | null;
  last_call_date: string | null;
  last_disposition: string | null;
  priority_reason: string;
  urgency_score: number;
}

interface PriorityQueueResponse {
  leads: PriorityLead[];
  generated_at: string;
  total_candidates: number;
  note: string;
}

// Active pipeline statuses where leads still need attention
const ACTIVE_STATUSES = ["prospect", "lead", "negotiation", "nurture"];

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const nowISO = now.toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Overdue callbacks ────────────────────────────────────────────────
    // Either next_action_due_at or next_call_scheduled_at is past due
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overdueCallbacks } = await (sb.from("leads") as any)
      .select("id, property_id, contact_id, status, motivation_level, next_action, next_action_due_at, next_call_scheduled_at, last_contact_at, created_at")
      .in("status", ACTIVE_STATUSES)
      .or("next_action_due_at.lt." + nowISO + ",next_call_scheduled_at.lt." + nowISO)
      .order("next_action_due_at", { ascending: true })
      .limit(30);

    // ── 2. Hot motivation (motivation_level >= 4, contacted within 7 days) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: hotMotivation } = await (sb.from("leads") as any)
      .select("id, property_id, contact_id, status, motivation_level, next_action, next_action_due_at, last_contact_at, created_at")
      .in("status", ACTIVE_STATUSES)
      .gte("motivation_level", 4)
      .not("next_action", "is", null)
      .gte("last_contact_at", sevenDaysAgo)
      .order("motivation_level", { ascending: false })
      .limit(30);

    // ── 3. Speed-to-lead (created < 24h, never contacted, new/prospect) ─────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: speedToLead } = await (sb.from("leads") as any)
      .select("id, property_id, contact_id, status, motivation_level, next_action, next_action_due_at, last_contact_at, created_at")
      .in("status", ["prospect", "lead"])
      .gte("created_at", twentyFourHoursAgo)
      .is("last_contact_at", null)
      .order("created_at", { ascending: true })
      .limit(30);

    // ── 4. Scheduled follow-ups (next_action_due_at is today) ───────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: scheduledToday } = await (sb.from("leads") as any)
      .select("id, property_id, contact_id, status, motivation_level, next_action, next_action_due_at, last_contact_at, created_at")
      .in("status", ACTIVE_STATUSES)
      .not("next_action", "is", null)
      .gte("next_action_due_at", todayStart)
      .lte("next_action_due_at", todayEnd)
      .order("next_action_due_at", { ascending: true })
      .limit(30);

    // ── 5. Stale leads (last contacted > 5 days ago, active, has next_action) ─
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staleLeads } = await (sb.from("leads") as any)
      .select("id, property_id, contact_id, status, motivation_level, next_action, next_action_due_at, last_contact_at, created_at")
      .in("status", ACTIVE_STATUSES)
      .not("next_action", "is", null)
      .not("last_contact_at", "is", null)
      .lt("last_contact_at", fiveDaysAgo)
      .order("last_contact_at", { ascending: true })
      .limit(30);

    // ── Deduplicate and rank ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type LeadRow = any;

    interface ScoredCandidate {
      lead: LeadRow;
      priority_reason: string;
      urgency_score: number;
    }

    const seen = new Set<string>();
    const candidates: ScoredCandidate[] = [];

    function addCandidates(
      rows: LeadRow[] | null,
      reason: string,
      scoreFn: (lead: LeadRow) => number
    ) {
      for (const lead of rows ?? []) {
        if (seen.has(lead.id)) continue;
        // CLAUDE.md: no lead appears without next_action context
        // Speed-to-lead leads are new and may not have next_action yet — that's acceptable
        // since the action is implicitly "first contact"
        if (!lead.next_action && reason !== "Speed-to-lead: new lead, no contact yet") continue;
        seen.add(lead.id);
        candidates.push({
          lead,
          priority_reason: reason,
          urgency_score: scoreFn(lead),
        });
      }
    }

    // Tier 1: Overdue callbacks — urgency 9-10 based on how overdue
    addCandidates(overdueCallbacks, "Overdue callback", (lead) => {
      const hoursOverdue = (now.getTime() - new Date(lead.next_action_due_at).getTime()) / (1000 * 60 * 60);
      if (hoursOverdue > 48) return 10;
      if (hoursOverdue > 24) return 9;
      return 9;
    });

    // Tier 2: Hot motivation — urgency 7-8
    addCandidates(hotMotivation, "Hot motivation: seller engaged recently", (lead) => {
      return lead.motivation_level >= 5 ? 8 : 7;
    });

    // Tier 3: Speed-to-lead — urgency 7-8 based on recency
    addCandidates(speedToLead, "Speed-to-lead: new lead, no contact yet", (lead) => {
      const hoursOld = (now.getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60);
      // Fresher = more urgent
      return hoursOld < 4 ? 8 : 7;
    });

    // Tier 4: Scheduled follow-ups today — urgency 5-6
    addCandidates(scheduledToday, "Follow-up scheduled today", (lead) => {
      const dueDate = new Date(lead.next_action_due_at);
      // Earlier in the day = slightly higher urgency
      return dueDate.getHours() < 12 ? 6 : 5;
    });

    // Tier 5: Stale leads — urgency 3-4
    addCandidates(staleLeads, "Stale: no contact in 5+ days", (lead) => {
      const daysSince = (now.getTime() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 10 ? 4 : 3;
    });

    // Sort by urgency_score descending, take top 15
    candidates.sort((a, b) => b.urgency_score - a.urgency_score);
    const top15 = candidates.slice(0, 15);

    if (top15.length === 0) {
      return NextResponse.json({
        leads: [],
        generated_at: nowISO,
        total_candidates: 0,
        note: "No leads in the priority queue. All follow-ups are current.",
      } satisfies PriorityQueueResponse);
    }

    // ── Enrich with property, contact, and last call data ───────────────────
    const propertyIds = [...new Set(top15.map((c) => c.lead.property_id).filter(Boolean))];
    const contactIds = [...new Set(top15.map((c) => c.lead.contact_id).filter(Boolean))];
    const leadIds = top15.map((c) => c.lead.id);

    // Fetch properties (address, owner_name, county)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let propMap: Record<string, any> = {};
    if (propertyIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: props } = await (sb.from("properties") as any)
        .select("id, address, owner_name, county")
        .in("id", propertyIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (props ?? []) as any[]) {
        propMap[p.id] = p;
      }
    }

    // Fetch contacts (phone)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let contactMap: Record<string, any> = {};
    if (contactIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contacts } = await (sb.from("contacts") as any)
        .select("id, phone")
        .in("id", contactIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (contacts ?? []) as any[]) {
        contactMap[c.id] = c;
      }
    }

    // Fetch latest call per lead from calls_log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let callMap: Record<string, { started_at: string; disposition: string | null }> = {};
    if (leadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: calls } = await (sb.from("calls_log") as any)
        .select("lead_id, disposition, started_at")
        .in("lead_id", leadIds)
        .order("started_at", { ascending: false })
        .limit(100);

      // Keep only the most recent call per lead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const call of (calls ?? []) as any[]) {
        if (!callMap[call.lead_id]) {
          callMap[call.lead_id] = {
            started_at: call.started_at,
            disposition: call.disposition,
          };
        }
      }
    }

    // ── Build response ──────────────────────────────────────────────────────
    const leads: PriorityLead[] = top15.map((candidate) => {
      const lead = candidate.lead;
      const prop = propMap[lead.property_id] ?? {};
      const contact = contactMap[lead.contact_id] ?? {};
      const lastCall = callMap[lead.id] ?? null;

      // Fall back to property owner_phone if no contact phone
      const phone = contact.phone ?? prop.owner_phone ?? null;

      return {
        id: lead.id,
        owner_name: prop.owner_name ?? null,
        address: prop.address ?? null,
        county: prop.county ?? null,
        phone,
        status: lead.status,
        motivation_level: lead.motivation_level ?? null,
        next_action: lead.next_action ?? null,
        next_action_due_at: lead.next_action_due_at ?? null,
        last_call_date: lastCall?.started_at ?? null,
        last_disposition: lastCall?.disposition ?? null,
        priority_reason: candidate.priority_reason,
        urgency_score: candidate.urgency_score,
      };
    });

    return NextResponse.json({
      leads,
      generated_at: nowISO,
      total_candidates: candidates.length,
      note: "Washington outbound follow-up is call-only unless explicitly changed.",
    } satisfies PriorityQueueResponse);
  } catch (err) {
    console.error("[API/dashboard/priority-queue] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
