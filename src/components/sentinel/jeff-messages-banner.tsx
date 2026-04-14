"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Phone, UserPlus, X, ChevronDown, ChevronRight,
  Loader2, MapPin, Search, Clock, MessageSquare, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { GlassCard } from "@/components/sentinel/glass-card";
import { pushToDialer } from "@/components/sentinel/dialer-navigation";

// ── Types ─────────────────────────────────────────────────────────────

interface JeffMessage {
  id: string;
  callerPhone: string | null;
  summary: string | null;
  durationSeconds: number | null;
  callerType: string | null;
  createdAt: string;
  routeTo: "logan" | "adam";
  acknowledged?: boolean;
  extracted: {
    motivation: string | null;
    urgency: string | null;
    callerName: string | null;
  };
}

interface LeadMatch {
  id: string;
  owner_name: string | null;
  address: string | null;
  owner_phone: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown";
  const d = raw.replace(/\D/g, "").slice(-10);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Main Component ────────────────────────────────────────────────────

export function JeffMessagesBanner({
  onCallBack,
  onLinked,
}: {
  onCallBack?: (phone: string, summary: string | null) => void;
  onLinked?: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<JeffMessage[]>([]);
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const prevCountRef = useRef(0);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const h = await authHeaders();
      const res = await fetch("/api/dialer/v1/jeff-messages?include=all", { headers: h });
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current) {
        const msgs = (data.messages ?? []) as JeffMessage[];
        // Browser notification for new unacknowledged messages
        const newCount = msgs.filter((m) => !m.acknowledged).length;
        if (newCount > prevCountRef.current && prevCountRef.current > 0) {
          const newest = msgs.find((m) => !m.acknowledged);
          if (newest && Notification.permission === "granted") {
            new Notification("Jeff took a message", {
              body: `From ${formatPhone(newest.callerPhone)}`,
              icon: "/icon.svg",
            });
          }
        }
        prevCountRef.current = newCount;
        setMessages(msgs);
      }
    } catch { /* non-fatal */ }
  }, []);

  // Initial fetch + 15s polling
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Request notification permission once
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const handleAcknowledge = useCallback(async (id: string, action: "dismissed" | "called_back" | "converted_to_lead", leadId?: string) => {
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/dialer/v1/jeff-messages/${id}/acknowledge`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ action, lead_id: leadId ?? null }),
      });
      if (!res.ok) throw new Error("Acknowledge failed");
      // Mark as acknowledged locally so it moves to "Recent" without refetch
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, acknowledged: true } : m));
      if (action === "dismissed") toast.success("Message dismissed");
      else if (action === "called_back") toast.success("Calling back...");
      else if (action === "converted_to_lead") { toast.success("Lead created"); onLinked?.(); }
    } catch {
      toast.error("Failed to acknowledge");
    }
  }, [onLinked]);

  const newMessages = messages.filter((m) => !m.acknowledged);
  const recentMessages = messages.filter((m) => m.acknowledged);
  const hasNew = newMessages.length > 0;
  const handleCallBack = useCallback((phone: string, summary: string | null) => {
    if (onCallBack) {
      onCallBack(phone, summary);
      return;
    }
    pushToDialer(router, {
      phone,
      autodial: true,
      source: "jeff-message-call-back",
    });
  }, [onCallBack, router]);

  return (
    <GlassCard hover={false} className={`!p-3 mb-3 ${hasNew ? "border-red-500/20 bg-red-500/[0.03]" : "border-overlay-6 bg-overlay-2/30"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${hasNew ? "text-red-400" : "text-muted-foreground/60"}`}>
          {hasNew && <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
          <MessageSquare className="h-3.5 w-3.5" />
          Jeff&apos;s Messages
          {hasNew && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/25">
              {newMessages.length} new
            </span>
          )}
          {!hasNew && messages.length > 0 && (
            <span className="ml-1 text-[10px] text-muted-foreground/40">{messages.length}</span>
          )}
        </h2>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/30" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="max-h-[40vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-overlay-8 scrollbar-track-transparent mt-3 space-y-1.5">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground/40 text-center py-4">No messages from Jeff yet</p>
              )}

              {/* New / unacknowledged messages */}
              {newMessages.map((msg) => (
                <JeffMessageCard
                  key={msg.id}
                  message={msg}
                  expanded={expandedId === msg.id}
                  onToggle={() => setExpandedId((prev) => prev === msg.id ? null : msg.id)}
                  onCallBack={(phone, summary) => {
                    handleAcknowledge(msg.id, "called_back");
                    handleCallBack(phone, summary);
                  }}
                  onConvert={(leadId) => handleAcknowledge(msg.id, "converted_to_lead", leadId)}
                  onDismiss={() => handleAcknowledge(msg.id, "dismissed")}
                />
              ))}

              {/* Divider between new and recent */}
              {hasNew && recentMessages.length > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 border-t border-overlay-6" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/30">Recent</span>
                  <div className="flex-1 border-t border-overlay-6" />
                </div>
              )}

              {/* Recent / acknowledged messages (dimmed, read-only with call-back) */}
              {recentMessages.map((msg) => (
                <JeffMessageCard
                  key={msg.id}
                  message={msg}
                  dimmed
                  expanded={expandedId === msg.id}
                  onToggle={() => setExpandedId((prev) => prev === msg.id ? null : msg.id)}
                  onCallBack={(phone, summary) => {
                    handleCallBack(phone, summary);
                  }}
                  onConvert={() => {}}
                  onDismiss={() => {}}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ── Card Component ────────────────────────────────────────────────────

function JeffMessageCard({
  message,
  dimmed = false,
  expanded,
  onToggle,
  onCallBack,
  onConvert,
  onDismiss,
}: {
  message: JeffMessage;
  dimmed?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCallBack: (phone: string, summary: string | null) => void;
  onConvert: (leadId: string) => void;
  onDismiss: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "convert" | "link">("idle");

  return (
    <div className={`rounded-[10px] border overflow-hidden ${dimmed ? "border-overlay-6 bg-overlay-2/20 opacity-60" : "border-red-500/15 bg-red-500/[0.02]"}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full text-left p-2.5 transition-colors ${dimmed ? "hover:bg-overlay-4" : "hover:bg-red-500/[0.04]"}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/90 font-mono">
            {formatPhone(message.callerPhone)}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <Clock className="h-3 w-3" />
            <span>{timeAgo(message.createdAt)}</span>
          </div>
        </div>
        {message.extracted.callerName && (
          <div className="text-xs text-foreground/70 mt-0.5">
            {message.extracted.callerName}
          </div>
        )}
        {!expanded && message.summary && (
          <p className="text-xs text-muted-foreground/60 mt-1.5 line-clamp-2 italic">
            &ldquo;{message.summary.slice(0, 140)}{message.summary.length > 140 ? "..." : ""}&rdquo;
          </p>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5 space-y-2">
              {/* Summary */}
              {message.summary && (
                <div className="rounded-[8px] bg-overlay-2 border border-overlay-4 p-2">
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground/60 mb-1">
                    <MessageSquare className="h-3 w-3" />
                    Jeff&apos;s Notes
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed italic">
                    &ldquo;{message.summary}&rdquo;
                  </p>
                </div>
              )}

              {/* Extracted fields */}
              <div className="flex flex-wrap gap-1">
                {message.extracted.motivation && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 text-amber-400/80">
                    <Zap className="h-2.5 w-2.5" />
                    {message.extracted.motivation.replace(/_/g, " ")}
                  </span>
                )}
                {message.extracted.urgency && (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border ${
                    message.extracted.urgency === "high"
                      ? "bg-red-400/10 border-red-400/20 text-red-400/80"
                      : "bg-overlay-4 border-overlay-8 text-muted-foreground/60"
                  }`}>
                    Timeline: {message.extracted.urgency}
                  </span>
                )}
                {message.routeTo === "adam" && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 border border-blue-400/20 text-blue-400/80">
                    Routed → Adam
                  </span>
                )}
              </div>

              {/* Action buttons */}
              {mode === "idle" && (
                <div className="flex items-center gap-1.5 pt-1">
                  {message.callerPhone && (
                    <button
                      type="button"
                      onClick={() => onCallBack(message.callerPhone!, message.summary)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-[6px] bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/25 transition-colors"
                    >
                      <Phone className="h-3 w-3" /> Call Back{!dimmed && " Now"}
                    </button>
                  )}
                  {!dimmed && (
                    <button
                      type="button"
                      onClick={() => setMode("convert")}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-[6px] bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
                    >
                      <UserPlus className="h-3 w-3" /> Convert
                    </button>
                  )}
                  {!dimmed && (
                    <button
                      type="button"
                      onClick={onDismiss}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-[6px] text-muted-foreground/50 hover:text-foreground hover:bg-overlay-4 transition-colors ml-auto"
                    >
                      <X className="h-3 w-3" /> Dismiss
                    </button>
                  )}
                </div>
              )}

              {/* Convert form */}
              {mode === "convert" && (
                <JeffConvertForm
                  phone={message.callerPhone}
                  callerName={message.extracted.callerName}
                  onDone={(leadId) => { if (leadId) onConvert(leadId); setMode("idle"); }}
                  onCancel={() => setMode("idle")}
                />
              )}

              {/* Link search */}
              {mode === "link" && (
                <JeffLinkSearch
                  sessionId={message.id}
                  onLink={(leadId) => onConvert(leadId)}
                  onCancel={() => setMode("idle")}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Convert Form ──────────────────────────────────────────────────────

function JeffConvertForm({
  phone,
  callerName,
  onDone,
  onCancel,
}: {
  phone: string | null;
  callerName: string | null;
  onDone: (leadId: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(callerName ?? "");
  const [address, setAddress] = useState("");
  const [county, setCounty] = useState("spokane");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!address.trim()) { toast.error("Address is required"); return; }
    setSaving(true);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          address: address.trim(),
          county: county.trim(),
          owner_name: name.trim(),
          owner_phone: phone?.replace(/\D/g, "").slice(-10),
          source: "inbound_call",
          source_channel: "phone",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to create lead");
      }
      const data = await res.json();
      onDone(data.lead?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[8px] bg-overlay-2 border border-overlay-4 p-2.5 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-foreground/70">New Lead from Jeff&apos;s Message</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground/40 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="text-xs text-muted-foreground/50 font-mono">{formatPhone(phone)}</div>
      <input
        type="text" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Owner name *"
        className="w-full px-2 py-1.5 text-xs rounded-[6px] bg-secondary/20 border border-overlay-4 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
      />
      <input
        type="text" value={address} onChange={(e) => setAddress(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Property address *"
        className="w-full px-2 py-1.5 text-xs rounded-[6px] bg-secondary/20 border border-overlay-4 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
      />
      <select value={county} onChange={(e) => setCounty(e.target.value)}
        className="w-full px-2 py-1.5 text-xs rounded-[6px] bg-secondary/20 border border-overlay-4 text-foreground focus:outline-none focus:border-primary/30">
        <option value="spokane">Spokane County</option>
        <option value="kootenai">Kootenai County</option>
      </select>
      <div className="flex items-center gap-1.5 pt-0.5">
        <button type="button" onClick={handleSubmit} disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-[6px] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
          Create & Link
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground/50 hover:text-foreground px-2 py-1.5">Cancel</button>
      </div>
    </div>
  );
}

// ── Link Search ───────────────────────────────────────────────────────

function JeffLinkSearch({
  sessionId,
  onLink,
  onCancel,
}: {
  sessionId: string;
  onLink: (leadId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await supabase
        .from("leads")
        .select("id, status, properties!inner(owner_name, address, owner_phone)")
        .or(`address.ilike.%${q}%,owner_name.ilike.%${q}%,owner_phone.ilike.%${q}%`, { referencedTable: "properties" })
        .limit(8);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setResults((data ?? []).map((row: any) => ({
        id: row.id,
        owner_name: row.properties?.owner_name ?? null,
        address: row.properties?.address ?? null,
        owner_phone: row.properties?.owner_phone ?? null,
      })));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  };

  return (
    <div className="rounded-[8px] bg-overlay-2 border border-overlay-4 p-2.5 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-foreground/70">Link to Existing Lead</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground/40 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
        <input type="text" value={query} onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()} placeholder="Search by name, address, phone..." autoFocus
          className="w-full pl-7 pr-2 py-1.5 text-xs rounded-[6px] bg-secondary/20 border border-overlay-4 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
        />
      </div>
      {searching && <div className="flex justify-center py-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" /></div>}
      {!searching && results.length > 0 && (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {results.map((lead) => (
            <button key={lead.id} type="button" onClick={() => onLink(lead.id)}
              className="w-full text-left rounded-[6px] p-2 hover:bg-primary/8 border border-transparent hover:border-primary/15 transition-colors">
              <div className="text-xs font-medium text-foreground/85">{lead.owner_name ?? "Unknown"}</div>
              {lead.address && <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 mt-0.5"><MapPin className="h-2.5 w-2.5" /> {lead.address}</div>}
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={onCancel} className="text-xs text-muted-foreground/50 hover:text-foreground">Cancel</button>
    </div>
  );
}
