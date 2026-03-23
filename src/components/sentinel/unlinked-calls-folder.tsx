"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PhoneIncoming, ChevronDown, ChevronRight, Search, Link2,
  UserPlus, Trash2, Loader2, X, MapPin, Clock, MessageSquare,
  AlertCircle, Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { GlassCard } from "@/components/sentinel/glass-card";

// ── Types ─────────────────────────────────────────────────────────────

interface DiscoverySlot {
  key: string;
  value: string | null;
  status: string;
}

interface UnlinkedCall {
  id: string;
  phoneDialed: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  direction: string | null;
  aiSummary: string | null;
  discoverySlots: DiscoverySlot[];
}

interface LeadMatch {
  id: string;
  owner_name: string | null;
  address: string | null;
  owner_phone: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown number";
  const d = raw.replace(/\D/g, "").slice(-10);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (isToday) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
}

const SLOT_LABELS: Record<string, string> = {
  motivation: "Motivation",
  timeline: "Timeline",
  condition: "Condition",
  occupancy: "Occupancy",
  decision_maker: "Decision",
  pain_level: "Pain",
  asking_price: "Price",
  property_info: "Property",
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Main Component ────────────────────────────────────────────────────

export function UnlinkedCallsFolder({ onLinked }: { onLinked?: () => void }) {
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<UnlinkedCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const fetchCalls = useCallback(async (phone?: string) => {
    setLoading(true);
    try {
      const h = await authHeaders();
      const url = new URL("/api/dialer/v1/sessions/unlinked", window.location.origin);
      if (phone) url.searchParams.set("phone", phone);
      const res = await fetch(url.toString(), { headers: h });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (mountedRef.current) setCalls(data.sessions ?? []);
    } catch {
      if (mountedRef.current) setCalls([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchCalls();
  }, [open, fetchCalls]);

  const handleSearch = useCallback(() => {
    const digits = searchTerm.replace(/\D/g, "");
    fetchCalls(digits.length >= 4 ? digits : undefined);
  }, [searchTerm, fetchCalls]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this call and its notes? This cannot be undone.")) return;
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/dialer/v1/sessions/${id}`, { method: "DELETE", headers: h });
      if (!res.ok) throw new Error("Delete failed");
      setCalls((prev) => prev.filter((c) => c.id !== id));
      toast.success("Call deleted");
    } catch {
      toast.error("Failed to delete call");
    }
  }, []);

  const handleLink = useCallback(async (sessionId: string, leadId: string) => {
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/dialer/v1/sessions/${sessionId}/link`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ lead_id: leadId }),
      });
      if (!res.ok) throw new Error("Link failed");
      setCalls((prev) => prev.filter((c) => c.id !== sessionId));
      toast.success("Session linked to lead");
      onLinked?.();
    } catch {
      toast.error("Failed to link session");
    }
  }, [onLinked]);

  const count = calls.length;

  return (
    <GlassCard hover={false} className="!p-3 mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <PhoneIncoming className="h-3.5 w-3.5 text-amber-400/80" />
          Unlinked Calls
          {count > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/15 text-amber-400 border border-amber-400/25">
              {count}
            </span>
          )}
        </h2>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
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
            {/* Search bar */}
            <div className="flex items-center gap-1.5 mt-3 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleSearch(); }}
                  placeholder="Search by phone..."
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-[8px] bg-secondary/20 border border-overlay-4 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
                />
              </div>
              <button
                type="button"
                onClick={handleSearch}
                className="px-2 py-1.5 text-xs rounded-[8px] bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
              >
                Go
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
              </div>
            ) : calls.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 py-3 text-center">No unlinked calls</p>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-0.5">
                {calls.map((call) => (
                  <UnlinkedCallCard
                    key={call.id}
                    call={call}
                    expanded={expandedId === call.id}
                    onToggle={() => setExpandedId((prev) => prev === call.id ? null : call.id)}
                    onDelete={handleDelete}
                    onLink={handleLink}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ── Card Component ────────────────────────────────────────────────────

function UnlinkedCallCard({
  call,
  expanded,
  onToggle,
  onDelete,
  onLink,
}: {
  call: UnlinkedCall;
  expanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  onLink: (sessionId: string, leadId: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "convert" | "link">("idle");

  return (
    <div className="rounded-[10px] border border-overlay-4 bg-secondary/10 overflow-hidden">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-2.5 hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/90 font-mono">
            {formatPhone(call.phoneDialed)}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(call.durationSec)}</span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground/50 mt-0.5">
          {formatDateShort(call.startedAt)}
          {call.direction && <span className="ml-2 opacity-60">{call.direction === "inbound" ? "↙ Inbound" : "↗ Outbound"}</span>}
        </div>
        {!expanded && call.aiSummary && (
          <p className="text-xs text-muted-foreground/60 mt-1.5 line-clamp-2 italic">
            &ldquo;{call.aiSummary.slice(0, 120)}{call.aiSummary.length > 120 ? "..." : ""}&rdquo;
          </p>
        )}
      </button>

      {/* Expanded detail */}
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
              {/* AI Summary */}
              {call.aiSummary && (
                <div className="rounded-[8px] bg-overlay-2 border border-overlay-4 p-2">
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground/60 mb-1">
                    <MessageSquare className="h-3 w-3" />
                    Seller Summary
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed italic">
                    &ldquo;{call.aiSummary}&rdquo;
                  </p>
                </div>
              )}

              {/* Discovery map */}
              {call.discoverySlots.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {call.discoverySlots.map((slot) => (
                    <span
                      key={slot.key}
                      className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/8 border border-primary/15 text-primary/80"
                      title={slot.value ?? undefined}
                    >
                      <Check className="h-2.5 w-2.5" />
                      {SLOT_LABELS[slot.key] ?? slot.key}
                    </span>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              {mode === "idle" && (
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("convert")}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-[6px] bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
                  >
                    <UserPlus className="h-3 w-3" /> Convert to Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("link")}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-[6px] bg-overlay-4 text-foreground/70 hover:bg-overlay-8 border border-overlay-8 transition-colors"
                  >
                    <Link2 className="h-3 w-3" /> Link to Existing
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(call.id)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-[6px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              )}

              {/* Convert to Lead form */}
              {mode === "convert" && (
                <ConvertForm
                  phone={call.phoneDialed}
                  sessionId={call.id}
                  onDone={(leadId) => { if (leadId) onLink(call.id, leadId); setMode("idle"); }}
                  onCancel={() => setMode("idle")}
                />
              )}

              {/* Link to Existing search */}
              {mode === "link" && (
                <LinkSearch
                  sessionId={call.id}
                  onLink={onLink}
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

// ── Convert to Lead Form ──────────────────────────────────────────────

function ConvertForm({
  phone,
  sessionId,
  onDone,
  onCancel,
}: {
  phone: string | null;
  sessionId: string;
  onDone: (leadId: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
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
      const leadId = data.lead?.id;
      if (leadId) {
        toast.success("Lead created — linking session");
        onDone(leadId);
      } else {
        toast.error("Lead created but ID missing");
        onDone(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[8px] bg-overlay-2 border border-overlay-4 p-2.5 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-foreground/70">New Lead</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground/40 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="text-xs text-muted-foreground/50 font-mono">{formatPhone(phone)}</div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Owner name *"
        className="w-full px-2 py-1.5 text-xs rounded-[6px] bg-secondary/20 border border-overlay-4 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
      />
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Property address *"
        className="w-full px-2 py-1.5 text-xs rounded-[6px] bg-secondary/20 border border-overlay-4 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
      />
      <select
        value={county}
        onChange={(e) => setCounty(e.target.value)}
        className="w-full px-2 py-1.5 text-xs rounded-[6px] bg-secondary/20 border border-overlay-4 text-foreground focus:outline-none focus:border-primary/30"
      >
        <option value="spokane">Spokane County</option>
        <option value="kootenai">Kootenai County</option>
      </select>
      <div className="flex items-center gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-[6px] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
          Create & Link
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground/50 hover:text-foreground px-2 py-1.5">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Link to Existing Search ───────────────────────────────────────────

function LinkSearch({
  sessionId,
  onLink,
  onCancel,
}: {
  sessionId: string;
  onLink: (sessionId: string, leadId: string) => void;
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
      const mapped = (data ?? []).map((row: any) => ({
        id: row.id,
        owner_name: row.properties?.owner_name ?? null,
        address: row.properties?.address ?? null,
        owner_phone: row.properties?.owner_phone ?? null,
      }));
      setResults(mapped);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
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
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Search by name, address, or phone..."
          autoFocus
          className="w-full pl-7 pr-2 py-1.5 text-xs rounded-[6px] bg-secondary/20 border border-overlay-4 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
        />
      </div>
      {searching && (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
        </div>
      )}
      {!searching && results.length > 0 && (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {results.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => onLink(sessionId, lead.id)}
              className="w-full text-left rounded-[6px] p-2 hover:bg-primary/8 border border-transparent hover:border-primary/15 transition-colors"
            >
              <div className="text-xs font-medium text-foreground/85">{lead.owner_name ?? "Unknown"}</div>
              {lead.address && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 mt-0.5">
                  <MapPin className="h-2.5 w-2.5" /> {lead.address}
                </div>
              )}
              {lead.owner_phone && (
                <div className="text-[10px] text-muted-foreground/40 font-mono mt-0.5">
                  {formatPhone(lead.owner_phone)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {!searching && query.length >= 2 && results.length === 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/40 py-2 justify-center">
          <AlertCircle className="h-3 w-3" /> No leads found
        </div>
      )}
      <button type="button" onClick={onCancel} className="text-xs text-muted-foreground/50 hover:text-foreground">
        Cancel
      </button>
    </div>
  );
}
