"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { classifyQueueDueWork, getEffectiveFollowUpAt } from "@/lib/morning-queue-utils";

export interface QueueItem {
  leadId: string;
  propertyId: string;
  address: string;
  ownerName: string;
  /** ISO string or null */
  dueAt: string | null;
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
            "id, property_id, status, assigned_to, qualification_route, next_call_scheduled_at, next_follow_up_at, follow_up_date, total_calls, created_at",
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

      const propIds = new Set<string>();
      allLeads.forEach((l) => {
        if (l.property_id) propIds.add(l.property_id);
      });

      const taskLeadIds = allTasks.map((t) => t.lead_id).filter(Boolean);
      if (taskLeadIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: taskLeads } = await (supabase.from("leads") as any)
          .select("id, property_id")
          .in("id", taskLeadIds.slice(0, 50));
        (taskLeads ?? []).forEach((l: { property_id: string }) => {
          if (l.property_id) propIds.add(l.property_id);
        });
      }

      const propMap: Record<string, { address: string; owner: string }> = {};
      if (propIds.size > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: props } = await (supabase.from("properties") as any)
          .select("id, street_address, owner_name")
          .in("id", Array.from(propIds).slice(0, 200));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props ?? []).forEach((p: any) => {
          propMap[p.id] = {
            address: p.street_address ?? p.id.slice(0, 8),
            owner: p.owner_name ?? "Unknown",
          };
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toItem = (lead: any, dueAt?: string | null): QueueItem => {
        const prop = propMap[lead.property_id] ?? { address: lead.property_id?.slice(0, 8) ?? "-", owner: "Unknown" };
        return {
          leadId: lead.id,
          propertyId: lead.property_id,
          address: prop.address,
          ownerName: prop.owner,
          dueAt: dueAt ?? getEffectiveFollowUpAt(lead) ?? null,
        };
      };

      const newInbound = allLeads.filter(
        (l) => (l.status === "lead" || l.status === "prospect") && new Date(l.created_at) >= startOfDay,
      );

      const offersPending = allLeads.filter(
        (l) => l.qualification_route === "offer_ready" && (l.status === "negotiation" || l.status === "disposition"),
      );

      const { dueTodayLeadIds, overdueLeadIds } = classifyQueueDueWork({
        leads: allLeads,
        tasks: allTasks,
        now,
      });

      const followUpsDueToday = allLeads.filter(
        (l) => dueTodayLeadIds.has(l.id) && l.status !== "dead" && l.status !== "closed",
      );

      const overdue = allLeads.filter(
        (l) => overdueLeadIds.has(l.id) && l.status !== "dead" && l.status !== "closed",
      );

      const needsQualification = allLeads.filter(
        (l) => l.status === "lead" && !l.qualification_route && (l.total_calls ?? 0) > 0,
      );

      const compsToRun = allTasks.filter((t) => {
        const text = `${t.title ?? ""} ${t.description ?? ""}`.toLowerCase();
        return text.includes("comp");
      });

      const escalations = allTasks.filter((t) => {
        const text = `${t.title ?? ""} ${t.description ?? ""}`.toLowerCase();
        const looksEscalated = text.includes("escalation") || text.includes("adam review");
        return looksEscalated && t.assigned_to === currentUser.id;
      });

      const staleNurture = allLeads.filter((l) => {
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
        const prop = propMap[propId] ?? { address: task.title, owner: "" };
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
          key: "new-inbound",
          label: "New Inbound",
          count: newInbound.length,
          items: newInbound.slice(0, 5).map((l) => toItem(l)),
          variant: "neon",
        },
        {
          key: "offers-pending",
          label: "Offers Pending",
          count: offersPending.length,
          items: offersPending.slice(0, 5).map((l) => toItem(l)),
          variant: "cyan",
        },
        {
          key: "due-today",
          label: "Due Today",
          count: followUpsDueToday.length,
          items: followUpsDueToday.slice(0, 5).map((l) => toItem(l)),
          variant: "neon",
        },
        {
          key: "overdue",
          label: "Overdue",
          count: overdue.length,
          items: overdue.slice(0, 5).map((l) => toItem(l)),
          variant: "destructive",
        },
        {
          key: "needs-qualification",
          label: "Needs Qual",
          count: needsQualification.length,
          items: needsQualification.slice(0, 5).map((l) => toItem(l)),
          variant: "secondary",
        },
        {
          key: "comps-to-run",
          label: "Comps to Run",
          count: compsToRun.length,
          items: compsToRun.slice(0, 5).map(taskToItem),
          variant: "secondary",
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
