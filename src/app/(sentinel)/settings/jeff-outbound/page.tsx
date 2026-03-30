"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, PhoneCall, Shield, PauseCircle, AlertTriangle, Activity, ListChecks, Star } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { useModal } from "@/providers/modal-provider";

type JeffSettings = {
  enabled: boolean;
  mode: "manual_only" | "hybrid_auto_redial";
  softPaused: boolean;
  emergencyHalt: boolean;
  dailyMaxCalls: number;
  perRunMaxCalls: number;
  businessHoursOnly: boolean;
  allowedStartHour: number;
  allowedEndHour: number;
  qualityReviewEnabled: boolean;
  policyVersion: string;
  notes: string | null;
};

type JeffQueueRow = {
  id: string;
  leadId: string;
  selectedPhone: string | null;
  queueTier: "eligible" | "active" | "auto";
  queueStatus: "active" | "paused" | "removed";
  approvedAt: string;
  lastCallStatus: string | null;
  lastCalledAt: string | null;
  lead?: {
    status: string | null;
    assigned_to: string | null;
    properties?: {
      owner_name?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
    } | null;
  } | null;
};

type JeffKpis = {
  attempts: number;
  liveAnswers: number;
  transferAttempts: number;
  successfulTransfers: number;
  callbackRequests: number;
  machineEnds: number;
  totalCostCents: number;
  averageDurationSec: number;
  costPerSuccessfulTransferCents: number | null;
  callbackRate: number;
  answerRate: number;
  qualityReviewPassRate: number | null;
};

type JeffReview = {
  id: string;
  voice_session_id: string;
  review_tags: string[];
  score: number | null;
  notes: string | null;
  created_at: string;
};

type JeffActivity = {
  window: string;
  since: string;
  until?: string | null;
  autoRedialEnabled: boolean;
  autoRedialMode: string;
  totalOutboundCalls: number;
  statusBreakdown: Record<string, number>;
  topLeadsByCallCount: Array<{ leadId: string; count: number }>;
  recentSessions: Array<{
    id: string;
    leadId: string | null;
    ownerName: string | null;
    address: string | null;
    status: string;
    createdAt: string | null;
    endedAt: string | null;
    durationSeconds: number | null;
    costCents: number | null;
    transferredTo: string | null;
    transferReason: string | null;
    callbackRequested: boolean;
  }>;
  autoCycle: {
    activeLeads: number;
    activePhones: number;
    overduePhones: number;
    pausedPhones: number;
    pausedDetails: Array<{
      id: string;
      leadId: string;
      consecutiveFailures: number;
      exitReason: string | null;
    }>;
  };
  alerts: {
    excessiveCalls: boolean;
    anyLeadOver50Calls: boolean;
    pausedPhonesExist: boolean;
    overduePhonesPiling: boolean;
  };
};

type JeffInteraction = {
  id: string;
  lead_id: string | null;
  interaction_type: string;
  status: "needs_review" | "task_open" | "reviewed" | "resolved";
  summary: string | null;
  callback_requested: boolean;
  callback_due_at: string | null;
  callback_timing_text: string | null;
  transfer_outcome: string | null;
  voice_session_id: string;
  task_id: string | null;
  lead?: {
    id: string;
    status: string | null;
    assigned_to: string | null;
    properties?: {
      owner_name?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
    } | null;
  } | null;
  task?: {
    id: string;
    title: string | null;
    status: string | null;
    due_at: string | null;
    task_type: string | null;
  } | null;
};

type ReviewDraft = {
  score: string;
  notes: string;
  tags: string[];
};

type JeffRangePreset = "today" | "week" | "month" | "year" | "all";

const JEFF_REVIEW_TAG_OPTIONS = [
  "great opener",
  "weak opener",
  "good label",
  "awkward label",
  "good transfer timing",
  "transferred too early",
  "transferred too late",
  "too robotic",
  "too pushy",
  "wrong target",
  "callback captured well",
  "missed callback opportunity",
] as const;

const JEFF_QUICK_REVIEW_PRESETS: Array<{
  label: string;
  score: string;
  tags: string[];
  notes: string;
}> = [
  {
    label: "Great transfer",
    score: "5",
    tags: ["great opener", "good transfer timing"],
    notes: "Jeff opened well and handed off at the right time.",
  },
  {
    label: "Weak transfer",
    score: "2",
    tags: ["transferred too early"],
    notes: "Jeff moved too quickly into transfer before enough seller clarity.",
  },
  {
    label: "Too robotic",
    score: "2",
    tags: ["too robotic"],
    notes: "Jeff sounded too scripted and needs a more natural seller rhythm.",
  },
  {
    label: "Wrong target",
    score: "1",
    tags: ["wrong target"],
    notes: "This reached the wrong person or a bad lead target.",
  },
  {
    label: "Callback miss",
    score: "2",
    tags: ["missed callback opportunity"],
    notes: "Jeff should have captured a clearer callback instead of letting the call fade.",
  },
];

function createEmptyReviewDraft(): ReviewDraft {
  return {
    score: "4",
    notes: "",
    tags: [],
  };
}

function formatCurrency(cents: number | null) {
  if (cents == null) return "-";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPercent(value: number | null) {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.max(0, seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "unknown";
  return new Date(value).toLocaleString();
}

function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildJeffRange(preset: JeffRangePreset) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (preset === "week") {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
  } else if (preset === "month") {
    start.setDate(1);
  } else if (preset === "year") {
    start.setMonth(0, 1);
  } else if (preset === "all") {
    start.setFullYear(now.getFullYear() - 5);
  }

  return {
    from: formatDateInputValue(start),
    to: formatDateInputValue(now),
  };
}

export default function JeffOutboundPage() {
  const { openModal } = useModal();
  const [settings, setSettings] = useState<JeffSettings | null>(null);
  const [canControl, setCanControl] = useState(false);
  const [queue, setQueue] = useState<JeffQueueRow[]>([]);
  const [kpis, setKpis] = useState<JeffKpis | null>(null);
  const [reviews, setReviews] = useState<JeffReview[]>([]);
  const [interactions, setInteractions] = useState<JeffInteraction[]>([]);
  const [activity, setActivity] = useState<JeffActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [launchingQueue, setLaunchingQueue] = useState(false);
  const [leadIdsDraft, setLeadIdsDraft] = useState("");
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<JeffRangePreset>("today");
  const [rangeFrom, setRangeFrom] = useState(() => buildJeffRange("today").from);
  const [rangeTo, setRangeTo] = useState(() => buildJeffRange("today").to);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await sentinelAuthHeaders(false);
      const rangeParams = new URLSearchParams({
        from: new Date(`${rangeFrom}T00:00:00`).toISOString(),
        to: new Date(`${rangeTo}T23:59:59.999`).toISOString(),
      });
      const [controlRes, queueRes, kpiRes, reviewRes, activityRes, interactionRes] = await Promise.all([
        fetch("/api/voice/jeff/control", { headers, cache: "no-store" }),
        fetch("/api/voice/jeff/queue", { headers, cache: "no-store" }),
        fetch(`/api/voice/jeff/kpis?${rangeParams}`, { headers, cache: "no-store" }),
        fetch("/api/voice/jeff/reviews?limit=20", { headers, cache: "no-store" }),
        fetch(`/api/voice/jeff-activity?${rangeParams}`, { headers, cache: "no-store" }),
        fetch("/api/voice/jeff/interactions?unresolvedOnly=true&limit=20", { headers, cache: "no-store" }),
      ]);

      const controlJson = await controlRes.json();
      const queueJson = await queueRes.json();
      const kpiJson = await kpiRes.json();
      const reviewJson = await reviewRes.json();
      const activityJson = await activityRes.json();
      const interactionJson = await interactionRes.json();

      if (!controlRes.ok) throw new Error(controlJson.error ?? "Failed to load Jeff control");
      setSettings(controlJson.settings);
      setCanControl(Boolean(controlJson.canControl));
      setQueue(queueJson.queue ?? []);
      setKpis(kpiJson.kpis ?? null);
      setReviews(reviewJson.reviews ?? []);
      setActivity(activityJson ?? null);
      setInteractions(interactionJson.interactions ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Jeff control center");
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshJeffFeedback = useCallback(async () => {
    const headers = await sentinelAuthHeaders(false);
    const rangeParams = new URLSearchParams({
      from: new Date(`${rangeFrom}T00:00:00`).toISOString(),
      to: new Date(`${rangeTo}T23:59:59.999`).toISOString(),
    });
    const [kpiRes, reviewRes, interactionRes] = await Promise.all([
      fetch(`/api/voice/jeff/kpis?${rangeParams}`, { headers, cache: "no-store" }),
      fetch("/api/voice/jeff/reviews?limit=20", { headers, cache: "no-store" }),
      fetch("/api/voice/jeff/interactions?unresolvedOnly=true&limit=20", { headers, cache: "no-store" }),
    ]);

    const kpiJson = await kpiRes.json();
    const reviewJson = await reviewRes.json();
    const interactionJson = await interactionRes.json();

    if (!kpiRes.ok) throw new Error(kpiJson.error ?? "Failed to refresh Jeff KPIs");
    if (!reviewRes.ok) throw new Error(reviewJson.error ?? "Failed to refresh Jeff reviews");
    if (!interactionRes.ok) throw new Error(interactionJson.error ?? "Failed to refresh Jeff interactions");

    setKpis(kpiJson.kpis ?? null);
    setReviews(reviewJson.reviews ?? []);
    setInteractions(interactionJson.interactions ?? []);
  }, [rangeFrom, rangeTo]);

  const applyRangePreset = useCallback((preset: JeffRangePreset) => {
    const next = buildJeffRange(preset);
    setRangePreset(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
  }, []);

  const saveSettings = useCallback(async (patch: Partial<JeffSettings>) => {
    if (!canControl || !settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      const res = await fetch("/api/voice/jeff/control", {
        method: "PATCH",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save Jeff settings");
      setSettings(json.settings);
      toast.success("Jeff controls updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Jeff settings");
      await load();
    } finally {
      setSaving(false);
    }
  }, [canControl, load, settings]);

  const addQueueLeads = useCallback(async () => {
    const leadIds = leadIdsDraft.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
    if (!leadIds.length) return;
    try {
      const res = await fetch("/api/voice/jeff/queue", {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({ leadIds, queueTier: "active" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add Jeff queue leads");
      setQueue(json.queue ?? []);
      setLeadIdsDraft("");
      toast.success(`Added ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} to Jeff queue`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add Jeff queue leads");
    }
  }, [leadIdsDraft]);

  const updateQueue = useCallback(async (leadId: string, patch: Partial<JeffQueueRow>) => {
    try {
      const res = await fetch("/api/voice/jeff/queue", {
        method: "PATCH",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({
          leadId,
          queueTier: patch.queueTier,
          queueStatus: patch.queueStatus,
          selectedPhone: patch.selectedPhone,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update Jeff queue");
      setQueue(json.queue ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update Jeff queue");
    }
  }, []);

  const callableQueue = useMemo(
    () => queue.filter((row) => row.queueStatus === "active" && (row.queueTier === "active" || row.queueTier === "auto")),
    [queue],
  );

  const blockedQueue = useMemo(
    () => queue.filter((row) => row.queueStatus !== "active" || row.queueTier === "eligible"),
    [queue],
  );

  const reviewStateBySession = useMemo(() => {
    const map = new Map<string, { score: number | null; tags: string[] }>();
    for (const review of reviews) {
      map.set(review.voice_session_id, {
        score: review.score ?? null,
        tags: review.review_tags ?? [],
      });
    }
    return map;
  }, [reviews]);

  const recentReviewSummary = useMemo(() => {
    const sessions = activity?.recentSessions ?? [];
    let needsReview = 0;
    let weakReview = 0;

    for (const session of sessions) {
      const review = reviewStateBySession.get(session.id);
      if (!review) {
        needsReview += 1;
        continue;
      }
      if (review.score != null && review.score < 4) {
        weakReview += 1;
      }
    }

    return { needsReview, weakReview };
  }, [activity, reviewStateBySession]);

  const updateReviewDraft = useCallback((sessionId: string, patch: Partial<ReviewDraft>) => {
    setReviewDrafts((current) => ({
      ...current,
      [sessionId]: {
        ...(current[sessionId] ?? createEmptyReviewDraft()),
        ...patch,
      },
    }));
  }, []);

  const toggleReviewTag = useCallback((sessionId: string, tag: string) => {
    setReviewDrafts((current) => {
      const existing = current[sessionId] ?? createEmptyReviewDraft();
      const hasTag = existing.tags.includes(tag);
      return {
        ...current,
        [sessionId]: {
          ...existing,
          tags: hasTag ? existing.tags.filter((value) => value !== tag) : [...existing.tags, tag],
        },
      };
    });
  }, []);

  const saveReview = useCallback(async (sessionId: string, override?: Partial<ReviewDraft>) => {
    if (!canControl) return;

    const baseDraft = reviewDrafts[sessionId] ?? createEmptyReviewDraft();
    const draft: ReviewDraft = {
      ...baseDraft,
      ...override,
      tags: override?.tags ?? baseDraft.tags,
    };

    setSavingReviewId(sessionId);
    try {
      const res = await fetch("/api/voice/jeff/reviews", {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({
          voiceSessionId: sessionId,
          reviewTags: draft.tags,
          score: Number(draft.score),
          notes: draft.notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save Jeff review");

      await refreshJeffFeedback();
      setReviewDrafts((current) => ({
        ...current,
        [sessionId]: draft,
      }));
      toast.success("Jeff review saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Jeff review");
    } finally {
      setSavingReviewId(null);
    }
  }, [canControl, refreshJeffFeedback, reviewDrafts]);

  const launchJeffQueue = useCallback(async () => {
    if (!settings || !canControl) return;
    const leadIds = callableQueue.slice(0, settings.perRunMaxCalls).map((row) => row.leadId);
    if (leadIds.length === 0) {
      toast.error("No callable Jeff leads are active right now");
      return;
    }

    setLaunchingQueue(true);
    try {
      const res = await fetch("/api/voice/vapi/outbound/batch", {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({ leadIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to launch Jeff queue");

      const skipped = Array.isArray(json.skipped) ? json.skipped.length : 0;
      const queued = typeof json.queued === "number" ? json.queued : leadIds.length - skipped;
      if (queued > 0) {
        toast.success(`Jeff launched ${queued} lead${queued === 1 ? "" : "s"}`);
      }
      if (skipped > 0) {
        toast.warning(`${skipped} lead${skipped === 1 ? "" : "s"} skipped during launch`);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to launch Jeff queue");
    } finally {
      setLaunchingQueue(false);
    }
  }, [callableQueue, canControl, load, settings]);

  const updateInteractionStatus = useCallback(async (interactionId: string, status: JeffInteraction["status"]) => {
    const res = await fetch("/api/voice/jeff/interactions", {
      method: "PATCH",
      headers: await sentinelAuthHeaders(),
      body: JSON.stringify({ id: interactionId, status }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error ?? "Failed to update Jeff interaction");
    }
    await refreshJeffFeedback();
  }, [refreshJeffFeedback]);

  const statusBadge = useMemo(() => {
    if (!settings) return null;
    if (settings.emergencyHalt) return <Badge variant="destructive">Emergency Halt</Badge>;
    if (!settings.enabled) return <Badge variant="secondary">Stopped</Badge>;
    if (settings.softPaused) return <Badge variant="outline">Paused</Badge>;
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
        {settings.mode === "hybrid_auto_redial" ? "Hybrid Auto-Redial" : "Manual Only"}
      </Badge>
    );
  }, [settings]);

  return (
    <PageShell title="Jeff Outbound" description="Adam-controlled outbound leverage system for Dominion">
      <div className="mb-4">
        <Link href="/settings" className="text-sm text-muted-foreground hover:text-primary transition-colors">
          Back to settings
        </Link>
      </div>

      {loading || !settings ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Jeff control center...
        </GlassCard>
      ) : (
        <div className="space-y-6">
          <GlassCard hover={false} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <PhoneCall className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Jeff control center</h2>
                  {statusBadge}
                </div>
                <p className="text-sm text-muted-foreground/70">
                  Jeff exists to create more qualified seller conversations per founder-hour. He should open, discover lightly, use seller memory, and hand off fast.
                </p>
              </div>
              <div className="text-xs text-muted-foreground/60">
                Policy {settings.policyVersion}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/leads" className="rounded-[10px] border border-primary/20 bg-primary/8 px-3 py-1.5 text-primary hover:bg-primary/12 transition-colors">
                Lead Queue
              </Link>
              <Link href="/dialer" className="rounded-[10px] border border-border/20 bg-muted/5 px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
                Dialer Visibility
              </Link>
              <Link href="/settings/outbound-pilot" className="rounded-[10px] border border-border/20 bg-muted/5 px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
                Prep & Readiness
              </Link>
              <span className="rounded-[10px] border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-amber-100">
                {recentReviewSummary.needsReview} need review
              </span>
              <span className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-red-100">
                {recentReviewSummary.weakReview} weak
              </span>
            </div>

            {!canControl && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                View only. Jeff controls are locked to Adam.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="rounded-xl border border-border/20 bg-muted/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  Jeff enabled
                </div>
                <Button
                  disabled={!canControl || saving}
                  variant={settings.enabled ? "secondary" : "default"}
                  onClick={() => saveSettings({ enabled: !settings.enabled })}
                  className="w-full"
                >
                  {settings.enabled ? "Stop Jeff" : "Start Jeff"}
                </Button>
              </label>

              <label className="rounded-xl border border-border/20 bg-muted/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <PauseCircle className="h-4 w-4 text-primary" />
                  Pause new calls
                </div>
                <Button
                  disabled={!canControl || saving}
                  variant="secondary"
                  onClick={() => saveSettings({ softPaused: !settings.softPaused })}
                  className="w-full"
                >
                  {settings.softPaused ? "Resume Jeff" : "Pause Jeff"}
                </Button>
              </label>

              <label className="rounded-xl border border-border/20 bg-muted/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Emergency halt
                </div>
                <Button
                  disabled={!canControl || saving}
                  variant={settings.emergencyHalt ? "destructive" : "secondary"}
                  onClick={() => saveSettings({ emergencyHalt: !settings.emergencyHalt })}
                  className="w-full"
                >
                  {settings.emergencyHalt ? "Clear Halt" : "Emergency Halt"}
                </Button>
              </label>

              <label className="rounded-xl border border-border/20 bg-muted/5 p-3">
                <div className="mb-2 text-sm font-medium">Mode</div>
                <select
                  className="w-full rounded-md border border-overlay-10 bg-overlay-4 px-3 py-2 text-sm"
                  value={settings.mode}
                  disabled={!canControl || saving}
                  onChange={(event) => saveSettings({ mode: event.target.value as JeffSettings["mode"] })}
                >
                  <option value="manual_only">Manual only</option>
                  <option value="hybrid_auto_redial">Hybrid auto-redial</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">Daily max calls</span>
                <Input
                  type="number"
                  disabled={!canControl || saving}
                  value={settings.dailyMaxCalls}
                  onChange={(event) => saveSettings({ dailyMaxCalls: Number(event.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">Per-run max</span>
                <Input
                  type="number"
                  disabled={!canControl || saving}
                  value={settings.perRunMaxCalls}
                  onChange={(event) => saveSettings({ perRunMaxCalls: Number(event.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">Start hour</span>
                <Input
                  type="number"
                  disabled={!canControl || saving}
                  value={settings.allowedStartHour}
                  onChange={(event) => saveSettings({ allowedStartHour: Number(event.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">End hour</span>
                <Input
                  type="number"
                  disabled={!canControl || saving}
                  value={settings.allowedEndHour}
                  onChange={(event) => saveSettings({ allowedEndHour: Number(event.target.value) })}
                />
              </label>
            </div>
          </GlassCard>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <GlassCard hover={false} className="xl:col-span-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Jeff KPI snapshot</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(["today", "week", "month", "year", "all"] as JeffRangePreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyRangePreset(preset)}
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide transition-colors ${
                        rangePreset === preset
                          ? "border-primary/40 bg-primary/12 text-primary"
                          : "border-border/20 bg-muted/5 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {preset === "all" ? "All time" : preset}
                    </button>
                  ))}
                  <Input
                    type="date"
                    value={rangeFrom}
                    onChange={(event) => {
                      setRangePreset("all");
                      setRangeFrom(event.target.value);
                    }}
                    className="h-8 w-[150px]"
                  />
                  <Input
                    type="date"
                    value={rangeTo}
                    onChange={(event) => {
                      setRangePreset("all");
                      setRangeTo(event.target.value);
                    }}
                    className="h-8 w-[150px]"
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground/60">
                Showing {rangeFrom} through {rangeTo}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  { label: "Attempts", value: kpis?.attempts ?? 0 },
                  { label: "Live Answers", value: kpis?.liveAnswers ?? 0 },
                  { label: "Transfers", value: kpis?.successfulTransfers ?? 0 },
                  { label: "Callbacks", value: kpis?.callbackRequests ?? 0 },
                  { label: "Avg Duration", value: formatDuration(kpis?.averageDurationSec ?? 0) },
                  { label: "Answer Rate", value: formatPercent(kpis?.answerRate ?? 0) },
                  { label: "Callback Rate", value: formatPercent(kpis?.callbackRate ?? 0) },
                  { label: "Quality Pass", value: formatPercent(kpis?.qualityReviewPassRate ?? null) },
                  { label: "Total Cost", value: formatCurrency(kpis?.totalCostCents ?? 0) },
                  { label: "Cost / Transfer", value: formatCurrency(kpis?.costPerSuccessfulTransferCents ?? null) },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-border/15 bg-muted/5 p-3">
                    <div className="text-lg font-semibold">{metric.value}</div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground/60">{metric.label}</div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard hover={false} className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Quality loop</h3>
              </div>
              <p className="text-sm text-muted-foreground/70">
                Jeff should sound skilled, not manipulative. Review for transfer timing, good labels, weak openers, and callback misses.
              </p>
              <div className="space-y-2">
                {reviews.slice(0, 5).map((review) => (
                  <div key={review.id} className="rounded-xl border border-border/15 bg-muted/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-foreground">Session {review.voice_session_id.slice(0, 8)}</div>
                      <Badge variant="outline">{review.score ?? "-"}/5</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(review.review_tags ?? []).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    {review.notes ? <p className="mt-2 text-xs text-muted-foreground/70">{review.notes}</p> : null}
                  </div>
                ))}
                {reviews.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/20 p-4 text-sm text-muted-foreground/70">
                    No Jeff quality reviews yet.
                  </div>
                ) : null}
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <GlassCard hover={false} className="xl:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Jeff follow-up triage</h3>
                <Badge variant="outline">{interactions.length} open</Badge>
              </div>
              <p className="text-sm text-muted-foreground/70">
                This is Jeff’s review layer, not a second callback queue. Tasks stay the human action inbox; this list keeps the AI handoff context tied to the right seller file.
              </p>
              <div className="space-y-2">
                {interactions.length ? interactions.map((interaction) => (
                  <div key={interaction.id} className="rounded-xl border border-border/15 bg-muted/5 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">
                          {interaction.lead?.properties?.owner_name ?? (interaction.lead_id ? `Lead ${interaction.lead_id.slice(0, 8)}` : "Unknown lead")}
                        </div>
                        <div className="text-xs text-muted-foreground/60">
                          {interaction.lead?.properties?.address ?? "Address unavailable"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{interaction.interaction_type.replace(/_/g, " ")}</Badge>
                        <Badge variant="secondary">{interaction.status.replace(/_/g, " ")}</Badge>
                      </div>
                    </div>
                    {interaction.summary ? (
                      <p className="mt-2 text-sm text-foreground/85 leading-relaxed">{interaction.summary}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground/70">
                      {interaction.callback_due_at ? <span>Due {formatDateTime(interaction.callback_due_at)}</span> : null}
                      {interaction.callback_timing_text ? <span>Asked for {interaction.callback_timing_text}</span> : null}
                      {interaction.transfer_outcome ? <span>{interaction.transfer_outcome.replace(/_/g, " ")}</span> : null}
                      {interaction.task?.id ? <span>Task {interaction.task.status ?? "pending"}</span> : <span>No task linked</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {interaction.lead_id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => openModal("client-file", { leadId: interaction.lead_id })}
                        >
                          Open client file
                        </Button>
                      ) : null}
                      {interaction.task?.id ? (
                        <Link
                          href="/tasks"
                          className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20"
                        >
                          Open task
                        </Link>
                      ) : null}
                      {interaction.status !== "reviewed" && interaction.status !== "resolved" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => updateInteractionStatus(interaction.id, "reviewed").catch((error) => {
                            toast.error(error instanceof Error ? error.message : "Failed to mark reviewed");
                          })}
                        >
                          Mark reviewed
                        </Button>
                      ) : null}
                      {interaction.status !== "resolved" && !interaction.task?.id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateInteractionStatus(interaction.id, "resolved").catch((error) => {
                            toast.error(error instanceof Error ? error.message : "Failed to resolve Jeff interaction");
                          })}
                        >
                          Resolve
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-border/20 p-4 text-sm text-muted-foreground/70">
                    No unresolved Jeff interactions in this window.
                  </div>
                )}
              </div>
            </GlassCard>

            <GlassCard hover={false} className="xl:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Recent Jeff activity</h3>
                <Badge variant="outline">{activity?.window ?? "24h"}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-border/15 bg-muted/5 p-3">
                  <div className="text-lg font-semibold">{activity?.totalOutboundCalls ?? 0}</div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground/60">Outbound Calls</div>
                </div>
                <div className="rounded-xl border border-border/15 bg-muted/5 p-3">
                  <div className="text-lg font-semibold">{activity?.autoCycle.activeLeads ?? 0}</div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground/60">Auto Leads</div>
                </div>
                <div className="rounded-xl border border-border/15 bg-muted/5 p-3">
                  <div className="text-lg font-semibold">{activity?.autoCycle.overduePhones ?? 0}</div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground/60">Overdue Phones</div>
                </div>
                <div className="rounded-xl border border-border/15 bg-muted/5 p-3">
                  <div className="text-lg font-semibold">{activity?.autoCycle.pausedPhones ?? 0}</div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground/60">Paused Phones</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/15 bg-muted/5 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">Status Breakdown</div>
                  <div className="space-y-2">
                    {activity && Object.keys(activity.statusBreakdown).length > 0 ? (
                      Object.entries(activity.statusBreakdown).map(([status, count]) => (
                        <div key={status} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground/70">{status}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground/60">No Jeff call activity yet.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border/15 bg-muted/5 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">Most-Called Leads</div>
                  <div className="space-y-2">
                    {activity?.topLeadsByCallCount?.length ? (
                      activity.topLeadsByCallCount.map((lead) => (
                        <div key={lead.leadId} className="flex items-center justify-between text-sm">
                          <span className="font-mono text-muted-foreground/70">{lead.leadId.slice(0, 8)}</span>
                          <span className="font-medium">{lead.count} calls</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground/60">No repeated Jeff leads in this window.</div>
                    )}
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard hover={false} className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Health alerts</h3>
              </div>
              <div className="space-y-2">
                {activity?.alerts.excessiveCalls ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                    Jeff volume is unusually high for this window.
                  </div>
                ) : null}
                {activity?.alerts.anyLeadOver50Calls ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                    At least one lead has been called more than 50 times in this window.
                  </div>
                ) : null}
                {activity?.alerts.pausedPhonesExist ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                    Some auto phones are paused from repeated failures.
                  </div>
                ) : null}
                {activity?.alerts.overduePhonesPiling ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                    Overdue auto phones are piling up.
                  </div>
                ) : null}
                {!activity?.alerts.excessiveCalls && !activity?.alerts.anyLeadOver50Calls && !activity?.alerts.pausedPhonesExist && !activity?.alerts.overduePhonesPiling ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    No current Jeff health alerts in the selected window.
                  </div>
                ) : null}
              </div>
              {activity?.autoCycle.pausedDetails?.length ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">Paused Phone Details</div>
                  {activity.autoCycle.pausedDetails.slice(0, 4).map((phone) => (
                    <div key={phone.id} className="rounded-xl border border-border/15 bg-muted/5 p-3 text-sm">
                      <div className="font-mono text-muted-foreground/70">{phone.leadId.slice(0, 8)}</div>
                      <div className="mt-1 text-muted-foreground/70">{phone.exitReason ?? "unknown exit"}</div>
                      <div className="mt-1 text-xs text-muted-foreground/60">{phone.consecutiveFailures} consecutive failures</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </GlassCard>
          </div>

          <GlassCard hover={false} className="space-y-3">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Recent call outcomes</h3>
              <Badge variant="outline">{activity?.recentSessions?.length ?? 0} shown</Badge>
            </div>
            <p className="text-sm text-muted-foreground/70">
              Launch Jeff here, then use this feed to spot weak transfers, callback misses, and unexpected call states right away.
            </p>
            <div className="space-y-2">
              {activity?.recentSessions?.length ? (
                activity.recentSessions.map((session) => {
                  const existingReview = reviewStateBySession.get(session.id);
                  const reviewDraft = reviewDrafts[session.id] ?? {
                    score: existingReview?.score != null ? String(existingReview.score) : "4",
                    notes: "",
                    tags: existingReview?.tags ?? [],
                  };

                  return (
                  <div key={session.id} className="rounded-xl border border-border/15 bg-muted/5 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">
                          {session.ownerName ?? (session.leadId ? `Lead ${session.leadId.slice(0, 8)}` : "Unknown lead")}
                        </div>
                        <div className="text-xs text-muted-foreground/60">
                          {session.address ?? "Address unavailable"}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{session.status}</Badge>
                        {!reviewStateBySession.has(session.id) ? (
                          <Badge variant="secondary" className="border-amber-500/30 bg-amber-500/10 text-amber-200">
                            Needs review
                          </Badge>
                        ) : reviewStateBySession.get(session.id)?.score != null && (reviewStateBySession.get(session.id)?.score ?? 0) < 4 ? (
                          <Badge variant="secondary" className="border-red-500/30 bg-red-500/10 text-red-200">
                            Weak review
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                            Reviewed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground/70">
                      <span>Started {formatDateTime(session.createdAt)}</span>
                      <span>Duration {formatDuration(session.durationSeconds ?? 0)}</span>
                      <span>Cost {formatCurrency(session.costCents ?? 0)}</span>
                      {session.transferredTo ? <span>Transferred</span> : null}
                      {session.callbackRequested ? <span>Callback requested</span> : null}
                    </div>
                    {session.transferReason ? (
                      <div className="mt-2 text-xs text-emerald-200/80">
                        Transfer reason: {session.transferReason}
                      </div>
                    ) : null}
                    {reviewStateBySession.get(session.id)?.tags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {reviewStateBySession.get(session.id)!.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {canControl ? (
                      <div className="mt-3 rounded-xl border border-border/10 bg-background/20 p-3">
                        <div className="flex flex-wrap gap-2">
                          {JEFF_QUICK_REVIEW_PRESETS.map((preset) => (
                            <Button
                              key={preset.label}
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={savingReviewId === session.id}
                              onClick={() => saveReview(session.id, {
                                score: preset.score,
                                tags: preset.tags,
                                notes: preset.notes,
                              })}
                            >
                              {preset.label}
                            </Button>
                          ))}
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-[120px,1fr]">
                          <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Score</span>
                            <select
                              value={reviewDraft.score}
                              onChange={(event) => updateReviewDraft(session.id, { score: event.target.value })}
                              className="w-full rounded-md border border-overlay-10 bg-overlay-4 px-2 py-2 text-sm"
                              disabled={savingReviewId === session.id}
                            >
                              <option value="5">5</option>
                              <option value="4">4</option>
                              <option value="3">3</option>
                              <option value="2">2</option>
                              <option value="1">1</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Review note</span>
                            <Textarea
                              value={reviewDraft.notes}
                              onChange={(event) => updateReviewDraft(session.id, { notes: event.target.value })}
                              placeholder="Why was this strong or weak?"
                              rows={2}
                              disabled={savingReviewId === session.id}
                            />
                          </label>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {JEFF_REVIEW_TAG_OPTIONS.map((tag) => {
                            const selected = reviewDraft.tags.includes(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                disabled={savingReviewId === session.id}
                                onClick={() => toggleReviewTag(session.id, tag)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                                  selected
                                    ? "border-primary/40 bg-primary/12 text-primary"
                                    : "border-border/20 bg-muted/5 text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled={savingReviewId === session.id}
                            onClick={() => saveReview(session.id)}
                          >
                            {savingReviewId === session.id ? (
                              <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving review...
                              </span>
                            ) : (
                              "Save review"
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )})
              ) : (
                <div className="rounded-xl border border-dashed border-border/20 p-4 text-sm text-muted-foreground/70">
                  No recent Jeff call outcomes yet.
                </div>
              )}
            </div>
          </GlassCard>

          <GlassCard hover={false} className="space-y-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Jeff queue</h3>
            </div>
            <p className="text-sm text-muted-foreground/70">
              `eligible` means Jeff can be used manually. `active` means Jeff can work the supervised queue. `auto` means Jeff can be touched by auto-redial.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Best workflow: pick the right seller leads in Lead Queue and use `Add to Jeff Queue`. This page is where Adam governs the queue once those leads are promoted.
            </p>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/15 bg-muted/5 p-3">
              <div className="rounded-lg border border-border/15 bg-background/20 px-3 py-2">
                <div className="text-lg font-semibold">{callableQueue.length}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Callable now</div>
              </div>
              <div className="rounded-lg border border-border/15 bg-background/20 px-3 py-2">
                <div className="text-lg font-semibold">{blockedQueue.length}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Blocked</div>
              </div>
              <div className="text-xs text-muted-foreground/60">
                Jeff will launch up to {settings.perRunMaxCalls} active queue lead{settings.perRunMaxCalls === 1 ? "" : "s"} per run.
              </div>
              {canControl ? (
                <Button
                  onClick={launchJeffQueue}
                  disabled={launchingQueue || callableQueue.length === 0}
                  className="ml-auto"
                >
                  {launchingQueue ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Launching...
                    </span>
                  ) : (
                    `Launch Active Queue (${Math.min(callableQueue.length, settings.perRunMaxCalls)})`
                  )}
                </Button>
              ) : null}
            </div>

            {canControl ? (
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  value={leadIdsDraft}
                  onChange={(event) => setLeadIdsDraft(event.target.value)}
                  placeholder="Paste lead IDs separated by commas or spaces"
                />
                <Button onClick={addQueueLeads}>Add to Jeff Queue</Button>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-border/15">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/5 text-xs uppercase tracking-wide text-muted-foreground/60">
                  <tr>
                    <th className="px-3 py-2">Lead</th>
                    <th className="px-3 py-2">Tier</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Last call</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((row) => (
                    <tr key={row.id} className="border-t border-border/10">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.lead?.properties?.owner_name ?? row.leadId.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground/60">
                          {row.lead?.properties?.address ?? "Address unavailable"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {canControl ? (
                          <select
                            value={row.queueTier}
                            onChange={(event) => updateQueue(row.leadId, { queueTier: event.target.value as JeffQueueRow["queueTier"] })}
                            className="rounded-md border border-overlay-10 bg-overlay-4 px-2 py-1 text-sm"
                          >
                            <option value="eligible">eligible</option>
                            <option value="active">active</option>
                            <option value="auto">auto</option>
                          </select>
                        ) : row.queueTier}
                      </td>
                      <td className="px-3 py-2">{row.queueStatus}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground/70">
                        {row.lastCallStatus ?? "never"}{row.lastCalledAt ? ` • ${new Date(row.lastCalledAt).toLocaleString()}` : ""}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground/70">
                        {row.lead?.assigned_to ? row.lead.assigned_to.slice(0, 8) : "unassigned"}
                      </td>
                      <td className="px-3 py-2">
                        {canControl ? (
                          <Button size="sm" variant="secondary" onClick={() => updateQueue(row.leadId, { queueStatus: "removed" })}>
                            Remove
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground/70">
                        No Jeff queue entries yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard hover={false} className="space-y-2">
            <h3 className="text-sm font-semibold">Product truth</h3>
            <p className="text-sm text-muted-foreground/70">
              Jeff outbound is live-capable. This page is the operating truth. The older outbound prep page now supports prep and review, not the live on/off switch.
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/settings/outbound-pilot" className="text-primary hover:underline">
                Open outbound prep review
              </Link>
              <Link href="/dialer" className="text-primary hover:underline">
                Open dialer
              </Link>
            </div>
          </GlassCard>
        </div>
      )}
    </PageShell>
  );
}
