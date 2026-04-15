"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
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
import type { MissedInbound } from "@/app/api/dialer/v1/queue/route";
import { matchesCommunicationSearch } from "@/lib/dialer/communication-search";
import { buildDialerHref, pushToDialer } from "@/components/sentinel/dialer-navigation";

const inboundDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "numeric",
  day: "numeric",
});

function formatAge(timestampIso: string, minutesAgo: number): string {
  if (minutesAgo < 2) return "just now";
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hours = Math.floor(minutesAgo / 60);
  if (hours < 24) return `${hours}h ago`;

  const parts = inboundDateFormatter.formatToParts(new Date(timestampIso));
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return [weekday, month && day ? `${month}/${day}` : ""].filter(Boolean).join(" ");
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

function buildVoicemailPlaybackUrl(callLogId: string | null, hasVoicemail: boolean): string | null {
  if (!callLogId || !hasVoicemail) return null;
  return `/api/dialer/v1/calls/${encodeURIComponent(callLogId)}/voicemail?format=mp3`;
}

function finalStatePriority(item: MissedInbound): number {
  if (item.final_state === "voicemail_recorded") return 0;
  if (item.final_state === "callback_booked") return 1;
  if (item.final_state === "jeff_message") return 2;
  if (item.final_state === "answered_unclassified") return 3;
  if (item.final_state === "hung_up") return 4;
  return 5;
}

function finalStateLabel(item: MissedInbound): string {
  if (item.jeff_notes_missing) {
    return "Jeff answered - notes missing";
  }

  const state = item.final_state;
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

function stateBadgeClass(item: MissedInbound): string {
  if (item.jeff_notes_missing) {
    return "border-orange-400/30 text-orange-200 bg-orange-400/10";
  }

  const state = item.final_state;
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const severity = ageSeverity(item.minutes_ago);
  const ageLabel = formatAge(item.missed_at, item.minutes_ago);
  const hasRecoverAction = item.source !== "calls_log_fallback";
  const playbackUrl = buildVoicemailPlaybackUrl(item.call_log_id, Boolean(item.voicemail_url));
  const routeText = routeLabel(item);

  const openHref = useMemo(() => {
    if (item.open_target_type === "intake" && item.open_target_id) {
      return `/intake?open=${item.open_target_id}`;
    }
    if (item.open_target_type === "lead" && item.open_target_id) {
      return buildDialerHref({
        leadId: item.open_target_id,
        phone: item.from_number !== "unknown" ? item.from_number : null,
        openClientFile: true,
        source: "missed-inbound-open-client-file",
      });
    }
    if (item.open_target_type === "phone_lookup" && item.from_number !== "unknown") {
      return buildDialerHref({ phone: item.from_number, source: "missed-inbound-open-context" });
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
    setBusy(true);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/dialer/v1/inbound/${item.event_id}/dismiss`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: "dismissed" }),
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
            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${stateBadgeClass(item)}`}>
              {finalStateLabel(item)}
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
        <div
          className={
            item.jeff_notes_missing
              ? "rounded-[8px] border border-orange-400/20 bg-orange-400/[0.05] p-2"
              : "rounded-[8px] border border-sky-400/20 bg-sky-400/[0.05] p-2"
          }
        >
          {item.jeff_summary && (
            <p className={`text-xs leading-relaxed ${item.jeff_notes_missing ? "text-orange-100/90" : "text-sky-100/90"}`}>
              {item.jeff_summary}
            </p>
          )}
          {item.jeff_callback_time && (
            <p className={`mt-1 text-[11px] ${item.jeff_notes_missing ? "text-orange-200/80" : "text-sky-200/80"}`}>
              Callback: {item.jeff_callback_time}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          className="h-7 text-xs px-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30"
          onClick={() => pushToDialer(router, {
            phone: item.from_number,
            leadId: item.lead_id ?? null,
            openClientFile: true,
            autodial: true,
            source: "missed-inbound-call-back",
          })}
        >
          <Phone className="h-3 w-3 mr-1" />
          Call Back Now
        </Button>

        {openHref && openLabel && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 border-border/40 text-foreground/85 hover:bg-muted/30"
            onClick={() => router.push(openHref)}
          >
            <UserRoundSearch className="h-3 w-3 mr-1" />
            {openLabel}
          </Button>
        )}

        {hasRecoverAction && (
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
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs px-2.5 text-muted-foreground/65 hover:text-foreground"
          onClick={() => void handleDismiss()}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
          Dismiss
        </Button>
      </div>

      {playbackUrl && (
        <div className="rounded-[8px] border border-amber-400/20 bg-amber-400/[0.04] px-2.5 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-amber-200/80">
            <Play className="h-3 w-3" />
            <span>
              Voicemail playback
              {typeof item.voicemail_duration === "number" && item.voicemail_duration > 0 ? ` • ${item.voicemail_duration}s` : ""}
            </span>
          </div>
          <audio controls preload="none" className="h-8 w-full" src={playbackUrl}>
            Your browser does not support voicemail playback.
          </audio>
        </div>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}
    </motion.div>
  );
}

interface MissedInboundQueueProps {
  items: MissedInbound[];
  loading: boolean;
  onRefresh: () => void;
  query?: string;
}

export function MissedInboundQueue({
  items,
  loading,
  onRefresh,
  query = "",
}: MissedInboundQueueProps) {
  const [visible, setVisible] = useState<MissedInbound[]>(items);

  useEffect(() => {
    setVisible(items);
  }, [items]);

  const filteredVisible = [...visible]
    .filter((item) => matchesCommunicationSearch(query, [
      item.from_number,
      item.owner_name,
      item.property_address,
      item.jeff_summary,
      item.jeff_callback_time,
    ]))
    .sort((left, right) => {
      const stateDelta = finalStatePriority(left) - finalStatePriority(right);
      if (stateDelta !== 0) return stateDelta;
      return new Date(right.missed_at).getTime() - new Date(left.missed_at).getTime();
    });
  const count = filteredVisible.length;
  const hasSearch = query.trim().length > 0;
  const hasAnyRecords = visible.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PhoneIncoming className="h-3.5 w-3.5 text-foreground" />
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
            Voicemail Box
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

      {!loading && !hasAnyRecords && (
        <p className="text-sm text-muted-foreground/40 py-1">No voicemail or missed inbound in the last 7 days.</p>
      )}

      {!loading && hasAnyRecords && count === 0 && hasSearch && (
        <p className="text-sm text-muted-foreground/40 py-1">No voicemail-box matches for this search.</p>
      )}

      {filteredVisible.map((item, idx) => (
        <MissedInboundRow
          key={item.event_id}
          item={item}
          idx={idx}
          onResolved={(eventId) => setVisible((prev) => prev.filter((row) => row.event_id !== eventId))}
        />
      ))}
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
              <span className="text-xs text-muted-foreground/30 ml-auto">Voicemail and missed-call queue</span>
        </div>
      )}
    </div>
  );
}

export function MissedInboundQueueAutoLoad({ query = "" }: { query?: string }) {
  const [items, setItems] = useState<MissedInbound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"unauthorized" | "server" | "network" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/dialer/v1/queue?limit=200", { headers });
      if (res.status === 401) {
        setError("unauthorized");
        setItems([]);
      } else if (!res.ok) {
        setError("server");
      } else {
        const data = await res.json();
        setItems(data.missed_inbound ?? []);
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
              Voicemail Box
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

  return <MissedInboundQueue items={items} loading={loading} onRefresh={() => void load()} query={query} />;
}


