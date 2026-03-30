"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { scrubLeadClient } from "@/lib/compliance";
import { useSentinelStore } from "@/lib/store";
import type { QualificationRoute } from "@/lib/types";
import type { AutoCycleLeadState, AutoCyclePhoneState } from "@/lib/dialer/types";
import type {
  DialerKpiPreset,
  DialerKpiRange,
  DialerKpiSnapshot,
} from "@/lib/dialer-kpis";

// ── Queue Lead shape ──────────────────────────────────────────────────

export interface QueueLead {
  id: string;
  property_id: string;
  status: string;
  priority: number;
  source: string;
  tags: string[];
  notes: string | null;
  assigned_to: string | null;
  lock_version: number;
  next_call_scheduled_at: string | null;
  dial_queue_active?: boolean | null;
  dial_queue_added_at?: string | null;
  dial_queue_added_by?: string | null;
  next_action_due_at: string | null;
  next_follow_up_at: string | null;
  follow_up_date?: string | null;
  skip_trace_status?: string | null;
  skip_trace_completed_at?: string | null;
  last_contact_at: string | null;
  promoted_at: string | null;
  call_sequence_step: number;
  total_calls: number;
  live_answers: number;
  voicemails_left: number;
  disposition_code: string | null;
  qualification_route: QualificationRoute | null;
  qualification_score_total: number | null;
  motivation_level: number | null;
  seller_timeline: string | null;
  condition_level: number | null;
  decision_maker_confirmed: boolean | null;
  price_expectation: number | null;
  occupancy_score: number | null;
  equity_flexibility_score: number | null;
  properties: {
    id: string;
    address: string;
    owner_name: string;
    owner_phone: string | null;
    estimated_value: number | null;
    equity_percent: number | null;
    city: string;
    state: string;
    county: string;
    owner_flags: Record<string, unknown> | null;
  } | null;
  predictiveScore: number | null;
  blendedPriority: number;
  compliant?: boolean;
  scrubbing?: boolean;
}

export interface AutoCycleQueueLead extends QueueLead {
  autoCycle: AutoCycleLeadState;
  autoCyclePhones: AutoCyclePhoneState[];
}

async function dialerAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

// ── Dialer Queue Hook ─────────────────────────────────────────────────

export function useDialerQueue(limit = 7) {
  const [queue, setQueue] = useState<QueueLead[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, ghostMode } = useSentinelStore();

  const fetchQueue = useCallback(async () => {
    if (!currentUser.id) return;
    try {
      // Personal queue: explicitly queued leads only.
      // We still rank due work inside that queue, but membership itself is manual.
      const queueRes = await withTimeout<any>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("leads") as any)
          .select("*, properties(*)")
          .in("status", ["lead", "negotiation"])
          .eq("assigned_to", currentUser.id)
          .eq("dial_queue_active", true)
          .order("dial_queue_added_at", { ascending: false })
          .limit(limit + 40),
        10_000,
      );

      if (queueRes.error) {
        const err = queueRes.error;
        console.error("[DialerQueue] query error:", err?.message ?? err);
        setLoading(false);
        return;
      }
      const rows = (queueRes.data ?? []) as QueueLead[];

      // Batch-fetch predictive scores for these leads' properties
      const propertyIds = rows
        .map((l) => l.property_id)
        .filter(Boolean);
      const leadIds = rows.map((l) => l.id).filter(Boolean);

      let predMap: Record<string, number> = {};
      if (propertyIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: predData } = await (supabase.from("scoring_predictions") as any)
          .select("property_id, predictive_score")
          .in("property_id", propertyIds)
          .order("created_at", { ascending: false });

        if (predData) {
          const seen = new Set<string>();
          for (const p of predData as { property_id: string; predictive_score: number }[]) {
            if (!seen.has(p.property_id)) {
              predMap[p.property_id] = p.predictive_score;
              seen.add(p.property_id);
            }
          }
        }
      }

      let leadPhoneMap: Record<string, string> = {};
      if (leadIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: phoneRows } = await (supabase.from("lead_phones") as any)
          .select("lead_id, phone, status, is_primary, position")
          .in("lead_id", leadIds)
          .eq("status", "active")
          .order("is_primary", { ascending: false })
          .order("position", { ascending: true })
          .order("created_at", { ascending: true });

        if (phoneRows) {
          for (const row of phoneRows as Array<{ lead_id: string; phone: string }>) {
            if (!leadPhoneMap[row.lead_id]) {
              leadPhoneMap[row.lead_id] = row.phone;
            }
          }
        }
      }

      // Blend: 60% existing priority + 40% predictive score
      const enriched = rows.map((lead) => {
        const predScore = predMap[lead.property_id] ?? null;
        const blendedPriority = predScore !== null
          ? Math.round(lead.priority * 0.6 + predScore * 0.4)
          : lead.priority;
        const fallbackPhone = lead.properties?.owner_phone ?? leadPhoneMap[lead.id] ?? null;
        return {
          ...lead,
          properties: lead.properties ? { ...lead.properties, owner_phone: fallbackPhone } : lead.properties,
          predictiveScore: predScore,
          blendedPriority,
        };
      });

      // Prioritize due work first, then scheduled work, then unscheduled.
      // Within each bucket, order by soonest due date then blended priority.
      const nowMs = Date.now();
      const toMs = (iso: string | null | undefined): number | null => {
        if (!iso) return null;
        const ms = new Date(iso).getTime();
        return Number.isNaN(ms) ? null : ms;
      };
      const effectiveDueMs = (lead: QueueLead): number | null =>
        toMs(lead.next_call_scheduled_at) ?? toMs(lead.next_action_due_at) ?? toMs(lead.next_follow_up_at) ?? toMs(lead.follow_up_date);
      const rank = (lead: QueueLead): { bucket: number; dueMs: number } => {
        const dueMs = effectiveDueMs(lead);
        if (dueMs != null && dueMs <= nowMs) return { bucket: 0, dueMs };
        if (dueMs != null) return { bucket: 1, dueMs };
        return { bucket: 2, dueMs: Number.POSITIVE_INFINITY };
      };

      enriched.sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra.bucket !== rb.bucket) return ra.bucket - rb.bucket;
        if (ra.dueMs !== rb.dueMs) return ra.dueMs - rb.dueMs;
        return b.blendedPriority - a.blendedPriority;
      });

      const queued = enriched.slice(0, limit);

      // Run compliance scrub in parallel
      const scrubbed = await Promise.all(
        queued.map(async (lead) => {
          const phone = lead.properties?.owner_phone;
          if (!phone) return { ...lead, compliant: true, scrubbing: false };

          if (ghostMode) return { ...lead, compliant: true, scrubbing: false };

          try {
            const result = await scrubLeadClient(phone);
            return { ...lead, compliant: result.allowed, scrubbing: false };
          } catch {
            return { ...lead, compliant: true, scrubbing: false };
          }
        })
      );

      setQueue(scrubbed);
    } catch (err) {
      console.error("[DialerQueue] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, ghostMode, limit]);

  useEffect(() => {
    fetchQueue();

    const channel = supabase
      .channel("dialer-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchQueue())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchQueue]);

  return { queue, loading, refetch: fetchQueue };
}

export function useAutoCycleQueue(limit = 12) {
  const [queue, setQueue] = useState<AutoCycleQueueLead[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, ghostMode } = useSentinelStore();

  const fetchQueue = useCallback(async () => {
    if (!currentUser.id) return;
    try {
      setLoading(true);
      const hdrs = await dialerAuthHeaders();
      const res = await fetch(`/api/dialer/v1/auto-cycle?limit=${limit}`, { headers: hdrs });
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json() as {
        items?: Array<{
          lead: QueueLead;
          auto_cycle: AutoCycleLeadState;
          phones: AutoCyclePhoneState[];
        }>;
      };

      const rows = (data.items ?? []).map(({ lead, auto_cycle, phones }) => ({
        ...lead,
        predictiveScore: null,
        blendedPriority: lead.priority,
        autoCycle: auto_cycle,
        autoCyclePhones: phones,
      }));

      const scrubbed = await Promise.all(
        rows.map(async (lead) => {
          const nextPhone = lead.autoCyclePhones.find((phone) => phone.phoneId === lead.autoCycle.nextPhoneId)
            ?? lead.autoCyclePhones.find((phone) => phone.phoneStatus === "active")
            ?? null;
          const phone = nextPhone?.phone ?? lead.properties?.owner_phone;
          if (!phone || ghostMode) return { ...lead, compliant: true, scrubbing: false };
          try {
            const result = await scrubLeadClient(phone);
            return { ...lead, compliant: result.allowed, scrubbing: false };
          } catch {
            return { ...lead, compliant: true, scrubbing: false };
          }
        }),
      );

      setQueue(scrubbed);
    } catch (err) {
      console.error("[AutoCycleQueue] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, ghostMode, limit]);

  useEffect(() => {
    fetchQueue();

    const channel = supabase
      .channel("auto-cycle-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "dialer_auto_cycle_leads" }, () => fetchQueue())
      .on("postgres_changes", { event: "*", schema: "public", table: "dialer_auto_cycle_phones" }, () => fetchQueue())
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchQueue())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchQueue]);

  return { queue, loading, refetch: fetchQueue };
}

// ── Dialer Stats Hook ─────────────────────────────────────────────────

export interface DialerKpiSelection {
  preset: DialerKpiPreset;
  from?: string | null;
  to?: string | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Supabase query timed out")), ms),
    ),
  ]);
}

const EMPTY_KPI_SNAPSHOT: DialerKpiSnapshot = {
  range: { preset: "today", from: null, to: null },
  metrics: {
    outbound: { user: 0, team: 0 },
    pickups: { user: 0, team: 0 },
    inbound: { user: 0, team: 0 },
    missedCalls: { user: 0, team: 0 },
    talkTimeSec: { user: 0, team: 0 },
  },
};

export async function fetchDialerKpis(
  selection: DialerKpiSelection,
): Promise<DialerKpiSnapshot> {
  try {
    const headers = await dialerAuthHeaders();
    const params = new URLSearchParams();
    params.set("preset", selection.preset);
    if (selection.from) params.set("from", selection.from);
    if (selection.to) params.set("to", selection.to);

    const response = await withTimeout(
      fetch(`/api/dialer/v1/kpis?${params.toString()}`, { headers }),
      8_000,
    );

    if (!response.ok) {
      throw new Error(`Dialer KPI request failed (${response.status})`);
    }

    return await response.json() as DialerKpiSnapshot;
  } catch (err) {
    console.error("[DialerKpis] Failed to fetch stats:", err);
    return { ...EMPTY_KPI_SNAPSHOT, range: { ...EMPTY_KPI_SNAPSHOT.range, preset: selection.preset } };
  }
}

export function useDialerKpis(selection: DialerKpiSelection) {
  const [snapshot, setSnapshot] = useState<DialerKpiSnapshot>({
    ...EMPTY_KPI_SNAPSHOT,
    range: {
      preset: selection.preset,
      from: selection.from ?? null,
      to: selection.to ?? null,
    },
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const next = await fetchDialerKpis(selection);
      setSnapshot(next);
    } catch (err) {
      console.error("[DialerKpis] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [selection]);

  useEffect(() => {
    setLoading(true);
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    const channel = supabase
      .channel("dialer-stats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls_log" }, () => fetchStats())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls_log" }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchStats]);

  return { snapshot, loading, refetch: fetchStats };
}

// ── Call Timer Hook ───────────────────────────────────────────────────

export function useCallTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setElapsed(0);
    setRunning(true);
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setElapsed(0);
  }, [stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const formatted = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`;

  return { elapsed, formatted, running, start, stop, reset };
}
