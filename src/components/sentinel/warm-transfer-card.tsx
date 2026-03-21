"use client";

/**
 * WarmTransferCard
 *
 * Compact live-call context card for warm-transfer-ready inbound seller calls.
 * Shown when a classified inbound event has warm_transfer_ready=true.
 *
 * Shows Logan only the essentials (scannable in 3 seconds):
 *   1. Caller identity + phone
 *   2. Subject address
 *   3. Situation summary
 *   4. Latest operator note or open task (what was promised)
 *   5. Reviewed dossier snippet if available
 *
 * Then offers a 4-tap transfer outcome logger:
 *   connected / no_answer / callback_fallback / failed
 *
 * No voice control. No AI coaching. Operator stays the caller-facing human.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Zap, Phone, MapPin, FileText, CheckSquare, MessageSquare,
  CheckCircle2, XCircle, ArrowRight, AlertTriangle, Loader2,
  PhoneForwarded, CalendarCheck,
} from "lucide-react";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import type { CRMLeadContext } from "@/lib/dialer/types";
import type { TransferOutcome } from "@/app/api/dialer/v1/inbound/[event_id]/transfer/route";
import { TrustLanguagePack } from "@/components/sentinel/trust-language-chip";
import { getAllSellerPages, type SellerPage } from "@/lib/public-pages";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Transfer outcome options ──────────────────────────────────────────────────

interface OutcomeMeta {
  key: TransferOutcome;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  needsDate?: boolean;
}

const OUTCOME_OPTIONS: OutcomeMeta[] = [
  {
    key: "connected",
    label: "Connected",
    icon: PhoneForwarded,
    color: "text-foreground",
    bg: "bg-muted/10 hover:bg-muted/20 border-border/20",
  },
  {
    key: "no_answer",
    label: "No answer",
    icon: XCircle,
    color: "text-foreground",
    bg: "bg-muted/10 hover:bg-muted/20 border-border/20",
    needsDate: true,
  },
  {
    key: "callback_fallback",
    label: "Booked callback",
    icon: CalendarCheck,
    color: "text-foreground",
    bg: "bg-muted/10 hover:bg-muted/20 border-border/20",
    needsDate: true,
  },
  {
    key: "failed",
    label: "Transfer failed",
    icon: AlertTriangle,
    color: "text-foreground",
    bg: "bg-muted/10 hover:bg-muted/20 border-border/20",
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WarmTransferCardProps {
  /** Original inbound event ID (inbound.answered or inbound.missed) */
  inboundEventId: string;
  /** From classify event metadata */
  subjectAddress:   string | null;
  situationSummary: string | null;
  fromNumber:       string;
  /** From CRM context */
  crmContext:       CRMLeadContext | null;
  /** Reviewed dossier snippet */
  dossierSnippet:   string | null;
  /** Called after a transfer outcome is logged */
  onOutcomeLogged?: (outcome: TransferOutcome) => void;
}

// ── Context row helper ────────────────────────────────────────────────────────

function ContextRow({
  icon: Icon,
  label,
  value,
  color = "text-muted-foreground/70",
  iconColor = "text-muted-foreground/40",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color?: string;
  iconColor?: string;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className={`h-3 w-3 shrink-0 mt-0.5 ${iconColor}`} />
      <div className="min-w-0">
        <span className="text-[9px] uppercase text-muted-foreground/30 block">{label}</span>
        <span className={`text-[11px] leading-snug ${color}`}>{value}</span>
      </div>
    </div>
  );
}

// ── SellerPageLinks ───────────────────────────────────────────────────────────
// Compact "Send seller to" chips for public trust pages.
// Logan can click to open the page in a new tab or copy the URL.

function SellerPageLinks() {
  const pages = getAllSellerPages();
  return (
    <div className="px-3 pb-3 border-t border-white/[0.04] pt-2 space-y-1.5">
      <span className="text-[9px] uppercase text-muted-foreground/40 tracking-wide">Send seller to</span>
      <div className="flex flex-wrap gap-1.5">
        {pages.map((page: SellerPage) => (
          <a
            key={page.key}
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            title={page.description}
            className="inline-flex items-center gap-1 text-[10px] font-medium rounded-md border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
          >
            <ArrowRight className="w-2.5 h-2.5 opacity-50" />
            {page.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// ── WarmTransferCard ──────────────────────────────────────────────────────────

export function WarmTransferCard({
  inboundEventId,
  subjectAddress,
  situationSummary,
  fromNumber,
  crmContext,
  dossierSnippet,
  onOutcomeLogged,
}: WarmTransferCardProps) {
  const [selected, setSelected]   = useState<TransferOutcome | null>(null);
  const [callbackDate, setCallbackDate] = useState("");
  const [recipientName, setRecipientName] = useState("Adam");
  const [submitting, setSubmitting] = useState(false);
  const [logged, setLogged]       = useState(false);
  const [loggedOutcome, setLoggedOutcome] = useState<TransferOutcome | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const selectedMeta = OUTCOME_OPTIONS.find(o => o.key === selected);

  async function handleLog() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const h = await authHeaders();
      const body: Record<string, unknown> = {
        outcome: selected,
        recipient_name: recipientName.trim() || "Adam",
      };
      if (callbackDate) body.fallback_callback_date = callbackDate;
      const res = await fetch(`/api/dialer/v1/inbound/${inboundEventId}/transfer`, {
        method: "POST",
        headers: h,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Failed to log transfer");
      }
      setLogged(true);
      setLoggedOutcome(selected);
      onOutcomeLogged?.(selected);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error logging transfer");
    } finally {
      setSubmitting(false);
    }
  }

  const ctx = crmContext;

  return (
    <GlassCard hover={false} className="!p-0 border-border/20 overflow-hidden">
      {/* ── Header strip ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/[0.06] border-b border-border/15">
        <Zap className="h-3.5 w-3.5 text-foreground animate-pulse shrink-0" />
        <span className="text-[11px] font-semibold text-foreground/90 uppercase tracking-wider">
          Warm Transfer Ready
        </span>
        <Badge className="ml-auto bg-muted/20 text-foreground border-border/30 text-[9px] h-4 px-1.5">
          {fromNumber}
        </Badge>
      </div>

      {/* ── Context fields ── */}
      <div className="p-3 space-y-2">

        {/* Caller identity */}
        <ContextRow
          icon={Phone}
          label="Caller"
          value={ctx?.ownerName ?? fromNumber}
          color="text-foreground/90"
          iconColor="text-primary/50"
        />

        {/* Subject address */}
        {(subjectAddress || ctx?.address) && (
          <ContextRow
            icon={MapPin}
            label="Property"
            value={subjectAddress ?? ctx?.address ?? ""}
            iconColor="text-muted-foreground/40"
          />
        )}

        {/* Situation summary */}
        {situationSummary && (
          <ContextRow
            icon={FileText}
            label="Situation"
            value={situationSummary}
            color="text-foreground/80"
            iconColor="text-foreground/50"
          />
        )}

        {/* Open task — what was promised */}
        {ctx?.openTaskTitle && (
          <ContextRow
            icon={CheckSquare}
            label="Open task"
            value={ctx.openTaskTitle}
            color="text-foreground/80"
            iconColor="text-foreground/50"
          />
        )}

        {/* Latest operator note */}
        {ctx?.lastCallNotes && (
          <ContextRow
            icon={MessageSquare}
            label="Last note"
            value={ctx.lastCallNotes.length > 120 ? ctx.lastCallNotes.slice(0, 117) + "…" : ctx.lastCallNotes}
            iconColor="text-foreground/40"
          />
        )}

        {/* Dossier snippet (reviewed only) */}
        {dossierSnippet && (
          <ContextRow
            icon={FileText}
            label="Dossier"
            value={dossierSnippet.length > 120 ? dossierSnippet.slice(0, 117) + "…" : dossierSnippet}
            color="text-primary/70"
            iconColor="text-primary/40"
          />
        )}

        {/* Motivation + timeline inline */}
        {ctx && (ctx.motivationLevel != null || ctx.sellerTimeline) && (
          <div className="flex items-center gap-3 pt-0.5">
            {ctx.motivationLevel != null && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground/30 uppercase mr-1">Motivation</span>
                {[1,2,3,4,5].map(n => (
                  <span key={n} className={`h-1.5 w-1.5 rounded-full ${
                    n <= (ctx.motivationLevel ?? 0)
                      ? (ctx.motivationLevel ?? 0) >= 4 ? "bg-muted" : "bg-primary"
                      : "bg-white/[0.08]"
                  }`} />
                ))}
              </div>
            )}
            {ctx.sellerTimeline && (
              <span className="text-[9px] text-muted-foreground/50">
                {ctx.sellerTimeline.replace("_", " ")} timeline
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Trust language quick-ref ── */}
      <div className="px-3 pb-2 border-t border-white/[0.04] pt-2">
        <TrustLanguagePack
          context="warm_transfer"
          onlyKeys={["who_we_are", "how_got_info"]}
          compact
          label="Quick scripts"
        />
      </div>

      {/* ── Send seller to ── */}
      <SellerPageLinks />

      {/* ── Transfer outcome logger ── */}
      <div className="border-t border-white/[0.05] p-3 space-y-2.5">

        {logged && loggedOutcome ? (
          <div className={`flex items-center gap-2 rounded-[8px] px-2.5 py-2 ${
            loggedOutcome === "connected"
              ? "bg-muted/10 border border-border/20"
              : "bg-muted/[0.06] border border-border/20"
          }`}>
            <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${
              loggedOutcome === "connected" ? "text-foreground" : "text-foreground"
            }`} />
            <span className={`text-[11px] font-medium ${
              loggedOutcome === "connected" ? "text-foreground/90" : "text-foreground/80"
            }`}>
              {OUTCOME_OPTIONS.find(o => o.key === loggedOutcome)?.label ?? loggedOutcome}
            </span>
          </div>
        ) : (
          <>
            <p className="text-[9px] text-muted-foreground/40 uppercase">Transfer outcome</p>

            {/* Recipient name (quick edit) */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/50 shrink-0">Transfer to</span>
              <Input
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                className="h-6 text-[11px] px-2 flex-1"
                placeholder="Adam"
              />
            </div>

            {/* Outcome buttons */}
            <div className="grid grid-cols-2 gap-1.5">
              {OUTCOME_OPTIONS.map(o => {
                const Icon = o.icon;
                const isSelected = selected === o.key;
                return (
                  <motion.button
                    key={o.key}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelected(isSelected ? null : o.key)}
                    className={`flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-left transition-all ${o.bg} ${
                      isSelected ? "ring-1 ring-current" : ""
                    }`}
                  >
                    <Icon className={`h-3 w-3 shrink-0 ${o.color}`} />
                    <span className={`text-[10px] font-medium ${o.color}`}>{o.label}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Callback date for fallback outcomes */}
            {selected && selectedMeta?.needsDate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-1"
              >
                <label className="text-[9px] text-muted-foreground/40 uppercase block">
                  Callback date/time (optional)
                </label>
                <Input
                  type="datetime-local"
                  value={callbackDate}
                  onChange={e => setCallbackDate(e.target.value)}
                  className="h-6 text-[11px]"
                />
              </motion.div>
            )}

            {selected && (
              <Button
                onClick={handleLog}
                disabled={submitting}
                className={`w-full h-7 text-[11px] ${
                  selected === "connected"
                    ? "bg-muted/80 hover:bg-muted border-border/40"
                    : ""
                }`}
              >
                {submitting
                  ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  : selected === "connected"
                    ? <PhoneForwarded className="h-3 w-3 mr-1.5" />
                    : <ArrowRight className="h-3 w-3 mr-1.5" />
                }
                Log &ldquo;{selectedMeta?.label}&rdquo;
              </Button>
            )}
          </>
        )}

        {error && <p className="text-[10px] text-destructive">{error}</p>}
      </div>
    </GlassCard>
  );
}
