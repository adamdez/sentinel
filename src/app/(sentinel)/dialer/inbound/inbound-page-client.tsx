"use client";

/**
 * /dialer/inbound — Inbound Call Review & Classification
 *
 * Wires existing inbound API routes to an operator-facing surface.
 * Actions: classify caller, recover missed, dismiss, commit writeback.
 * Read-only aggregation + action buttons to existing POST routes.
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneIncoming, Phone, Users, Loader2, RefreshCw, CheckCircle2,
  XCircle, Clock, HelpCircle, MapPin, FileText, ArrowRight,
  AlertTriangle, ChevronDown, ChevronUp, User,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { InboundWritebackPanel } from "@/components/sentinel/inbound-writeback-panel";
import type { MissedInbound, UnclassifiedAnswered } from "@/app/api/dialer/v1/queue/route";
import type { InboundCallerType, InboundDisposition } from "@/lib/dialer/types";
import { INBOUND_DISPOSITIONS } from "@/lib/dialer/types";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

function formatAge(minutesAgo: number): string {
  if (minutesAgo < 2) return "just now";
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const h = Math.floor(minutesAgo / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ageSeverity(minutesAgo: number): "critical" | "warning" | "normal" {
  if (minutesAgo < 30) return "critical";
  if (minutesAgo < 240) return "warning";
  return "normal";
}

const CALLER_TYPES: InboundCallerType[] = ["seller", "buyer", "vendor", "spam", "unknown"];

const CALLER_TYPE_STYLES: Record<InboundCallerType, string> = {
  seller: "border-cyan/25 bg-cyan/[0.08] text-cyan/80",
  buyer: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400/80",
  vendor: "border-white/10 bg-white/[0.03] text-muted-foreground/50",
  spam: "border-red-500/25 bg-red-500/[0.08] text-red-400/60",
  unknown: "border-yellow-500/20 bg-yellow-500/[0.05] text-yellow-400/60",
};

const CALLER_TYPE_LABELS: Record<InboundCallerType, string> = {
  seller: "Seller",
  buyer: "Buyer",
  vendor: "Vendor",
  spam: "Spam",
  unknown: "Unknown",
};

// ── Classify form (expanded when operator clicks "Classify") ──────────────

interface ClassifyFormProps {
  eventId: string;
  fromNumber: string;
  onDone: () => void;
}

function ClassifyForm({ eventId, fromNumber, onDone }: ClassifyFormProps) {
  const [callerType, setCallerType] = useState<InboundCallerType>("seller");
  const [address, setAddress] = useState("");
  const [situation, setSituation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleClassify() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/dialer/v1/inbound/${eventId}/classify`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          caller_type: callerType,
          subject_address: address.trim() || null,
          situation_summary: situation.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Classify failed");
      }
      const data = await res.json();
      toast.success(`Classified as ${callerType}${data.task_id ? " — task created" : ""}`);
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5 p-3 border-t border-white/[0.06]">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 mb-1">
        <Phone className="h-3 w-3" />
        Classifying {fromNumber}
      </div>

      {/* Caller type chips */}
      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-wider text-muted-foreground/40">Caller type</label>
        <div className="flex flex-wrap gap-1.5">
          {CALLER_TYPES.map((ct) => (
            <button
              key={ct}
              onClick={() => setCallerType(ct)}
              className={`rounded-[6px] border px-2 py-1 text-[10px] font-medium transition-all ${
                callerType === ct
                  ? CALLER_TYPE_STYLES[ct] + " ring-1 ring-white/10"
                  : "border-white/[0.06] text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
            >
              {CALLER_TYPE_LABELS[ct]}
            </button>
          ))}
        </div>
      </div>

      {/* Subject address */}
      <div className="space-y-1">
        <label className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground/40">
          <MapPin className="h-2.5 w-2.5" /> Subject address
        </label>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Property address mentioned…"
          className="h-7 text-[11px]"
          maxLength={300}
        />
      </div>

      {/* Situation summary */}
      <div className="space-y-1">
        <label className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground/40">
          <FileText className="h-2.5 w-2.5" /> Situation / notes
        </label>
        <textarea
          value={situation || notes}
          onChange={(e) => {
            setSituation(e.target.value);
            setNotes(e.target.value);
          }}
          placeholder="Brief summary of what the caller said…"
          maxLength={500}
          rows={2}
          className="w-full resize-none rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-cyan/20"
        />
      </div>

      {err && (
        <p className="text-[10px] text-red-400/70 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {err}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleClassify}
          disabled={busy}
          className="h-7 text-[10px] px-3 bg-cyan/10 hover:bg-cyan/20 text-cyan border border-cyan/30"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
          Classify & route
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDone}
          className="h-7 text-[10px] px-2 text-muted-foreground/40"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── InboundCallCard ───────────────────────────────────────────────────────

interface InboundCallCardProps {
  item: MissedInbound | UnclassifiedAnswered;
  type: "missed" | "unclassified";
  idx: number;
  onResolved: (eventId: string) => void;
}

function InboundCallCard({ item, type, idx, onResolved }: InboundCallCardProps) {
  const [mode, setMode] = useState<"idle" | "classify" | "dismiss" | "writeback">("idle");
  const [dismissReason, setDismissReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const minutesAgo = item.minutes_ago;
  const severity = ageSeverity(minutesAgo);
  const ageLabel = formatAge(minutesAgo);
  const fromNumber = item.from_number;
  const isMissed = type === "missed";
  const missed = isMissed ? (item as MissedInbound) : null;

  async function handleRecover() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/dialer/v1/inbound/${item.event_id}/recover`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ complete_task: true }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Recover failed");
      }
      toast.success("Marked as recovered");
      onResolved(item.event_id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDismiss() {
    if (dismissReason.trim().length < 3) {
      setErr("Enter a reason (min 3 chars)");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/dialer/v1/inbound/${item.event_id}/dismiss`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ reason: dismissReason.trim() }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Dismiss failed");
      }
      toast.success("Dismissed");
      onResolved(item.event_id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 + idx * 0.03 }}
    >
      <GlassCard hover={false} className="!p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <PhoneIncoming
                className={`h-3.5 w-3.5 shrink-0 ${
                  severity === "critical" ? "text-red-400 animate-pulse" :
                  severity === "warning" ? "text-amber-400" :
                  "text-muted-foreground/60"
                }`}
              />
              <span className="text-sm font-medium">
                {fromNumber !== "unknown" ? fromNumber : "Unknown number"}
              </span>
              <span className={`text-[10px] font-medium ${
                severity === "critical" ? "text-red-400" :
                severity === "warning" ? "text-amber-400" :
                "text-muted-foreground/50"
              }`}>
                {ageLabel}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {isMissed ? (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-red-500/30 text-red-400/70">
                  Missed
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-500/30 text-amber-400/70">
                  Answered — not classified
                </Badge>
              )}
              {item.lead_id ? (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-cyan/60 border-cyan/20">
                  Lead matched
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground/40">
                  No lead match
                </Badge>
              )}
              {missed?.is_classified && missed.caller_type && (
                <span className={`inline-flex items-center gap-0.5 rounded-[5px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  CALLER_TYPE_STYLES[missed.caller_type as InboundCallerType] ?? CALLER_TYPE_STYLES.unknown
                }`}>
                  <User className="h-2.5 w-2.5" />
                  {CALLER_TYPE_LABELS[missed.caller_type as InboundCallerType] ?? missed.caller_type}
                </span>
              )}
              {missed?.task_overdue && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-red-500/40 text-red-400">
                  task overdue
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Action bar */}
        {mode === "idle" && (
          <div className="flex items-center gap-1.5 flex-wrap px-3 pb-3">
            <Link href={`/dialer?phone=${encodeURIComponent(fromNumber)}${item.lead_id ? `&lead_id=${item.lead_id}` : ""}`}>
              <Button size="sm" className="h-7 text-[10px] px-2.5 bg-cyan/10 hover:bg-cyan/20 text-cyan border border-cyan/30">
                <Phone className="h-3 w-3 mr-1" />
                Call back
              </Button>
            </Link>

            {!missed?.is_classified && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] px-2.5 border-amber-500/30 text-amber-400 hover:bg-amber-950/30"
                onClick={() => setMode("classify")}
              >
                <Users className="h-3 w-3 mr-1" />
                Classify
              </Button>
            )}

            {isMissed && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] px-2.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/30"
                onClick={handleRecover}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                Recovered
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] px-2.5 border-white/[0.06] text-muted-foreground/50 hover:bg-white/[0.03]"
              onClick={() => setMode("writeback")}
            >
              <ArrowRight className="h-3 w-3 mr-1" />
              Review & commit
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] px-2 text-muted-foreground/40 hover:text-muted-foreground"
              onClick={() => setMode("dismiss")}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        )}

        {/* Classify form */}
        {mode === "classify" && (
          <ClassifyForm
            eventId={item.event_id}
            fromNumber={fromNumber}
            onDone={() => { setMode("idle"); onResolved(item.event_id); }}
          />
        )}

        {/* Dismiss form */}
        {mode === "dismiss" && (
          <div className="p-3 border-t border-white/[0.06] space-y-2">
            <Input
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Reason for dismissing (e.g. wrong number, spam)…"
              className="h-7 text-[10px]"
              onKeyDown={(e) => e.key === "Enter" && handleDismiss()}
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] px-2.5 border-red-500/40 text-red-400 hover:bg-red-950/30"
                onClick={handleDismiss}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                Confirm dismiss
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] px-2 text-muted-foreground/40"
                onClick={() => { setMode("idle"); setErr(null); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Writeback panel */}
        {mode === "writeback" && (
          <div className="border-t border-white/[0.06]">
            <InboundWritebackPanel inboundEventId={item.event_id} />
            <div className="px-3 pb-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2 text-muted-foreground/40"
                onClick={() => setMode("idle")}
              >
                ← Back to actions
              </Button>
            </div>
          </div>
        )}

        {err && <p className="text-[10px] text-red-400 px-3 pb-2">{err}</p>}
      </GlassCard>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function InboundDialerPageClient() {
  const searchParams = useSearchParams();
  const eventIdParam = searchParams.get("event_id");

  const [missed, setMissed] = useState<MissedInbound[]>([]);
  const [unclassified, setUnclassified] = useState<UnclassifiedAnswered[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/dialer/v1/queue?limit=50", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load inbound queue");
      const data = await res.json();
      setMissed(data.missed_inbound ?? []);
      setUnclassified(data.unclassified_answered ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleResolved(eventId: string) {
    setMissed((prev) => prev.filter((i) => i.event_id !== eventId));
    setUnclassified((prev) => prev.filter((i) => i.event_id !== eventId));
  }

  const totalCount = missed.length + unclassified.length;

  return (
    <PageShell title="Inbound Calls" description="Review, classify, and recover inbound calls">
      {/* Deep-link to specific event — show writeback panel */}
      {eventIdParam && (
        <GlassCard hover={false} className="!p-0 mb-4 overflow-hidden">
          <div className="p-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan/60">
              <PhoneIncoming className="h-3.5 w-3.5" />
              Review inbound event
            </div>
          </div>
          <InboundWritebackPanel inboundEventId={eventIdParam} />
        </GlassCard>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <PhoneIncoming className="h-4 w-4 text-red-400" />
          <span className="text-sm font-semibold text-foreground/80">
            {totalCount} inbound call{totalCount !== 1 ? "s" : ""} needing attention
          </span>
        </div>
        <button
          onClick={load}
          className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          title="Refresh"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
        <div className="ml-auto flex gap-2">
          <Link href="/dialer/war-room">
            <Button variant="outline" size="sm" className="h-7 text-[10px]">War Room</Button>
          </Link>
          <Link href="/dialer">
            <Button variant="outline" size="sm" className="h-7 text-[10px]">Dialer</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 mb-4 text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Missed calls section */}
      {missed.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-1.5 mb-3">
            <PhoneIncoming className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400/60">
              Missed Calls
            </span>
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px] h-4 px-1.5">
              {missed.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {missed.map((item, idx) => (
              <InboundCallCard
                key={item.event_id}
                item={item}
                type="missed"
                idx={idx}
                onResolved={handleResolved}
              />
            ))}
          </div>
        </div>
      )}

      {/* Unclassified answered section */}
      {unclassified.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-1.5 mb-3">
            <HelpCircle className="h-3.5 w-3.5 text-amber-400/60" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/60">
              Answered — Not Classified
            </span>
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/25 text-[9px] h-4 px-1.5">
              {unclassified.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {unclassified.map((item, idx) => (
              <InboundCallCard
                key={item.event_id}
                item={item}
                type="unclassified"
                idx={idx}
                onResolved={handleResolved}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && totalCount === 0 && !eventIdParam && (
        <GlassCard hover={false} className="text-center py-12">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-400/30 mb-3" />
          <p className="text-sm text-muted-foreground/60 mb-1">No inbound calls needing attention</p>
          <p className="text-[11px] text-muted-foreground/30">
            Missed and unclassified inbound calls will appear here.
          </p>
        </GlassCard>
      )}

      {/* SLA legend */}
      {totalCount > 0 && (
        <div className="flex items-center gap-3 mt-4 text-[9px] text-muted-foreground/30">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
            &lt;30m — critical
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            &lt;4h — warning
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
            older
          </div>
          <span className="ml-auto">Speed-to-lead SLA</span>
        </div>
      )}
    </PageShell>
  );
}
