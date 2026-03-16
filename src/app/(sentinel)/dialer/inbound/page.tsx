"use client";

/**
 * /dialer/inbound — Live Inbound Call Assistant
 *
 * Logan bookmarks this page. When a seller calls, he answers on his cell and
 * opens this URL on his laptop/tablet to see instant context.
 *
 * Usage patterns:
 *   /dialer/inbound                   — shows most recent inbound event (answered or missed)
 *   /dialer/inbound?phone=+15095551234 — direct lookup by caller number
 *   /dialer/inbound?event_id=UUID     — specific inbound event
 *
 * Features:
 *   1. Caller identity + lead match status
 *   2. CRM context: stage, motivation, timeline, call history
 *   3. Last operator note / promised callback (from SellerMemoryPanel data)
 *   4. Open task (what was promised on the last call)
 *   5. Dossier snippet if a reviewed dossier exists
 *   6. Post-call outcome capture: answered / voicemail / wrong number /
 *      callback requested / appointment
 *
 * No voice control. No autonomous AI. Operator stays the caller-facing human.
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneIncoming, Phone, User, MapPin, CheckSquare,
  CalendarCheck, Voicemail, XCircle, ArrowRight, MessageSquare,
  Loader2, RefreshCw, Brain, TrendingUp, FileText, CheckCircle2,
  AlertTriangle, ExternalLink, ShoppingBag, Wrench, Ban, HelpCircle,
  Home, Zap, ChevronRight, ChevronLeft,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import type { CRMLeadContext } from "@/lib/dialer/types";
import type { InboundContextResponse, InboundEventMeta } from "@/app/api/dialer/v1/inbound/context/route";
import type { InboundCallerType } from "@/app/api/dialer/v1/inbound/[event_id]/classify/route";
import { WarmTransferCard } from "@/components/sentinel/warm-transfer-card";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Caller type options (Step 1) ─────────────────────────────────────────────

interface CallerTypeMeta {
  key: InboundCallerType;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  hint: string;
}

const CALLER_TYPE_OPTIONS: CallerTypeMeta[] = [
  {
    key: "seller",
    label: "Seller",
    icon: Home,
    color: "text-cyan",
    bg: "bg-cyan/8 hover:bg-cyan/15 border-cyan/15",
    hint: "Homeowner calling about a property",
  },
  {
    key: "buyer",
    label: "Buyer",
    icon: ShoppingBag,
    color: "text-purple-400",
    bg: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20",
    hint: "Investor / cash buyer looking for deals",
  },
  {
    key: "vendor",
    label: "Vendor",
    icon: Wrench,
    color: "text-orange-400",
    bg: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20",
    hint: "Contractor, title, agent, service provider",
  },
  {
    key: "spam",
    label: "Spam",
    icon: Ban,
    color: "text-red-400",
    bg: "bg-red-500/10 hover:bg-red-500/20 border-red-500/20",
    hint: "Robocall or telemarketer",
  },
  {
    key: "unknown",
    label: "Unknown",
    icon: HelpCircle,
    color: "text-zinc-400",
    bg: "bg-zinc-500/10 hover:bg-zinc-500/20 border-zinc-500/20",
    hint: "Couldn't determine — needs follow-up",
  },
];

// ── Context card helpers ──────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, { label: string; color: string }> = {
  offer_ready: { label: "Offer Ready",  color: "text-emerald-400" },
  follow_up:   { label: "Follow Up",    color: "text-cyan" },
  nurture:     { label: "Nurture",      color: "text-purple-400" },
  dead:        { label: "Dead",         color: "text-red-400" },
  escalate:    { label: "Escalate",     color: "text-orange-400" },
};

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  "30_days": "30 days",
  "60_days": "60 days",
  flexible:  "Flexible",
  unknown:   "Unknown",
};

function MotivationDots({ level }: { level: number | null }) {
  if (level == null) return <span className="text-[11px] text-muted-foreground/40">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          className={`h-2 w-2 rounded-full ${n <= level
            ? level >= 4 ? "bg-emerald-400" : level >= 2 ? "bg-cyan" : "bg-zinc-500"
            : "bg-white/[0.08]"
          }`}
        />
      ))}
      <span className="ml-1 text-[10px] text-muted-foreground/50">{level}/5</span>
    </div>
  );
}

// ── Context display ───────────────────────────────────────────────────────────

function CallerContext({ data, phone }: { data: InboundContextResponse; phone: string }) {
  const { lead, event, dossier_snippet } = data;
  const ctx = lead;

  const routeMeta = ctx?.qualificationRoute ? ROUTE_LABELS[ctx.qualificationRoute] : null;

  return (
    <div className="space-y-3">

      {/* ── Caller identity ── */}
      <GlassCard hover={false} className="!p-3">
        <div className="flex items-start gap-3">
          <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
            ctx ? "bg-cyan/10 border border-cyan/20" : "bg-zinc-800 border border-white/10"
          }`}>
            <User className={`h-4 w-4 ${ctx ? "text-cyan" : "text-muted-foreground/40"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">
                {ctx?.ownerName ?? "Unknown caller"}
              </span>
              {!ctx && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground/50">
                  No lead match
                </Badge>
              )}
              {routeMeta && (
                <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${routeMeta.color} border-current/20`}>
                  {routeMeta.label}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Phone className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground/60">{phone}</span>
            </div>
            {ctx?.address && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <MapPin className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/60">{ctx.address}</span>
              </div>
            )}
          </div>
          {ctx && (
            <Link
              href={`/leads?open=${ctx.leadId}`}
              className="shrink-0 text-[10px] text-cyan/60 hover:text-cyan flex items-center gap-0.5"
            >
              Lead <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          )}
        </div>
      </GlassCard>

      {/* ── Call event timing ── */}
      {event && (
        <div className={`flex items-center gap-2 rounded-[10px] px-3 py-2 text-[11px] border ${
          event.event_type === "inbound.answered"
            ? "bg-emerald-500/[0.05] border-emerald-500/20 text-emerald-400/80"
            : "bg-amber-500/[0.05] border-amber-500/20 text-amber-400/80"
        }`}>
          <PhoneIncoming className="h-3 w-3 shrink-0" />
          <span>
            {event.event_type === "inbound.answered" ? "Call answered" : "Missed call"}{" "}
            {new Date(event.occurred_at).toLocaleTimeString("en-US", {
              hour: "numeric", minute: "2-digit", hour12: true,
            })}
          </span>
          {event.has_outcome && (
            <Badge className="ml-auto bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] h-4 px-1.5">
              Logged
            </Badge>
          )}
        </div>
      )}

      {/* ── Qualification snapshot (only if lead matched) ── */}
      {ctx && (
        <GlassCard hover={false} className="!p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Brain className="h-3 w-3 text-purple-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/80">
              Seller Context
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground/40">
              {ctx.totalCalls} call{ctx.totalCalls !== 1 ? "s" : ""} · {ctx.liveAnswers} answered
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] text-muted-foreground/40 uppercase mb-1">Motivation</p>
              <MotivationDots level={ctx.motivationLevel} />
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/40 uppercase mb-1">Timeline</p>
              <span className="text-[11px] text-foreground/80">
                {ctx.sellerTimeline ? TIMELINE_LABELS[ctx.sellerTimeline] ?? ctx.sellerTimeline : "—"}
              </span>
            </div>
          </div>

          {ctx.lastCallDisposition && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground/50">Last outcome</span>
              <span className="font-medium capitalize text-foreground/80">
                {ctx.lastCallDisposition.replace(/_/g, " ")}
              </span>
            </div>
          )}

          {/* Open task — what was promised */}
          {ctx.openTaskTitle && (
            <div className="flex items-start gap-1.5 rounded-[8px] bg-amber-500/[0.06] border border-amber-500/20 px-2.5 py-1.5">
              <CheckSquare className="h-3 w-3 text-amber-400/70 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] text-amber-300/90 font-medium leading-snug truncate">
                  {ctx.openTaskTitle}
                </p>
                {ctx.openTaskDueAt && (
                  <p className="text-[10px] text-amber-400/50 mt-0.5">
                    Due{" "}
                    {new Date(ctx.openTaskDueAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Last call notes (operator-published — highest trust) */}
          {ctx.lastCallNotes && (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-[9px] text-muted-foreground/40 uppercase">Last call notes</span>
              </div>
              <p className="text-[11px] text-foreground/80 leading-relaxed pl-4">
                {ctx.lastCallNotes}
              </p>
            </div>
          )}

          {/* AI summary as fallback only */}
          {!ctx.lastCallNotes && ctx.lastCallAiSummary && (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Brain className="h-3 w-3 text-purple-400/40" />
                <span className="text-[9px] text-purple-400/50 uppercase">AI summary (unreviewed)</span>
              </div>
              <p className="text-[11px] text-foreground/60 leading-relaxed italic pl-4">
                {ctx.lastCallAiSummary}
              </p>
            </div>
          )}
        </GlassCard>
      )}

      {/* ── Dossier snippet (reviewed only) ── */}
      {dossier_snippet && (
        <GlassCard hover={false} className="!p-3 border-cyan/10">
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText className="h-3 w-3 text-cyan/60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan/60">
              Dossier (reviewed)
            </span>
          </div>
          <p className="text-[11px] text-foreground/80 leading-relaxed">{dossier_snippet}</p>
        </GlassCard>
      )}

      {/* ── No lead match fallback ── */}
      {!ctx && (
        <GlassCard hover={false} className="!p-3 border-muted/20">
          <div className="flex items-center gap-2 text-muted-foreground/50">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <p className="text-[11px]">
              No lead found for {phone}. This may be a new seller.{" "}
              <Link href="/leads" className="text-cyan/60 hover:text-cyan">Create lead →</Link>
            </p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

// ── Routing action labels ─────────────────────────────────────────────────────

const ROUTING_LABELS: Record<string, { label: string; color: string }> = {
  warm_transfer_flagged: { label: "Warm transfer ready",  color: "text-red-400" },
  callback_booked:       { label: "Callback booked",      color: "text-cyan" },
  seller_follow_up:      { label: "Seller follow-up",     color: "text-purple-400" },
  buyer_follow_up:       { label: "Buyer follow-up",      color: "text-blue-400" },
  vendor_closed:         { label: "Vendor — closed",      color: "text-orange-400/60" },
  spam_closed:           { label: "Spam — closed",        color: "text-red-400/50" },
  clarification_needed:  { label: "Clarification needed", color: "text-amber-400" },
};

// ── ClassifyForm — 2-step: caller type → seller intake ───────────────────────

interface ClassifyIntakeResult {
  callerType: InboundCallerType;
  routingAction: string;
  warmTransferReady: boolean;
  subjectAddress: string | null;
  situationSummary: string | null;
}

function ClassifyForm({
  eventId,
  alreadyClassified,
  onClassified,
}: {
  eventId: string;
  alreadyClassified: boolean;
  onClassified: (result: ClassifyIntakeResult) => void;
}) {
  const [step, setStep]           = useState<1 | 2>(1);
  const [callerType, setCallerType] = useState<InboundCallerType | null>(null);
  const [subjectAddress, setSubjectAddress]     = useState("");
  const [situationSummary, setSituationSummary] = useState("");
  const [preferredCallback, setPreferredCallback] = useState("");
  const [warmTransferReady, setWarmTransferReady] = useState(false);
  const [notes, setNotes]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(alreadyClassified);
  const [result, setResult]       = useState<{ callerType: InboundCallerType; routingAction: string } | null>(null);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit() {
    if (!callerType) return;
    setSubmitting(true);
    setError(null);
    try {
      const h = await authHeaders();
      const body: Record<string, unknown> = { caller_type: callerType };
      if (callerType === "seller") {
        if (subjectAddress)    body.subject_address    = subjectAddress.trim();
        if (situationSummary)  body.situation_summary  = situationSummary.trim();
        if (preferredCallback) body.preferred_callback = preferredCallback.trim();
        body.warm_transfer_ready = warmTransferReady;
      }
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch(`/api/dialer/v1/inbound/${eventId}/classify`, {
        method: "POST",
        headers: h,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Failed to classify");
      }
      const data = await res.json();
      setDone(true);
      setResult({ callerType, routingAction: data.routing_action });
      onClassified({
        callerType,
        routingAction: data.routing_action,
        warmTransferReady,
        subjectAddress:   subjectAddress.trim() || null,
        situationSummary: situationSummary.trim() || null,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error classifying call");
    } finally {
      setSubmitting(false);
    }
  }

  if (done && result) {
    const routeMeta = ROUTING_LABELS[result.routingAction];
    const typeMeta = CALLER_TYPE_OPTIONS.find(t => t.key === result.callerType);
    const TypeIcon = typeMeta?.icon ?? CheckCircle2;
    return (
      <div className="flex items-center gap-2 rounded-[10px] bg-emerald-500/[0.06] border border-emerald-500/20 px-3 py-2.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <TypeIcon className={`h-3 w-3 ${typeMeta?.color ?? "text-muted-foreground"}`} />
          <span className={`text-[11px] font-medium ${typeMeta?.color ?? ""}`}>
            {typeMeta?.label}
          </span>
          {routeMeta && (
            <>
              <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/40" />
              <span className={`text-[11px] ${routeMeta.color}`}>{routeMeta.label}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] bg-emerald-500/[0.06] border border-emerald-500/20 px-3 py-2.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span className="text-[11px] text-emerald-400/90">Classified.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Step header */}
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/50" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          {step === 1 ? "Who is calling?" : "Seller intake"}
        </h3>
        {step === 2 && (
          <button
            onClick={() => { setStep(1); setCallerType(null); }}
            className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70"
          >
            <ChevronLeft className="h-3 w-3" /> Back
          </button>
        )}
      </div>

      {/* ── Step 1: Caller type ── */}
      {step === 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CALLER_TYPE_OPTIONS.map(t => {
            const Icon = t.icon;
            return (
              <motion.button
                key={t.key}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setCallerType(t.key);
                  if (t.key === "seller") {
                    setStep(2);
                  } else {
                    // Non-seller types go straight to submit
                    setCallerType(t.key);
                  }
                }}
                className={`flex flex-col items-start gap-1 rounded-[10px] border px-3 py-2.5 text-left transition-all ${t.bg}`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${t.color}`} />
                  <span className={`text-[11px] font-medium ${t.color}`}>{t.label}</span>
                </div>
                <span className="text-[9px] text-muted-foreground/40 leading-tight">{t.hint}</span>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* ── Step 1 non-seller: show submit immediately ── */}
      <AnimatePresence>
        {step === 1 && callerType && callerType !== "seller" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <div>
              <label className="text-[10px] text-muted-foreground/50 uppercase block mb-1">
                Note (optional)
              </label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={callerType === "vendor" ? "Company / rep name…" : "Brief note…"}
                className="h-7 text-[11px]"
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
            </div>
            <Button onClick={handleSubmit} disabled={submitting} className="w-full h-8 text-xs">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Log {CALLER_TYPE_OPTIONS.find(t => t.key === callerType)?.label}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Step 2: Seller intake ── */}
      {step === 2 && callerType === "seller" && (
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-2.5"
        >
          {/* Warm transfer — most prominent since it drives the hottest action */}
          <div
            onClick={() => setWarmTransferReady(!warmTransferReady)}
            className={`flex items-center gap-2 rounded-[10px] border cursor-pointer px-3 py-2 transition-all ${
              warmTransferReady
                ? "bg-red-500/10 border-red-500/30"
                : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]"
            }`}
          >
            <Zap className={`h-3.5 w-3.5 shrink-0 ${warmTransferReady ? "text-red-400" : "text-muted-foreground/30"}`} />
            <span className={`text-[11px] font-medium ${warmTransferReady ? "text-red-400" : "text-muted-foreground/50"}`}>
              Ready for warm transfer
            </span>
            <span className="ml-auto text-[9px] text-muted-foreground/30">tap to toggle</span>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground/50 uppercase block mb-1">
              Subject address <span className="text-muted-foreground/30">(optional)</span>
            </label>
            <Input
              value={subjectAddress}
              onChange={e => setSubjectAddress(e.target.value)}
              placeholder="123 Main St, Spokane WA…"
              className="h-7 text-[11px]"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground/50 uppercase block mb-1">
              Situation summary <span className="text-muted-foreground/30">(optional)</span>
            </label>
            <Textarea
              value={situationSummary}
              onChange={e => setSituationSummary(e.target.value)}
              placeholder="Inherited, probate, behind on payments, divorce, etc.…"
              rows={2}
              className="text-[11px] resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground/50 uppercase block mb-1">
              Preferred callback <span className="text-muted-foreground/30">(optional)</span>
            </label>
            <Input
              value={preferredCallback}
              onChange={e => setPreferredCallback(e.target.value)}
              placeholder="Tues morning, tomorrow after 2pm, 2025-07-10T10:00…"
              className="h-7 text-[11px]"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground/50 uppercase block mb-1">
              Additional notes <span className="text-muted-foreground/30">(optional)</span>
            </label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything else worth capturing…"
              className="h-7 text-[11px]"
            />
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className={`w-full h-8 text-xs ${
            warmTransferReady ? "bg-red-500/80 hover:bg-red-500 text-white border-red-500/40" : ""
          }`}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
            {warmTransferReady ? "🔥 Flag warm transfer" : "Log seller intake"}
          </Button>
        </motion.div>
      )}

      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </div>
  );
}

// ── Phone search form ─────────────────────────────────────────────────────────

function PhoneSearch({ onSearch }: { onSearch: (phone: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="+15095551234"
        className="h-8 text-sm"
        onKeyDown={e => e.key === "Enter" && value.trim() && onSearch(value.trim())}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0"
        onClick={() => value.trim() && onSearch(value.trim())}
      >
        Look up
      </Button>
    </div>
  );
}

// ── Inner page (needs search params) ─────────────────────────────────────────

function InboundPageInner() {
  const searchParams = useSearchParams();
  const phoneParam   = searchParams.get("phone")    ?? "";
  const eventIdParam = searchParams.get("event_id") ?? "";

  const [phone, setPhone]   = useState(phoneParam);
  const [eventId, setEventId] = useState(eventIdParam);
  const [data, setData]     = useState<InboundContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [classified, setClassified] = useState(false);
  const [classifyIntake, setClassifyIntake] = useState<ClassifyIntakeResult | null>(null);

  const load = useCallback(async (overridePhone?: string, overrideEventId?: string) => {
    const targetPhone   = overridePhone   ?? phone;
    const targetEventId = overrideEventId ?? eventId;

    if (!targetPhone && !targetEventId) {
      // Try to load the most recent inbound event with no filter
      // Use the context endpoint without params — it returns the last event
    }

    setLoading(true);
    setError(null);
    try {
      const h = await authHeaders();
      const params = new URLSearchParams();
      if (targetPhone)   params.set("phone",    targetPhone);
      if (targetEventId) params.set("event_id", targetEventId);
      const url = `/api/dialer/v1/inbound/context${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { headers: h });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Failed to load context");
      }
      const result: InboundContextResponse = await res.json();
      setData(result);
      // Sync event_id from response for classify form
      if (result.event?.event_id) setEventId(result.event.event_id);
      setClassified(result.event?.has_outcome ?? false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error loading context");
    } finally {
      setLoading(false);
    }
  }, [phone, eventId]);

  // Auto-load on mount if we have params
  useEffect(() => {
    if (phoneParam || eventIdParam) {
      load(phoneParam || undefined, eventIdParam || undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount only

  function handleSearch(newPhone: string) {
    setPhone(newPhone);
    setEventId("");
    load(newPhone, "");
  }

  return (
    <PageShell
      title="Inbound Call"
      description="Live caller context — open when a seller calls in."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] gap-1"
            onClick={() => load()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </Button>
          <Link
            href="/dialer/war-room"
            className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            War Room
          </Link>
        </div>
      }
    >
      <div className="max-w-xl mx-auto space-y-4">

        {/* ── Phone lookup ── */}
        <GlassCard hover={false} className="!p-3">
          <p className="text-[10px] text-muted-foreground/50 uppercase mb-2">
            Caller phone number
          </p>
          <PhoneSearch onSearch={handleSearch} />
          <p className="text-[10px] text-muted-foreground/30 mt-1.5">
            Or bookmark this page — it auto-loads the most recent inbound event when
            visited without a phone/event_id.
          </p>
        </GlassCard>

        {/* ── Loading state ── */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" />
          </div>
        )}

        {/* ── Error state ── */}
        {error && !loading && (
          <div className="flex items-center gap-2 rounded-[10px] bg-destructive/10 border border-destructive/20 px-3 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <p className="text-[11px] text-destructive">{error}</p>
          </div>
        )}

        {/* ── Context ── */}
        {!loading && data && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <CallerContext data={data} phone={data.from_number || phone} />

            {/* ── Classify + intake (only if there's an event) ── */}
            {data.event && (
              <GlassCard hover={false} className="!p-3">
                <ClassifyForm
                  eventId={data.event.event_id}
                  alreadyClassified={classified}
                  onClassified={(result) => {
                    setClassified(true);
                    setClassifyIntake(result);
                  }}
                />
              </GlassCard>
            )}

            {/* ── Warm Transfer Card — shown after classify when warm_transfer_ready ── */}
            {classified && classifyIntake?.warmTransferReady && data.event && (
              <WarmTransferCard
                inboundEventId={data.event.event_id}
                subjectAddress={classifyIntake.subjectAddress}
                situationSummary={classifyIntake.situationSummary}
                fromNumber={data.from_number}
                crmContext={data.lead}
                dossierSnippet={data.dossier_snippet}
                onOutcomeLogged={() => {
                  // Optionally reload context after transfer logged
                }}
              />
            )}
          </motion.div>
        )}

        {/* ── Empty state (no params, no data) ── */}
        {!loading && !data && !error && (
          <div className="text-center py-8 space-y-1">
            <PhoneIncoming className="h-8 w-8 text-muted-foreground/20 mx-auto" />
            <p className="text-sm text-muted-foreground/40">
              Enter a caller number above, or wait for an inbound call.
            </p>
            <p className="text-[11px] text-muted-foreground/30">
              This page auto-populates when you navigate here after a call.
            </p>
          </div>
        )}

      </div>
    </PageShell>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function InboundPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
      </div>
    }>
      <InboundPageInner />
    </Suspense>
  );
}
