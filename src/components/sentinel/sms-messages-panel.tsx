"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageSquare, ChevronDown, ChevronRight, ArrowLeft, Send,
  Phone, UserPlus, Loader2, Check, CheckCheck, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { GlassCard } from "@/components/sentinel/glass-card";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────

interface SmsThread {
  phone: string;
  leadId: string | null;
  leadName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  direction: string;
  unreadCount: number;
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
}: {
  phone: string;
  onBack: () => void;
  onCallNow: (phone: string) => void;
}) {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async () => {
    const headers = await authHeaders();
    const res = await fetch(`/api/twilio/sms/threads/${encodeURIComponent(phone)}`, { headers });
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      setLeadInfo(data.leadInfo ?? null);
    }
    setLoading(false);
  }, [phone]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 8000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
            {leadInfo?.name ?? formatPhone(phone)}
          </p>
          {leadInfo && (
            <p className="text-xs text-muted-foreground/60 truncate">
              {leadInfo.tags?.[0] ?? leadInfo.status} · {leadInfo.score ?? "—"}
            </p>
          )}
          {!leadInfo && (
            <p className="text-xs text-muted-foreground/40 font-mono">{formatPhone(phone)}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2 py-1 scrollbar-thin">
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
            rows={1}
            className="flex-1 bg-overlay-3 border border-overlay-8 rounded-[10px] px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 max-h-20"
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

// ── Main Panel ────────────────────────────────────────────────────────

interface SmsMessagesPanelProps {
  onCallNumber: (phone: string) => void;
}

export function SmsMessagesPanel({ onCallNumber }: SmsMessagesPanelProps) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<SmsThread[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activePhone, setActivePhone] = useState<string | null>(null);
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
    <GlassCard hover={false} className="!p-3 mt-3">
      {/* Section header */}
      <button
        onClick={() => { setOpen((prev) => !prev); setActivePhone(null); }}
        className="w-full flex items-center justify-between group"
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
            <div className="pt-2 mt-2 border-t border-overlay-6" style={{ maxHeight: "420px", minHeight: "200px" }}>
              {activePhone ? (
                <div style={{ height: "380px" }}>
                  <ThreadDetail
                    phone={activePhone}
                    onBack={() => { setActivePhone(null); fetchThreads(); }}
                    onCallNow={onCallNumber}
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
                <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: "400px" }}>
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
