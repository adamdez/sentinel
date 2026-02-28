"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  Inbox,
  Send,
  Archive,
  Star,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Paperclip,
  X,
  FileText,
  Users,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useSentinelStore } from "@/lib/store";

// ── Types ────────────────────────────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  gmail_connected: boolean;
  gmail_email: string | null;
  connected_at: string | null;
}

interface GmailStatus {
  connected: boolean;
  email: string | null;
  connected_at: string | null;
  team?: TeamMember[];
}

type Folder = "inbox" | "starred" | "sent" | "archive";

// ── Email Templates ──────────────────────────────────────────────────────

const EMAIL_TEMPLATES: Record<string, { name: string; subject: string; body: string }> = {
  contract_sent: {
    name: "Contract Sent",
    subject: "Purchase Agreement — [Property Address]",
    body: `<p>Hello,</p>
<p>Please find attached the purchase agreement for the property at <strong>[Property Address]</strong>.</p>
<p>Kindly review the terms and let us know if you have any questions. We're available at your convenience.</p>
<p>Best regards,<br/>Dominion Homes</p>`,
  },
  follow_up: {
    name: "Follow-Up",
    subject: "Following Up — [Property Address]",
    body: `<p>Hello,</p>
<p>I wanted to follow up on our previous conversation about <strong>[Property Address]</strong>.</p>
<p>Are you still considering options for your property? We'd love to continue the discussion at your convenience.</p>
<p>Best regards,<br/>Dominion Homes</p>`,
  },
  appointment_confirm: {
    name: "Appointment Confirm",
    subject: "Appointment Confirmation — [Date & Time]",
    body: `<p>Hello,</p>
<p>This confirms our scheduled appointment on <strong>[Date & Time]</strong> to discuss the property at <strong>[Property Address]</strong>.</p>
<p>Please let us know if you need to reschedule.</p>
<p>Best regards,<br/>Dominion Homes</p>`,
  },
  offer_submitted: {
    name: "Offer Submitted",
    subject: "Our Offer for [Property Address]",
    body: `<p>Hello,</p>
<p>Thank you for your time. We're pleased to present our offer for the property at <strong>[Property Address]</strong>.</p>
<p>Please find the details attached. We look forward to your response.</p>
<p>Best regards,<br/>Dominion Homes</p>`,
  },
  counter_offer: {
    name: "Counter Offer",
    subject: "Revised Offer — [Property Address]",
    body: `<p>Hello,</p>
<p>Thank you for your response regarding <strong>[Property Address]</strong>. After careful consideration, we'd like to present a revised offer.</p>
<p>Please see the attached details. We believe this is a strong and fair proposal.</p>
<p>Best regards,<br/>Dominion Homes</p>`,
  },
};

// ── Google Logo SVG ──────────────────────────────────────────────────────

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
    </svg>
  );
}

// ── Compose Modal ────────────────────────────────────────────────────────

function ComposeModal({
  open,
  onOpenChange,
  userId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentData, setAttachmentData] = useState<string | null>(null);

  const applyTemplate = (key: string) => {
    const tpl = EMAIL_TEMPLATES[key];
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setAttachmentName(file.name);
      setAttachmentData(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!to || !subject || !body) {
      setError("To, Subject, and Body are required");
      return;
    }
    setSending(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        user_id: userId,
        to,
        subject,
        html_body: body,
      };

      if (attachmentData && attachmentName) {
        const ext = attachmentName.split(".").pop()?.toLowerCase();
        const mimeType =
          ext === "pdf" ? "application/pdf" :
          ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
          "application/octet-stream";

        payload.attachments = [{ filename: attachmentName, mimeType, data: attachmentData }];
      }

      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "Send failed");
      }

      setTo("");
      setSubject("");
      setBody("");
      setAttachmentName(null);
      setAttachmentData(null);
      onOpenChange(false);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-neon" />
            Compose Email
          </DialogTitle>
          <DialogDescription>Send emails directly from Sentinel via Gmail.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Template selector */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">
              Template
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(EMAIL_TEMPLATES).map(([key, tpl]) => (
                <button
                  key={key}
                  onClick={() => applyTemplate(key)}
                  className="text-[10px] px-2.5 py-1 rounded-md border border-glass-border bg-glass hover:bg-neon/10 hover:border-neon/30 hover:text-neon transition-all"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* To */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full rounded-lg border border-glass-border bg-glass/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-neon/50"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full rounded-lg border border-glass-border bg-glass/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-neon/50"
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Compose your email..."
              className="w-full rounded-lg border border-glass-border bg-glass/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-neon/50 resize-none font-mono"
            />
          </div>

          {/* Attachment */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-neon transition-colors">
              <Paperclip className="h-3.5 w-3.5" />
              {attachmentName ?? "Attach file (PDF, DOCX)"}
              <input type="file" accept=".pdf,.docx,.doc" onChange={handleFileUpload} className="hidden" />
            </label>
            {attachmentName && (
              <button
                onClick={() => { setAttachmentName(null); setAttachmentData(null); }}
                className="text-destructive hover:text-destructive/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {error && (
            <div className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSend} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function GmailPage() {
  const { currentUser } = useSentinelStore();
  const userId = currentUser?.id;

  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox");
  const [syncing, setSyncing] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/gmail/status?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchInbox = useCallback(async () => {
    if (!userId) return;
    setInboxLoading(true);
    try {
      const res = await fetch(`/api/gmail/inbox?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      /* non-fatal */
    } finally {
      setInboxLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status?.connected) fetchInbox();
  }, [status?.connected, fetchInbox]);

  const handleConnect = async () => {
    if (!userId) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/gmail/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    await fetchInbox();
    setSyncing(false);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const extractName = (from: string) => {
    const match = from.match(/^"?([^"<]+)"?\s*</);
    return match ? match[1].trim() : from.split("@")[0];
  };

  const extractInitials = (from: string) => {
    const name = extractName(from);
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  };

  // ── Loading ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell title="Gmail" description="Loading Gmail integration…">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-neon/50" />
        </div>
      </PageShell>
    );
  }

  // ── Disconnected State ───────────────────────────────────────────────

  if (!status?.connected) {
    return (
      <PageShell title="Gmail" description="Connect your Gmail to Sentinel for integrated email management">
        <div className="flex items-center justify-center min-h-[500px]">
          <GlassCard glow className="max-w-lg w-full text-center p-10">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="mx-auto mb-6"
            >
              <div className="h-20 w-20 mx-auto rounded-2xl bg-neon/10 border border-neon/20 flex items-center justify-center shadow-[0_0_40px_rgba(0,255,136,0.15)]">
                <Mail className="h-10 w-10 text-neon" />
              </div>
            </motion.div>

            <h2 className="text-xl font-bold mb-2">Connect Gmail to Sentinel</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Send contracts, follow-ups, and offers directly from Sentinel.
              Sync your inbox for lead-linked email tracking.
            </p>

            <Button
              size="lg"
              onClick={handleConnect}
              disabled={connecting}
              className="gap-3 px-8 py-6 text-base font-semibold shadow-[0_0_30px_rgba(0,255,136,0.25)] hover:shadow-[0_0_50px_rgba(0,255,136,0.4)] transition-all"
            >
              {connecting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <GoogleLogo className="h-5 w-5" />
              )}
              {connecting ? "Redirecting…" : "Connect Gmail"}
            </Button>

            <div className="mt-6 text-[11px] text-muted-foreground/60 space-y-1">
              <p>Scopes: gmail.send, gmail.readonly, openid, email</p>
              <p>Your data never leaves Sentinel&apos;s secure infrastructure.</p>
            </div>
          </GlassCard>
        </div>
      </PageShell>
    );
  }

  // ── Connected State ──────────────────────────────────────────────────

  const folders: { id: Folder; icon: typeof Inbox; label: string; count: number }[] = [
    { id: "inbox", icon: Inbox, label: "Inbox", count: messages.filter((m) => m.unread).length },
    { id: "starred", icon: Star, label: "Starred", count: 0 },
    { id: "sent", icon: Send, label: "Sent", count: 0 },
    { id: "archive", icon: Archive, label: "Archive", count: 0 },
  ];

  return (
    <PageShell
      title="Gmail"
      description={`Connected as ${status.email}`}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="neon" className="gap-1.5 text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse" />
            Connected
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            Sync
          </Button>
          <Button size="sm" className="gap-2 text-xs" onClick={() => setComposeOpen(true)}>
            <Send className="h-3 w-3" />
            Compose
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Folder Sidebar */}
        <div className="space-y-4">
          <GlassCard hover={false} className="p-3">
            <Button
              className="w-full mb-4 gap-2"
              onClick={() => setComposeOpen(true)}
            >
              <Send className="h-4 w-4" />
              Compose
            </Button>
            <nav className="space-y-1">
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFolder(f.id)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeFolder === f.id
                      ? "bg-neon/10 text-neon border border-neon/20"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  <f.icon className="h-4 w-4" />
                  {f.label}
                  {f.count > 0 && (
                    <Badge variant="neon" className="ml-auto text-[10px]">
                      {f.count}
                    </Badge>
                  )}
                </button>
              ))}
            </nav>
          </GlassCard>

          {/* Team Status (admin only) */}
          {status.team && (
            <GlassCard hover={false} className="p-3">
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Users className="h-3 w-3" />
                Team Connections
              </h3>
              <div className="space-y-2">
                {status.team.map((member) => (
                  <div key={member.id} className="flex items-center gap-2 text-xs">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        member.gmail_connected ? "bg-neon" : "bg-muted-foreground/30"
                      }`}
                    />
                    <span className="truncate flex-1">
                      {member.name}
                    </span>
                    {member.gmail_connected ? (
                      <CheckCircle2 className="h-3 w-3 text-neon shrink-0" />
                    ) : (
                      <span className="text-muted-foreground/40 text-[10px]">—</span>
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Quick Templates */}
          <GlassCard hover={false} className="p-3">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              Quick Send
            </h3>
            <div className="space-y-1.5">
              {Object.entries(EMAIL_TEMPLATES).map(([key, tpl]) => (
                <button
                  key={key}
                  onClick={() => {
                    setComposeOpen(true);
                    setTimeout(() => {
                      const evt = new CustomEvent("sentinel:template", { detail: key });
                      window.dispatchEvent(evt);
                    }, 100);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-neon/5 hover:text-neon transition-colors"
                >
                  <Send className="h-3 w-3" />
                  {tpl.name}
                </button>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Email List */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {selectedMessage ? (
              <GlassCard hover={false} key="detail">
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="text-xs text-muted-foreground hover:text-neon transition-colors"
                  >
                    ← Back
                  </button>
                </div>
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold">{selectedMessage.subject || "(No Subject)"}</h2>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="h-8 w-8 rounded-full bg-neon/10 border border-neon/20 flex items-center justify-center text-xs font-semibold text-neon">
                      {extractInitials(selectedMessage.from)}
                    </div>
                    <div>
                      <p className="text-foreground font-medium">{extractName(selectedMessage.from)}</p>
                      <p className="text-[11px]">{selectedMessage.date}</p>
                    </div>
                  </div>
                  <div className="border-t border-glass-border pt-4 text-sm text-muted-foreground leading-relaxed">
                    {selectedMessage.snippet}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="neon"
                      className="gap-1.5 text-xs"
                      onClick={() => {
                        setComposeOpen(true);
                      }}
                    >
                      <Send className="h-3 w-3" />
                      Reply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => {
                        setComposeOpen(true);
                      }}
                    >
                      <FileText className="h-3 w-3" />
                      Send Contract
                    </Button>
                  </div>
                </div>
              </GlassCard>
            ) : (
              <GlassCard hover={false} key="list">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Mail className="h-4 w-4 text-neon" />
                    {activeFolder.charAt(0).toUpperCase() + activeFolder.slice(1)}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {messages.length} message{messages.length !== 1 ? "s" : ""}
                    </span>
                    {syncing && <Loader2 className="h-3 w-3 animate-spin text-neon" />}
                  </div>
                </div>

                {inboxLoading && messages.length === 0 ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 animate-pulse"
                      >
                        <div className="h-8 w-8 rounded-full bg-secondary/40 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-1/3 rounded bg-secondary/40" />
                          <div className="h-2 w-2/3 rounded bg-secondary/30" />
                        </div>
                        <div className="h-3 w-10 rounded bg-secondary/30" />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>No messages in {activeFolder}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {messages.map((msg, i) => (
                      <motion.button
                        key={msg.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => setSelectedMessage(msg)}
                        className={`flex items-center gap-3 w-full text-left p-3 rounded-lg transition-colors cursor-pointer ${
                          msg.unread
                            ? "bg-neon/5 border border-neon/10 hover:bg-neon/10"
                            : "bg-secondary/20 hover:bg-secondary/30"
                        }`}
                      >
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            msg.unread
                              ? "bg-neon/15 border border-neon/30 text-neon"
                              : "bg-secondary/40 text-muted-foreground"
                          }`}
                        >
                          {extractInitials(msg.from)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm truncate ${
                                msg.unread ? "font-semibold text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {extractName(msg.from)}
                            </span>
                            {msg.unread && (
                              <span className="h-1.5 w-1.5 rounded-full bg-neon shrink-0" />
                            )}
                          </div>
                          <p className={`text-xs truncate ${msg.unread ? "text-foreground/80" : "text-muted-foreground/70"}`}>
                            {msg.subject || "(No Subject)"}
                          </p>
                          <p className="text-[10px] text-muted-foreground/50 truncate">
                            {msg.snippet}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground/50 shrink-0 whitespace-nowrap">
                          {formatDate(msg.date)}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                )}
              </GlassCard>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Compose Modal */}
      <ComposeModal
        open={composeOpen}
        onOpenChange={setComposeOpen}
        userId={userId || ""}
        onSent={() => {
          fetchInbox();
        }}
      />
    </PageShell>
  );
}
