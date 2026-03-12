"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { classifyQueueDueWork, getEffectiveFollowUpAt } from "@/lib/morning-queue-utils";
import { deriveOfferPrepHealth, extractOfferPrepSnapshot } from "@/lib/leads-data";
import { deriveLeadActionSummary, type UrgencyLevel } from "@/lib/action-derivation";

export interface QueueItem {
  leadId: string;
  propertyId: string;
  address: string;
  ownerName: string;
  /** ISO string or null */
  dueAt: string | null;
  /** Action label from deriveLeadActionSummary — e.g. "No contact attempt in 2d" */
  actionLabel?: string;
  /** Urgency level from deriveLeadActionSummary */
  actionUrgency?: UrgencyLevel;
}

export interface QueueBucket {
  key: string;
  label: string;
  count: number;
  items: QueueItem[];
  variant: "destructive" | "neon" | "secondary" | "outline" | "cyan";
  /** If true, only show this bucket to admin users */
  adminOnly?: boolean;
}

export function useMorningQueue() {
  const { currentUser } = useSentinelStore();
  const [buckets, setBuckets] = useState<QueueBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isAdmin = currentUser.role === "admin";

  const fetchQueue = useCallback(async () => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      const [leadsRes, tasksRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("leads") as any)
          .select(
            "id, property_id, status, assigned_to, qualification_route, next_call_scheduled_at, next_follow_up_at, total_calls, created_at, last_contact_at, promoted_at",
          )
          .in("status", ["prospect", "lead", "negotiation", "disposition", "nurture"])
          .order("next_call_scheduled_at", { ascending: true }),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("tasks") as any)
          .select("id, title, description, lead_id, assigned_to, due_at, status")
          .eq("status", "pending")
          .order("due_at", { ascending: true }),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allLeads: any[] = leadsRes.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allTasks: any[] = tasksRes.data ?? [];
      const scopedLeads = isAdmin
        ? allLeads
        : allLeads.filter((l) => !l.assigned_to || l.assigned_to === currentUser.id);
      const scopedTasks = isAdmin
        ? allTasks
        : allTasks.filter((t) => !t.assigned_to || t.assigned_to === currentUser.id);

      const propIds = new Set<string>();
      scopedLeads.forEach((l) => {
        if (l.property_id) propIds.add(l.property_id);
      });

      const taskLeadIds = scopedTasks.map((t) => t.lead_id).filter(Boolean);
      if (taskLeadIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: taskLeads } = await (supabase.from("leads") as any)
          .select("id, property_id")
          .in("id", taskLeadIds.slice(0, 50));
        (taskLeads ?? []).forEach((l: { property_id: string }) => {
          if (l.property_id) propIds.add(l.property_id);
        });
      }

      const propMap: Record<string, { address: string; owner: string; ownerFlags: Record<string, unknown> | null }> = {};
      if (propIds.size > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: props } = await (supabase.from("properties") as any)
          .select("id, address, owner_name, owner_flags")
          .in("id", Array.from(propIds).slice(0, 200));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props ?? []).forEach((p: any) => {
          propMap[p.id] = {
            address: p.address ?? p.id.slice(0, 8),
            owner: p.owner_name ?? "Unknown",
            ownerFlags:
              p.owner_flags && typeof p.owner_flags === "object" && !Array.isArray(p.owner_flags)
                ? (p.owner_flags as Record<string, unknown>)
                : null,
          };
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toItem = (lead: any, dueAt?: string | null): QueueItem => {
        const prop = propMap[lead.property_id] ?? {
          address: lead.property_id?.slice(0, 8) ?? "-",
          owner: "Unknown",
          ownerFlags: null,
        };
        const actionSummary = deriveLeadActionSummary({
          status: lead.status,
          qualificationRoute: lead.qualification_route ?? null,
          assignedTo: lead.assigned_to ?? null,
          nextCallScheduledAt: lead.next_call_scheduled_at ?? null,
          nextFollowUpAt: lead.next_follow_up_at ?? lead.follow_up_date ?? null,
          lastContactAt: lead.last_contact_at ?? null,
          totalCalls: lead.total_calls ?? null,
          createdAt: lead.created_at ?? null,
          promotedAt: lead.promoted_at ?? lead.created_at ?? null,
          now,
        });
        return {
          leadId: lead.id,
          propertyId: lead.property_id,
          address: prop.address,
          ownerName: prop.owner,
          dueAt: dueAt ?? getEffectiveFollowUpAt(lead) ?? null,
          actionLabel: actionSummary.action,
          actionUrgency: actionSummary.urgency,
        };
      };

      const newInbound = scopedLeads.filter(
        (l) => (l.status === "lead" || l.status === "prospect") && new Date(l.created_at) >= startOfDay,
      );

      const { dueTodayLeadIds, overdueLeadIds } = classifyQueueDueWork({
        leads: scopedLeads,
        tasks: scopedTasks,
        now,
      });
      const emphasizedLeadIds = new Set<string>([...dueTodayLeadIds, ...overdueLeadIds]);

      const followUpsDueToday = scopedLeads.filter(
        (l) => dueTodayLeadIds.has(l.id) && l.status !== "dead" && l.status !== "closed",
      );

      const overdue = scopedLeads.filter(
        (l) => overdueLeadIds.has(l.id) && l.status !== "dead" && l.status !== "closed",
      );

      const needsQualification = scopedLeads.filter(
        (l) => l.status === "lead" && !l.qualification_route && (l.total_calls ?? 0) > 0,
      );
      const hasFollowUpAnchor = (lead: {
        next_call_scheduled_at?: string | null;
        next_follow_up_at?: string | null;
        follow_up_date?: string | null;
      }): boolean =>
        [lead.next_call_scheduled_at, lead.next_follow_up_at, lead.follow_up_date].some((value) =>
          typeof value === "string" ? value.trim().length > 0 : Boolean(value),
        );
      const offerPrepNeedsUpdate = scopedLeads.filter((l) => {
        const normalizedStatus = String(l.status ?? "").toLowerCase();
        if (normalizedStatus === "dead" || normalizedStatus === "closed") return false;

        const isOfferPathLead =
          l.qualification_route === "offer_ready"
          || normalizedStatus === "negotiation"
          || normalizedStatus === "disposition";
        if (!isOfferPathLead) return false;
        if (emphasizedLeadIds.has(l.id)) return false;

        const snapshot = extractOfferPrepSnapshot(propMap[l.property_id]?.ownerFlags ?? null);
        const offerPrepHealth = deriveOfferPrepHealth({
          status: l.status,
          qualificationRoute: l.qualification_route ?? null,
          snapshot,
          nextCallScheduledAt: l.next_call_scheduled_at ?? null,
          nextFollowUpAt: l.next_follow_up_at ?? l.follow_up_date ?? null,
        });
        const missingFollowUpAnchor = !hasFollowUpAnchor(l);

        return (
          offerPrepHealth.state === "missing"
          || offerPrepHealth.state === "stale"
          || missingFollowUpAnchor
        );
      });

      const compsToRun = scopedTasks.filter((t) => {
        const text = `${t.title ?? ""} ${t.description ?? ""}`.toLowerCase();
        return text.includes("comp");
      });

      const escalations = scopedTasks.filter((t) => {
        const text = `${t.title ?? ""} ${t.description ?? ""}`.toLowerCase();
        const looksEscalated = text.includes("escalation") || text.includes("adam review");
        return looksEscalated && t.assigned_to === currentUser.id;
      });

      const staleNurture = scopedLeads.filter((l) => {
        if (l.status !== "nurture") return false;
        const followUp = getEffectiveFollowUpAt(l);
        if (!followUp) return true;
        return new Date(followUp) < sevenDaysAgo;
      });

      const taskLeadPropMap: Record<string, string> = {};
      if (taskLeadIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: tl } = await (supabase.from("leads") as any)
          .select("id, property_id")
          .in("id", taskLeadIds.slice(0, 50));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tl ?? []).forEach((l: any) => {
          taskLeadPropMap[l.id] = l.property_id;
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taskToItem = (task: any): QueueItem => {
        const propId = taskLeadPropMap[task.lead_id] ?? "";
        const prop = propMap[propId] ?? { address: task.title, owner: "", ownerFlags: null };
        return {
          leadId: task.lead_id ?? "",
          propertyId: propId,
          address: prop.address,
          ownerName: prop.owner,
          dueAt: task.due_at ?? null,
        };
      };

      const result: QueueBucket[] = [
        {
          key: "overdue",
          label: "Overdue",
          count: overdue.length,
          items: overdue.slice(0, 5).map((l) => toItem(l)),
          variant: "destructive",
        },
        {
          key: "due-today",
          label: "Due Today",
          count: followUpsDueToday.length,
          items: followUpsDueToday.slice(0, 5).map((l) => toItem(l)),
          variant: "neon",
        },
        {
          key: "needs-qualification",
          label: "Needs Qualification",
          count: needsQualification.length,
          items: needsQualification.slice(0, 5).map((l) => toItem(l)),
          variant: "secondary",
        },
        {
          key: "new-inbound",
          label: "New Inbound",
          count: newInbound.length,
          items: newInbound.slice(0, 5).map((l) => toItem(l)),
          variant: "neon",
        },
        {
          key: "offer-prep-needs-update",
          label: "Offer Prep Needs Update",
          count: offerPrepNeedsUpdate.length,
          items: offerPrepNeedsUpdate.slice(0, 5).map((l) => toItem(l)),
          variant: "cyan",
        },
        {
          key: "escalations",
          label: "Escalations",
          count: escalations.length,
          items: escalations.slice(0, 5).map(taskToItem),
          variant: "destructive",
          adminOnly: true,
        },
        {
          key: "comps-to-run",
          label: "Comps to Run",
          count: compsToRun.length,
          items: compsToRun.slice(0, 5).map(taskToItem),
          variant: "secondary",
        },
        {
          key: "stale-nurture",
          label: "Stale Nurture",
          count: staleNurture.length,
          items: staleNurture.slice(0, 5).map((l) => toItem(l, getEffectiveFollowUpAt(l))),
          variant: "outline",
        },
      ];

      setBuckets(result);
    } catch (err) {
      console.error("[useMorningQueue] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, currentUser.role, isAdmin]);

  useEffect(() => {
    fetchQueue();

    const channel = supabase
      .channel("morning_queue_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchQueue())
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchQueue())
      .subscribe();
    channelRef.current = channel;

    const handler = () => fetchQueue();
    window.addEventListener("sentinel:refresh-dashboard", handler);

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      window.removeEventListener("sentinel:refresh-dashboard", handler);
    };
  }, [fetchQueue]);

  return { buckets, loading, isAdmin, refresh: fetchQueue };
}
