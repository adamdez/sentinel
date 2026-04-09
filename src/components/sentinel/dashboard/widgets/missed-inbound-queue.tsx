"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  MessageSquare,
  Phone,
  PhoneIncoming,
  Play,
  RefreshCw,
  UserRoundSearch,
  Voicemail,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MissedInbound, UnclassifiedAnswered } from "@/app/api/dialer/v1/queue/route";

function formatAge(minutesAgo: number): string {
  if (minutesAgo < 2) return "just now";
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hours = Math.floor(minutesAgo / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ageSeverity(minutesAgo: number): "critical" | "warning" | "normal" {
  if (minutesAgo < 30) return "critical";
  if (minutesAgo < 240) return "warning";
  return "normal";
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function buildVoicemailPlaybackUrl(url: string | null): string | null {
  if (!url) return null;
  return url.endsWith(".mp3") || url.endsWith(".wav") ? url : `${url}.mp3`;
}

function finalStateLabel(state: MissedInbound["final_state"]): string {
  switch (state) {
    case "voicemail_recorded":
      return "Voicemail recorded";
    case "jeff_message":
      return "Jeff took message";
    case "callback_booked":
      return "Jeff booked callback";
    case "hung_up":
      return "Caller hung up";
    case "answered_unclassified":
      return "Answered, not classified";
    default:
      return "Unresolved";
  }
}

function routeLabel(item: MissedInbound): string | null {
  if (!item.route_primary) return null;
  const first = item.route_primary === "adam" ? "Adam first" : "Logan first";
  const second = item.route_secondary
    ? item.route_secondary === "adam"
      ? "Adam backup"
      : "Logan backup"
    : null;
  return second ? `${first} • ${second}` : first;
}

function stateBadgeClass(state: MissedInbound["final_state"]): string {
  switch (state) {
    case "voicemail_recorded":
      return "border-amber-400/30 text-amber-200 bg-amber-400/10";
    case "callback_booked":
      return "border-emerald-400/30 text-emerald-200 bg-emerald-400/10";
    case "jeff_message":
      return "border-sky-400/30 text-sky-200 bg-sky-400/10";
    case "hung_up":
      return "border-rose-400/30 text-rose-200 bg-rose-400/10";
    default:
      return "border-border/40 text-foreground/80 bg-muted/10";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

interface MissedInboundRowProps {
  item: MissedInbound;
  idx: number;
  onResolved: (eventId: string) => void;
}

function MissedInboundRow({ item, idx, onResolved }: MissedInboundRowProps) {
  const [mode, setMode] = useState<"idle" | "dismiss">("idle");
  const [dismissReason, setDismissReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const severity = ageSeverity(item.minutes_ago);
  const ageLabel = formatAge(item.minutes_ago);
  const hasEventActions = item.source !== "calls_log_fallback";
  const playbackUrl = buildVoicemailPlaybackUrl(item.voicemail_url);
  const routeText = routeLabel(item);

  const openHref = useMemo(() => {
    if (item.open_target_type === "lead" && item.open_target_id) {
      return `/leads?open=${item.open_target_id}`;
    }
    if (item.open_target_type === "intake" && item.open_target_id) {
      return `/intake?open=${item.open_target_id}`;
    }
    if (item.open_target_type === "phone_lookup" && item.from_number !== "unknown") {
      return `/dialer?phone=${encodeURIComponent(item.from_number)}`;
    }
    return null;
  }, [item]);

  const openLabel = item.open_target_type === "lead"
    ? "Open Client File"
    : item.open_target_type === "intake"
      ? "Open Intake"
      : item.open_target_type === "phone_lookup"
        ? "Open Context"
        : null;

  async function handleRecover() {
    setBusy(true);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/dialer/v1/inbound/${item.event_id}/recover`, {
        method: "POST",
        headers,
        body: JSON.stringify({ complete_task: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Recover failed");
      }
      onResolved(item.event_id);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Recover failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDismiss() {
    if (dismissReason.trim().length < 3) {
      setErr("Enter a reason");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/dialer/v1/inbound/${item.event_id}/dismiss`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: dismissReason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Dismiss failed");
      }
      onResolved(item.event_id);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Dismiss failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 + idx * 0.04 }}
      className="rounded-[10px] border border-white/[0.07] bg-white/[0.02] p-3 space-y-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <PhoneIncoming
              className={
                severity === "critical"
                  ? "h-3.5 w-3.5 text-amber-300 animate-pulse"
                  : severity === "warning"
                    ? "h-3.5 w-3.5 text-amber-200"
                    : "h-3.5 w-3.5 text-muted-foreground/60"
              }
            />
            <span className="text-sm font-semibold text-foreground">
              {item.owner_name || formatPhone(item.from_number)}
            </span>
            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${stateBadgeClass(item.final_state)}`}>
              {finalStateLabel(item.final_state)}
            </Badge>
            {item.lead_source && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-border/40 text-muted-foreground/80">
                {item.lead_source}
              </Badge>
            )}
          </div>

          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground/75">
              {formatPhone(item.from_number)}
            </p>
            {(item.property_address || routeText) && (
              <p className="text-xs text-muted-foreground/55 leading-relaxed">
                {[item.property_address, routeText].filter(Boolean).join(" • ")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Clock className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground/65">{ageLabel}</span>
            {item.task_overdue && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-rose-400/30 text-rose-200 bg-rose-400/10">
                Task overdue
              </Badge>
            )}
            {item.is_classified && item.caller_type && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-border/40 text-foreground/80">
                {item.caller_type}
              </Badge>
            )}
            {!item.is_classified && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-border/40 text-muted-foreground/70">
                Unclassified
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-border/40 text-muted-foreground/70">
              {item.seller_sms_sent ? "Auto SMS sent" : "No auto SMS yet"}
            </Badge>
          </div>
        </div>
      </div>

      {(item.jeff_summary || item.jeff_callback_time) && (
        <div className="rounded-[8px] border border-sky-400/20 bg-sky-400/[0.05] p-2">
          {item.jeff_summary && (
            <p className="text-xs text-sky-100/90 leading-relaxed">
              {item.jeff_summary}
            </p>
          )}
          {item.jeff_callback_time && (
            <p className="text-[11px] text-sky-200/80 mt-1">
              Callback: {item.jeff_callback_time}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <Link
          href={`/dialer?phone=${encodeURIComponent(item.from_number)}${item.lead_id ? `&lead_id=${item.lead_id}` : ""}`}
        >
          <Button size="sm" className="h-7 text-xs px-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30">
            <Phone className="h-3 w-3 mr-1" />
            Call Back Now
          </Button>
        </Link>

        {openHref && openLabel && (
          <Link href={openHref}>
            <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 border-border/40 text-foreground/85 hover:bg-muted/30">
              <UserRoundSearch className="h-3 w-3 mr-1" />
              {openLabel}
            </Button>
          </Link>
        )}

        {playbackUrl && (
          <a href={playbackUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 border-amber-400/30 text-amber-200 hover:bg-amber-400/10">
              <Play className="h-3 w-3 mr-1" />
              Play Voicemail
              {typeof item.voicemail_duration === "number" && item.voicemail_duration > 0 ? ` • ${item.voicemail_duration}s` : ""}
            </Button>
          </a>
        )}

        {hasEventActions && mode === "idle" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 border-border/40 text-foreground hover:bg-muted/30"
              onClick={handleRecover}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
              Mark Recovered
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2.5 text-muted-foreground/65 hover:text-foreground"
              onClick={() => setMode("dismiss")}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </>
        )}
      </div>

      {mode === "dismiss" && (
        <div className="space-y-1.5">
          <Input
            value={dismissReason}
            onChange={(event) => setDismissReason(event.target.value)}
            placeholder="Reason for dismissing…"
            className="h-7 text-xs px-2"
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleDismiss();
            }}
            autoFocus
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 border-border/40"
              onClick={handleDismiss}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
              Confirm Dismiss
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2.5 text-muted-foreground/60"
              onClick={() => {
                setMode("idle");
                setErr(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}
    </motion.div>
  );
}

function UnclassifiedAnsweredRow({ item, idx }: { item: UnclassifiedAnswered; idx: number }) {
  const ageLabel = formatAge(item.minutes_ago);
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 + idx * 0.04 }}
      className="rounded-[8px] border border-border/15 bg-muted/[0.03] p-2 flex items-center gap-2"
    >
      <HelpCircle className="h-3 w-3 shrink-0 text-foreground/60" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{item.from_number !== "unknown" ? formatPhone(item.from_number) : "Unknown"}</span>
        <span className="ml-1.5 text-sm text-muted-foreground/40">{ageLabel}</span>
      </div>
      <Link href={`/dialer/inbound?event_id=${item.event_id}`} className="text-sm text-foreground/70 hover:text-foreground shrink-0">
        Classify →
      </Link>
    </motion.div>
  );
}

interface MissedInboundQueueProps {
  items: MissedInbound[];
  unclassified?: UnclassifiedAnswered[];
  loading: boolean;
  onRefresh: () => void;
}

export function MissedInboundQueue({
  items,
  unclassified = [],
  loading,
  onRefresh,
}: MissedInboundQueueProps) {
  const [visible, setVisible] = useState<MissedInbound[]>(items);

  useEffect(() => {
    setVisible(items);
  }, [items]);

  const count = visible.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PhoneIncoming className="h-3.5 w-3.5 text-foreground" />
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
            Missed Inbound
          </span>
          {count > 0 && (
            <Badge className="bg-muted/20 text-foreground border-border/30 text-xs h-4 px-1.5">
              {count}
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          title="Refresh"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </div>

      {!loading && count === 0 && (
        <p className="text-sm text-muted-foreground/40 py-1">No missed inbound recovery items.</p>
      )}

      {visible.map((item, idx) => (
        <MissedInboundRow
          key={item.event_id}
          item={item}
          idx={idx}
          onResolved={(eventId) => setVisible((prev) => prev.filter((row) => row.event_id !== eventId))}
        />
      ))}

      {unclassified.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-1 pb-0.5">
            <HelpCircle className="h-3 w-3 text-foreground/60" />
            <span className="text-sm font-semibold uppercase tracking-wider text-foreground/50">
              Answered — not classified
            </span>
            <Badge className="bg-muted/15 text-foreground border-border/25 text-xs h-3.5 px-1 ml-1">
              {unclassified.length}
            </Badge>
          </div>
          {unclassified.map((item, idx) => (
            <UnclassifiedAnsweredRow key={item.event_id} item={item} idx={idx} />
          ))}
        </div>
      )}

      {count > 0 && (
        <div className="flex items-center gap-2 pt-0.5">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            <span className="text-xs text-muted-foreground/40">&lt;30m</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-200/70" />
            <span className="text-xs text-muted-foreground/40">&lt;4h</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
            <span className="text-xs text-muted-foreground/40">older</span>
          </div>
          <span className="text-xs text-muted-foreground/30 ml-auto">Speed-to-lead SLA</span>
        </div>
      )}
    </div>
  );
}

export function MissedInboundQueueAutoLoad() {
  const [items, setItems] = useState<MissedInbound[]>([]);
  const [unclassified, setUnclassified] = useState<UnclassifiedAnswered[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"unauthorized" | "server" | "network" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/dialer/v1/queue", { headers });
      if (res.status === 401) {
        setError("unauthorized");
        setItems([]);
        setUnclassified([]);
      } else if (!res.ok) {
        setError("server");
      } else {
        const data = await res.json();
        setItems(data.missed_inbound ?? []);
        setUnclassified(data.unclassified_answered ?? []);
      }
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !loading && items.length === 0) {
    const message = error === "unauthorized"
      ? "Your Sentinel session expired."
      : error === "server"
        ? "Server error loading missed calls."
        : "Network error loading missed calls.";
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <PhoneIncoming className="h-3.5 w-3.5 text-foreground" />
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
              Missed Inbound
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-[8px] border border-amber-500/20 bg-amber-500/[0.06] p-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200/80 flex-1">{message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs text-amber-300 hover:text-amber-200 underline shrink-0"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <MissedInboundQueue items={items} unclassified={unclassified} loading={loading} onRefresh={() => void load()} />;
}
