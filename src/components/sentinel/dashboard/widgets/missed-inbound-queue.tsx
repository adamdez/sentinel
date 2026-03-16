"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Phone, PhoneIncoming, AlertTriangle, CheckCircle2,
  XCircle, Loader2, RefreshCw, Clock, HelpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSentinelStore } from "@/lib/store";
import type { MissedInbound, UnclassifiedAnswered } from "@/app/api/dialer/v1/queue/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAge(minutesAgo: number): string {
  if (minutesAgo < 2)  return "just now";
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const h = Math.floor(minutesAgo / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ageSeverity(minutesAgo: number): "critical" | "warning" | "normal" {
  if (minutesAgo < 30)  return "critical"; // < 30 min — needs immediate callback
  if (minutesAgo < 240) return "warning";  // < 4 hours
  return "normal";
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  item: MissedInbound;
  idx: number;
  token: string | null;
  onResolved: (eventId: string) => void;
}

function MissedInboundRow({ item, idx, token, onResolved }: RowProps) {
  const [mode, setMode] = useState<"idle" | "dismiss">("idle");
  const [dismissReason, setDismissReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const severity = ageSeverity(item.minutes_ago);
  const ageLabel = formatAge(item.minutes_ago);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  async function handleRecover() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/dialer/v1/inbound/${item.event_id}/recover`, {
        method: "POST",
        headers,
        body: JSON.stringify({ complete_task: true }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Recover failed");
      }
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
        headers,
        body: JSON.stringify({ reason: dismissReason.trim() }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Dismiss failed");
      }
      onResolved(item.event_id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 + idx * 0.04 }}
      className="rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-2"
    >
      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <PhoneIncoming
              className={`h-3 w-3 shrink-0 ${
                severity === "critical" ? "text-red-400 animate-pulse" :
                severity === "warning"  ? "text-amber-400" :
                "text-muted-foreground/60"
              }`}
            />
            <span className="text-xs font-medium">
              {item.from_number !== "unknown" ? item.from_number : "Unknown number"}
            </span>
            {!item.lead_matched && (
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-muted-foreground/60">
                No lead match
              </Badge>
            )}
            {item.is_classified && item.caller_type && (
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-emerald-400/80 border-emerald-500/30">
                {item.caller_type}
              </Badge>
            )}
            {!item.is_classified && (
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-amber-400/70 border-amber-500/30">
                unclassified
              </Badge>
            )}
          </div>

          {/* SLA age */}
          <div className="flex items-center gap-1 mt-0.5">
            <Clock
              className={`h-3 w-3 shrink-0 ${
                severity === "critical" ? "text-red-400" :
                severity === "warning"  ? "text-amber-400" :
                "text-muted-foreground/40"
              }`}
            />
            <span
              className={`text-[11px] font-medium ${
                severity === "critical" ? "text-red-400" :
                severity === "warning"  ? "text-amber-400" :
                "text-muted-foreground/60"
              }`}
            >
              {ageLabel}
            </span>
            {item.task_overdue && (
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-red-500/40 text-red-400">
                task overdue
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      {mode === "idle" && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Call back now — links to dialer pre-filling the phone number */}
          <Link
            href={`/dialer?phone=${encodeURIComponent(item.from_number)}${item.lead_id ? `&lead_id=${item.lead_id}` : ""}`}
          >
            <Button
              size="sm"
              className="h-6 text-[10px] px-2 bg-cyan/10 hover:bg-cyan/20 text-cyan border border-cyan/30"
            >
              <Phone className="h-3 w-3 mr-1" />
              Call back now
            </Button>
          </Link>

          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/30"
            onClick={handleRecover}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
            Mark recovered
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 text-muted-foreground/50 hover:text-muted-foreground"
            onClick={() => setMode("dismiss")}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Dismiss
          </Button>
        </div>
      )}

      {mode === "dismiss" && (
        <div className="space-y-1.5">
          <Input
            value={dismissReason}
            onChange={e => setDismissReason(e.target.value)}
            placeholder="Reason for dismissing (e.g. wrong number, spam)…"
            className="h-6 text-[10px] px-2"
            onKeyDown={e => e.key === "Enter" && handleDismiss()}
            autoFocus
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 border-red-500/40 text-red-400 hover:bg-red-950/30"
              onClick={handleDismiss}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
              Confirm dismiss
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2 text-muted-foreground/40"
              onClick={() => { setMode("idle"); setErr(null); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {err && <p className="text-[10px] text-destructive">{err}</p>}
    </motion.div>
  );
}

// ── UnclassifiedAnsweredRow ───────────────────────────────────────────────────

function UnclassifiedAnsweredRow({ item, idx }: { item: UnclassifiedAnswered; idx: number }) {
  const ageLabel = formatAge(item.minutes_ago);
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 + idx * 0.04 }}
      className="rounded-[8px] border border-amber-500/15 bg-amber-500/[0.03] p-2 flex items-center gap-2"
    >
      <HelpCircle className="h-3 w-3 shrink-0 text-amber-400/60" />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-medium">
          {item.from_number !== "unknown" ? item.from_number : "Unknown"}
        </span>
        <span className="ml-1.5 text-[10px] text-muted-foreground/40">{ageLabel}</span>
      </div>
      <Link
        href={`/dialer/inbound?event_id=${item.event_id}`}
        className="text-[10px] text-amber-400/70 hover:text-amber-400 shrink-0"
      >
        Classify →
      </Link>
    </motion.div>
  );
}

// ── MissedInboundQueue ────────────────────────────────────────────────────────

interface Props {
  items: MissedInbound[];
  unclassified?: UnclassifiedAnswered[];
  loading: boolean;
  onRefresh: () => void;
}

export function MissedInboundQueue({ items, unclassified = [], loading, onRefresh }: Props) {
  const { currentUser } = useSentinelStore();
  const token = (currentUser as { access_token?: string })?.access_token ?? null;

  const [visible, setVisible] = useState<MissedInbound[]>(items);

  useEffect(() => {
    setVisible(items);
  }, [items]);

  function handleResolved(eventId: string) {
    setVisible(prev => prev.filter(i => i.event_id !== eventId));
  }

  const count = visible.length;

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PhoneIncoming className="h-3.5 w-3.5 text-red-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Missed Inbound
          </span>
          {count > 0 && (
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px] h-4 px-1.5">
              {count}
            </Badge>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          title="Refresh"
        >
          {loading
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <RefreshCw className="h-3 w-3" />
          }
        </button>
      </div>

      {/* Empty state */}
      {!loading && count === 0 && (
        <p className="text-[11px] text-muted-foreground/40 py-1">No missed inbound calls.</p>
      )}

      {/* Item list */}
      {visible.map((item, idx) => (
        <MissedInboundRow
          key={item.event_id}
          item={item}
          idx={idx}
          token={token}
          onResolved={handleResolved}
        />
      ))}

      {/* Setup hint if no items have ever come in */}
      {!loading && count === 0 && (
        <p className="text-[10px] text-muted-foreground/30 leading-snug">
          Configure <code className="text-[9px]">TWILIO_FORWARD_TO_CELL</code> and set{" "}
          <code className="text-[9px]">/api/twilio/inbound</code> as the webhook on your Twilio number.
        </p>
      )}

      {/* Unclassified answered calls */}
      {unclassified.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-1 pb-0.5">
            <HelpCircle className="h-3 w-3 text-amber-400/60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/50">
              Answered — not classified
            </span>
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/25 text-[9px] h-3.5 px-1 ml-1">
              {unclassified.length}
            </Badge>
          </div>
          {unclassified.map((item, idx) => (
            <UnclassifiedAnsweredRow key={item.event_id} item={item} idx={idx} />
          ))}
        </div>
      )}

      {/* SLA legend */}
      {count > 0 && (
        <div className="flex items-center gap-2 pt-0.5">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <span className="text-[9px] text-muted-foreground/40">&lt;30m</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="text-[9px] text-muted-foreground/40">&lt;4h</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
            <span className="text-[9px] text-muted-foreground/40">older</span>
          </div>
          <span className="text-[9px] text-muted-foreground/30 ml-auto">Speed-to-lead SLA</span>
        </div>
      )}
    </div>
  );
}

// ── Standalone auto-loading version for pages that don't pre-fetch queue ─────

export function MissedInboundQueueAutoLoad() {
  const { currentUser } = useSentinelStore();
  const token = (currentUser as { access_token?: string })?.access_token ?? null;
  const [items, setItems] = useState<MissedInbound[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dialer/v1/queue", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.missed_inbound ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return <MissedInboundQueue items={items} loading={loading} onRefresh={load} />;
}
