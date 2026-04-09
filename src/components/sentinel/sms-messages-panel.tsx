"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageSquare, ChevronDown, ChevronRight, ArrowLeft, Send,
  Phone, UserPlus, Loader2, Check, CheckCheck, XCircle, SquarePen,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { GlassCard } from "@/components/sentinel/glass-card";
import { cn } from "@/lib/utils";
import { useModal } from "@/providers/modal-provider";

// ── Types ─────────────────────────────────────────────────────────────

interface SmsThread {
  phone: string;
  leadId: string | null;
  leadName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  direction: string;
  unreadCount: number;
  resolutionState: "direct" | "suggested" | "unresolved";
  matchReason: string | null;
  matchSource: string | null;
  suggestedLeadId: string | null;
  suggestedLeadName: string | null;
  suggestedPropertyAddress: string | null;
}

interface SmsMessage {
  id: string;
  direction: string;
  body: string;
  created_at: string;
  read_at: string | null;
  twilio_status: string | null;
}

interface LeadInfo {
  id: string;
  name: string;
  score: number | null;
  tags: string[];
  status: string;
}

interface SuggestedLeadInfo extends LeadInfo {
  propertyAddress?: string | null;
  matchReason: string;
  matchSource: string | null;
  matchedPhone?: string | null;
  recentCallCount?: number;
  lastCallDate?: string | null;
}

interface SearchDigits {
  last4: string | null;
  last7: string | null;
}

interface NearbyPhoneMatch {
  leadId: string | null;
  ownerName: string | null;
  propertyAddress: string | null;
  matchedPhone: string | null;
  matchReason: string;
  status: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(-10);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function deliveryIcon(status: string | null) {
  if (!status) return null;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-primary/60" />;
  if (status === "sent" || status === "queued") return <Check className="h-3 w-3 text-muted-foreground/40" />;
  if (status === "failed" || status === "undelivered") return <XCircle className="h-3 w-3 text-red-400" />;
  return null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Thread List ───────────────────────────────────────────────────────

function ThreadRow({
  thread,
  onClick,
}: {
  thread: SmsThread;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2.5 py-2 rounded-[10px] transition-colors hover:bg-overlay-6 group"
    >
      <div className="flex items-start gap-2">
        {thread.unreadCount > 0 && (
          <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {thread.leadName ?? formatPhone(thread.phone)}
            </span>
            <span className="text-xs text-muted-foreground/50 shrink-0">
              {relativeTime(thread.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {thread.leadName && (
              <span className="text-xs text-muted-foreground/40 font-mono">
                {formatPhone(thread.phone)}
              </span>
            )}
            {thread.resolutionState === "suggested" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
                Needs review
              </span>
            )}
            {thread.resolutionState === "unresolved" && !thread.leadId && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-overlay-8 bg-overlay-4 text-muted-foreground/60">
                Unassigned
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
            {thread.direction === "outbound" ? "You: " : ""}
            {thread.lastMessage || "(empty)"}
          </p>
        </div>
      </div>
    </button>
  );
}

// ── Thread Detail ─────────────────────────────────────────────────────

function ThreadDetail({
  phone,
  onBack,
  onCallNow,
  onOpenLead,
}: {
  phone: string;
  onBack: () => void;
  onCallNow: (phone: string) => void;
  onOpenLead: (leadId: string) => void;
}) {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null);
  const [resolutionState, setResolutionState] = useState<"direct" | "suggested" | "unresolved">("unresolved");
  const [resolutionLabel, setResolutionLabel] = useState<string | null>(null);
  const [suggestedLead, setSuggestedLead] = useState<SuggestedLeadInfo | null>(null);
  const [candidateMatches, setCandidateMatches] = useState<SuggestedLeadInfo[]>([]);
  const [searchDigits, setSearchDigits] = useState<SearchDigits>({ last4: null, last7: null });
  const [nearbyMatches, setNearbyMatches] = useState<SuggestedLeadInfo[]>([]);
  const [nearbyLabel, setNearbyLabel] = useState<string | null>(null);
  const [searchingNearby, setSearchingNearby] = useState(false);
  const [attachingLeadId, setAttachingLeadId] = useState<string | null>(null);
  const [dismissedReview, setDismissedReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const forceScrollRef = useRef(true);

  const updateStickiness = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  const fetchMessages = useCallback(async () => {
    const headers = await authHeaders();
    const res = await fetch(`/api/twilio/sms/threads/${encodeURIComponent(phone)}`, { headers });
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      setLeadInfo(data.leadInfo ?? null);
      setResolutionState(data.resolutionState ?? "unresolved");
      setResolutionLabel(data.resolutionLabel ?? null);
      setSuggestedLead(data.suggestedLead ?? null);
      setCandidateMatches(data.candidateMatches ?? []);
      setSearchDigits(data.searchDigits ?? { last4: null, last7: null });
      if (!data.suggestedLead) {
        setNearbyMatches([]);
        setNearbyLabel(null);
      }
    }
    setLoading(false);
  }, [phone]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 8000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    setDismissedReview(false);
    setNearbyMatches([]);
    setNearbyLabel(null);
  }, [phone]);

  useEffect(() => {
    if (forceScrollRef.current || shouldStickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: forceScrollRef.current ? "auto" : "smooth" });
      forceScrollRef.current = false;
    }
  }, [messages]);

  const runNearbySearch = useCallback(async (digits: string, label: string) => {
    if (!digits) return;
    setSearchingNearby(true);
    try {
      const res = await fetch(`/api/search/phone?q=${encodeURIComponent(digits)}`);
      if (!res.ok) {
        toast.error("Unable to search nearby matches");
        return;
      }

      const data = await res.json();
      const mapped = ((data.results ?? []) as NearbyPhoneMatch[])
        .filter((match) => match.leadId)
        .map((match) => ({
          id: match.leadId as string,
          name: match.ownerName ?? formatPhone(match.matchedPhone ?? phone),
          score: null,
          tags: [],
          status: match.status ?? "unknown",
          propertyAddress: match.propertyAddress,
          matchReason: match.matchReason,
          matchSource: null,
          matchedPhone: match.matchedPhone,
        }));

      setNearbyMatches(mapped);
      setNearbyLabel(label);
    } catch {
      toast.error("Unable to search nearby matches");
    } finally {
      setSearchingNearby(false);
    }
  }, [phone]);

  const handleAttach = useCallback(async (leadId: string) => {
    if (!leadId || attachingLeadId) return;
    setAttachingLeadId(leadId);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/twilio/sms/threads/${encodeURIComponent(phone)}/attach`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          leadId,
          reason: resolutionState === "suggested" ? "suggested_review_attach" : "manual_review_attach",
          addPhoneFact: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to attach thread");
        return;
      }

      toast.success("Thread attached to client file");
      setDismissedReview(false);
      await fetchMessages();
    } catch {
      toast.error("Unable to attach thread");
    } finally {
      setAttachingLeadId(null);
    }
  }, [attachingLeadId, fetchMessages, phone, resolutionState]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/twilio/sms/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: phone,
          body: draft.trim(),
          leadId: leadInfo?.id ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Send failed");
      } else {
        setDraft("");
        forceScrollRef.current = true;
        await fetchMessages();
      }
    } catch {
      toast.error("Network error");
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showResolutionBanner = !dismissedReview && !leadInfo;
  const reviewMatches = nearbyMatches.length > 0 ? nearbyMatches : candidateMatches;
  const reviewLabel = nearbyLabel ?? resolutionLabel;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-overlay-6 mb-2">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-overlay-6 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {leadInfo?.name ?? suggestedLead?.name ?? formatPhone(phone)}
          </p>
          {leadInfo && (
            <p className="text-xs text-muted-foreground/60 truncate">
              {leadInfo.tags?.[0] ?? leadInfo.status} · {leadInfo.score ?? "—"}
            </p>
          )}
          {!leadInfo && suggestedLead && (
            <p className="text-xs text-muted-foreground/60 truncate">
              {suggestedLead.matchReason} · {suggestedLead.propertyAddress ?? formatPhone(phone)}
            </p>
          )}
          {!leadInfo && !suggestedLead && (
            <p className="text-xs text-muted-foreground/40 font-mono">{formatPhone(phone)}</p>
          )}
        </div>
        {leadInfo?.id && (
          <button
            onClick={() => onOpenLead(leadInfo.id)}
            className="text-xs px-2.5 py-1 rounded-[8px] border border-overlay-8 text-muted-foreground/60 hover:text-foreground hover:border-overlay-20 transition-colors"
          >
            Open File
          </button>
        )}
        {!leadInfo && suggestedLead?.id && (
          <button
            onClick={() => onOpenLead(suggestedLead.id)}
            className="text-xs px-2.5 py-1 rounded-[8px] border border-overlay-8 text-muted-foreground/60 hover:text-foreground hover:border-overlay-20 transition-colors"
          >
            Open Suggested File
          </button>
        )}
      </div>

      {leadInfo && (
        <div className="mb-2 rounded-[10px] border border-primary/20 bg-primary/10 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-primary/80">Matched directly</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{resolutionLabel ?? "Direct phone"}</p>
        </div>
      )}

      {showResolutionBanner && (
        <div
          className={cn(
            "mb-2 rounded-[12px] border px-3 py-2",
            resolutionState === "suggested"
              ? "border-amber-500/25 bg-amber-500/10"
              : "border-overlay-8 bg-overlay-4",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                {resolutionState === "suggested" ? "Needs Review" : "Unassigned"}
              </p>
              <p className="text-sm text-foreground mt-1">
                {resolutionState === "suggested"
                  ? reviewLabel ?? "Suggested from prior phone evidence"
                  : "No file match yet"}
              </p>
              {suggestedLead?.propertyAddress && (
                <p className="text-xs text-muted-foreground/60 mt-1 truncate">
                  {suggestedLead.propertyAddress}
                </p>
              )}
            </div>
            <button
              onClick={() => setDismissedReview(true)}
              className="text-xs px-2 py-1 rounded-[8px] border border-overlay-8 text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              Keep unassigned
            </button>
          </div>

          {suggestedLead?.id && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => handleAttach(suggestedLead.id)}
                disabled={attachingLeadId === suggestedLead.id}
                className="text-xs px-2.5 py-1 rounded-[8px] border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
              >
                {attachingLeadId === suggestedLead.id ? "Attaching..." : "Attach to file"}
              </button>
              <button
                onClick={() => onOpenLead(suggestedLead.id)}
                className="text-xs px-2.5 py-1 rounded-[8px] border border-overlay-8 text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                Open suggested file
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {searchDigits.last4 && (
              <button
                onClick={() => runNearbySearch(searchDigits.last4 as string, `Last 4: ${searchDigits.last4}`)}
                disabled={searchingNearby}
                className="text-xs px-2.5 py-1 rounded-[8px] border border-overlay-8 text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-60"
              >
                Search last 4
              </button>
            )}
            {searchDigits.last7 && (
              <button
                onClick={() => runNearbySearch(searchDigits.last7 as string, `Last 7: ${searchDigits.last7}`)}
                disabled={searchingNearby}
                className="text-xs px-2.5 py-1 rounded-[8px] border border-overlay-8 text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-60"
              >
                Search last 7
              </button>
            )}
          </div>

          {reviewMatches.length > 0 && (
            <div className="space-y-2 mt-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/45">
                {nearbyLabel ? `Nearby matches · ${nearbyLabel}` : "Candidate matches"}
              </p>
              {reviewMatches.map((candidate) => (
                <div
                  key={`${candidate.id}-${candidate.matchReason}-${candidate.matchedPhone ?? ""}`}
                  className="rounded-[10px] border border-overlay-8 bg-background/20 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{candidate.name}</p>
                      <p className="text-xs text-muted-foreground/60 truncate">
                        {[candidate.matchReason, candidate.propertyAddress, formatPhone(candidate.matchedPhone ?? phone)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onOpenLead(candidate.id)}
                        className="text-xs px-2 py-1 rounded-[8px] border border-overlay-8 text-muted-foreground/70 hover:text-foreground transition-colors"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleAttach(candidate.id)}
                        disabled={attachingLeadId === candidate.id}
                        className="text-xs px-2 py-1 rounded-[8px] border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
                      >
                        {attachingLeadId === candidate.id ? "Attaching..." : "Attach"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={updateStickiness}
        className="flex-1 overflow-y-auto min-h-0 space-y-2 py-1 scrollbar-thin"
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 text-center py-6">No messages yet</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col max-w-[85%]",
                msg.direction === "outbound" ? "ml-auto items-end" : "mr-auto items-start",
              )}
            >
              <div
                className={cn(
                  "px-3 py-1.5 rounded-[12px] text-sm whitespace-pre-wrap break-words",
                  msg.direction === "outbound"
                    ? "bg-primary/10 border border-primary/15 text-foreground"
                    : "bg-overlay-6 border border-overlay-8 text-foreground",
                )}
              >
                {msg.body}
              </div>
              <div className="flex items-center gap-1 mt-0.5 px-1">
                <span className="text-[10px] text-muted-foreground/40">
                  {formatTime(msg.created_at)}
                </span>
                {msg.direction === "outbound" && deliveryIcon(msg.twilio_status)}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      <div className="border-t border-overlay-6 pt-2 mt-1">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={2}
            className="flex-1 bg-overlay-3 border border-overlay-8 rounded-[10px] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 max-h-28"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className={cn(
              "p-2 rounded-[10px] transition-all shrink-0",
              draft.trim()
                ? "bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25"
                : "bg-overlay-3 text-muted-foreground/30 border border-overlay-6",
            )}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => onCallNow(phone)}
            className="text-xs px-2.5 py-1 rounded-[8px] border border-overlay-8 text-muted-foreground/60 hover:text-foreground hover:border-overlay-20 transition-colors flex items-center gap-1"
          >
            <Phone className="h-3 w-3" />
            Call Now
          </button>
          {!leadInfo && (
            <button
              onClick={() => toast.info("Open the lead queue and search for this number to convert")}
              className="text-xs px-2.5 py-1 rounded-[8px] border border-overlay-8 text-muted-foreground/60 hover:text-foreground hover:border-overlay-20 transition-colors flex items-center gap-1"
            >
              <UserPlus className="h-3 w-3" />
              Convert to Lead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Compose New ───────────────────────────────────────────────────────

function ComposeNew({
  onBack,
  onSent,
}: {
  onBack: () => void;
  onSent: (phone: string) => void;
}) {
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const normalizePhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return raw;
  };

  const handleSend = async () => {
    const phone = normalizePhone(to.trim());
    if (!phone || !body.trim() || sending) return;
    setSending(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/twilio/sms/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ to: phone, body: body.trim(), leadId: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Send failed");
      } else {
        onSent(phone);
      }
    } catch {
      toast.error("Network error");
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex items-center gap-2 pb-2 border-b border-overlay-6">
        <button onClick={onBack} className="p-1 rounded hover:bg-overlay-6 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <span className="text-sm font-semibold text-foreground">New Message</span>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground/60 mb-1 block">To (phone number)</label>
          <input
            type="tel"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="(509) 555-0100"
            className="w-full bg-overlay-3 border border-overlay-8 rounded-[10px] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground/60 mb-1 block">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={3}
            className="w-full bg-overlay-3 border border-overlay-8 rounded-[10px] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 max-h-36"
          />
        </div>
      </div>

      <button
        onClick={handleSend}
        disabled={!to.trim() || !body.trim() || sending}
        className={cn(
          "flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-sm font-medium transition-all",
          to.trim() && body.trim()
            ? "bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25"
            : "bg-overlay-3 text-muted-foreground/30 border border-overlay-6 cursor-not-allowed",
        )}
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        Send Message
      </button>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────

interface SmsMessagesPanelProps {
  onCallNumber: (phone: string) => void;
}

export function SmsMessagesPanel({ onCallNumber }: SmsMessagesPanelProps) {
  const { openModal } = useModal();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<SmsThread[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const prevUnreadRef = useRef(0);

  const fetchThreads = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/twilio/sms/threads", { headers });
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
        const newUnread = data.totalUnread ?? 0;

        // Play notification sound if new unread arrived while panel is collapsed
        if (newUnread > prevUnreadRef.current && !open) {
          try {
            const audio = new Audio("/sounds/notification.mp3");
            audio.volume = 0.3;
            audio.play().catch(() => {});
          } catch { /* no sound file, skip */ }
        }
        prevUnreadRef.current = newUnread;
        setTotalUnread(newUnread);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  }, [open]);

  useEffect(() => {
    setLoading(true);
    fetchThreads();
    const interval = setInterval(fetchThreads, 10000);
    return () => clearInterval(interval);
  }, [fetchThreads]);

  const handleOpenThread = (phone: string) => {
    setActivePhone(phone);
    setComposing(false);
    // Optimistically decrement unread for this thread
    setThreads((prev) =>
      prev.map((t) =>
        t.phone === phone ? { ...t, unreadCount: 0 } : t,
      ),
    );
    const thread = threads.find((t) => t.phone === phone);
    if (thread) {
      setTotalUnread((prev) => Math.max(0, prev - thread.unreadCount));
    }
  };

  return (
    <GlassCard hover={false} className="!p-3 mb-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setOpen((prev) => !prev); setActivePhone(null); setComposing(false); }}
          className="flex items-center gap-1.5 group"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
            Messages
            {totalUnread > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold border border-blue-500/30">
                {totalUnread}
              </span>
            )}
          </h2>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            setActivePhone(null);
            setComposing(true);
          }}
          title="New message"
          className="p-1 rounded hover:bg-overlay-6 transition-colors text-muted-foreground/50 hover:text-primary"
        >
          <SquarePen className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2 mt-2 border-t border-overlay-6" style={{ maxHeight: "70vh", minHeight: "300px" }}>
              {composing ? (
                <ComposeNew
                  onBack={() => setComposing(false)}
                  onSent={(phone) => {
                    setComposing(false);
                    setActivePhone(phone);
                    fetchThreads();
                  }}
                />
              ) : activePhone ? (
                <div style={{ height: "min(65vh, 600px)" }}>
                  <ThreadDetail
                    phone={activePhone}
                    onBack={() => { setActivePhone(null); fetchThreads(); }}
                    onCallNow={onCallNumber}
                    onOpenLead={(leadId) => openModal("client-file", { leadId })}
                  />
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
                </div>
              ) : threads.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare className="h-5 w-5 mx-auto text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground/40">No messages yet</p>
                </div>
              ) : (
                <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: "60vh" }}>
                  {threads.map((thread) => (
                    <ThreadRow
                      key={thread.phone}
                      thread={thread}
                      onClick={() => handleOpenThread(thread.phone)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
