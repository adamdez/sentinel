"use client";



import { Fragment, useState, useCallback, useMemo, useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { motion, AnimatePresence } from "framer-motion";

import {

  X, MapPin, User, Phone, Mail, DollarSign, Home, TrendingUp,

  Calendar, Tag, Shield, Zap, ExternalLink, Clock, AlertTriangle,

  Copy, CheckCircle2, Search, Loader2, Building, Ruler, LandPlot,

  Banknote, Scale, UserX, Eye, FileText, Calculator, Globe, Send,

  Radar, LayoutDashboard, Map, Printer, ImageIcon, ChevronLeft, ChevronRight,

  Pencil, Save, Voicemail, PhoneForwarded, Brain, Crosshair, MapPinned, Wrench,

  MessageSquare, Flame, Smartphone, ShieldAlert, PhoneOff, Circle,

  RefreshCw, Target, ChevronDown, Trash2, Lock, Contact2, Plus,

  Users, Briefcase, CheckCircle, XCircle, Camera, CameraOff, ListPlus, Pin,

} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";

import { cn, formatCurrency } from "@/lib/utils";

import type { ProspectRow } from "@/hooks/use-prospects";

import {

  extractBuyerDispoTruthSnapshot,

  buyerFitVisibilityLabel,

  deriveOfferPrepHealth,

  deriveBuyerDispoVisibility,

  deriveOfferVisibilityStatus,

  dispoReadinessVisibilityLabel,

  extractOfferPrepSnapshot,

  extractOfferStatusSnapshot,

  offerVisibilityLabel,

  type LeadRow,

  offerStatusTruthLabel,

  type BuyerFitVisibility,

  type DispoReadinessVisibility,

  type OfferPrepConfidence,

  type OfferStatusTruth,

  type OfferVisibilityStatus,

} from "@/lib/leads-data";

import type { AIScore, DistressType, LeadStatus, SellerTimeline, QualificationRoute } from "@/lib/types";

import { SIGNAL_WEIGHTS } from "@/lib/scoring";

import {

  calculateWholesaleUnderwrite,

  calculateARVRange, calculateQuickScreen,

  calculateArvConfidence,

  buildValuationWarnings,

  buildValuationSnapshot,

  FORMULA_VERSION,

  DEFAULTS as VALUATION_DEFAULTS,

  type CompMetric,

  type ValuationSnapshotData,

} from "@/lib/valuation";

import { useCallNotes, type CallNote } from "@/hooks/use-call-notes";

import { CompsMap, getSatelliteTileUrl, getGoogleStreetViewLink, haversine, scoreComp, getCompQualityLabel, getCompRationale, type CompProperty, type SubjectProperty, type CompScore } from "@/components/sentinel/comps/comps-map";

import { PredictiveDistressBadge, type PredictiveDistressData } from "@/components/sentinel/predictive-distress-badge";

import { RelationshipBadge } from "@/components/sentinel/relationship-badge";

import {

  BuyerDispoTruthCard,

  BuyerDispoVisibilityCard,

  OfferStatusTruthCard,

  AcquisitionsMilestoneCard,

  type MilestoneDraft,

} from "@/components/sentinel/master-client-file/workflow-truth-cards";

import { useCoachSurface } from "@/providers/coach-provider";

import { useTwilio } from "@/providers/twilio-provider";

import { useSentinelStore } from "@/lib/store";

import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";

import { NumericInput } from "@/components/sentinel/numeric-input";

import { SellerMemoryPreview } from "@/components/sentinel/seller-memory-preview";

import { supabase } from "@/lib/supabase";

import { precheckWorkflowStageChange } from "@/lib/workflow-stage-precheck";

import { getAllowedTransitions } from "@/lib/lead-guardrails";

import { LeadDossierPanel, type DeepCrawlSnapshot } from "@/components/sentinel/lead-dossier-panel";

import { BrickedAnalysisPanel, type BrickedAnalysisPanelProps } from "@/components/sentinel/bricked/bricked-analysis-panel";

import { LegalBriefPanel } from "@/components/sentinel/legal/legal-brief-panel";

import { QuickTaskSetter, type QuickTaskResult } from "@/components/sentinel/quick-task-setter";

import { createTask as createTaskApi, type TaskItem } from "@/hooks/use-tasks";

import { IntakeGuideSection } from "@/components/sentinel/intake-guide-section";

import { formatDueDateLabel } from "@/lib/due-date-label";

import { buildOperatorWorkflowSummary } from "@/components/sentinel/operator-workflow-summary";

import { formatOwnerName } from "@/lib/format-name";

import { toast } from "sonner";

import { extractProspectingSnapshot, sourceChannelLabel, tagLabel } from "@/lib/prospecting";

import Link from "next/link";

import { useDealBuyers } from "@/hooks/use-buyers";

import { dealBuyerStatusLabel } from "@/lib/buyer-types";

// ------------------------------------------------------------

import {

  type ClientFile,

  clientFileFromProspect,

  clientFileFromLead,

  clientFileFromRaw,

  type TabId,

  type WorkflowStageId,

  type ScoreType,

  type QualificationDraft,

  type OfferPrepSnapshotDraft,

  type OfferStatusSnapshotDraft,

  type BuyerDispoTruthDraft,

  type CloseoutNextAction,

  type CloseoutPresetId,

  buildAddress,

  extractLatLng,

  formatDateTimeShort,

  formatRelativeFromNow,

  qualificationRouteLabel,

  normalizeWorkflowStage,

  workflowStageLabel,

  sourceDisplayLabel,

  marketDisplayLabel,

  toLocalDateTimeInput,

  fromLocalDateTimeInput,

  presetDateTimeLocal,

  routeForCloseoutAction,

  closeoutActionLabel,

  closeoutNextActionText,

  getQualificationDraft,

  toDraftCurrency,

  parseDraftCurrency,

  getOfferPrepDraft,

  getOfferStatusDraft,

  getBuyerDispoTruthDraft,

  dispositionColor,

  parseSuggestedRoute,

  CALL_OUTCOME_OPTIONS,

  CLOSEOUT_PRESETS,

  OUTCOME_PRESET_DEFAULTS,

  SELLER_TIMELINE_OPTIONS,

  QUALIFICATION_ROUTE_OPTIONS,

  OFFER_PREP_CONFIDENCE_OPTIONS,

  OFFER_STATUS_OPTIONS,

  SCORE_LABEL_CFG,

  COUNTY_LINKS,

} from "./master-client-file-helpers";

import {

  InfoRow, Section, CopyBtn, ScoreCard,

  getTier, TIER_COLORS, OwnerFlag,

} from "./master-client-file-parts";

import { ScoreBreakdownModal, DISTRESS_CFG } from "./score-breakdown-modal";

import {

  EditDetailsModal,

  DeleteConfirmationModal,

  DeepCrawlPanel,

  DeepSkipPanel,

  CrawlProgressIndicator,

  LinkedBuyersSummary,

  type CrawlStep,

} from "./master-client-file/client-file-panels";

import { ContactTab } from "./master-client-file/contact-tab";

import type { PhoneDetail, EmailDetail, SkipTraceOverlay, SkipTraceError } from "./master-client-file/contact-types";

import { BuyerRadarPanel } from "./master-client-file/buyer-radar-panel";

import { MonetizabilityEditor } from "./master-client-file/monetizability-editor";

import { DossierBlock } from "./master-client-file/dossier-block";

import type { LeadDossierType } from "./master-client-file/dossier-block";

import { NegativeIntelligenceBlock } from "./negative-intelligence-block";

import { NextActionCard } from "./master-client-file/next-action-card";

import { SellerSnapshot } from "./master-client-file/seller-snapshot";

import { QualificationGaps } from "./master-client-file/qualification-gaps";



// Re-export for consumers that import from this file

export type { ClientFile };

export { clientFileFromProspect, clientFileFromLead, clientFileFromRaw };



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ClientFile — single unified shape for every funnel stage

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



// [EXTRACTED] ClientFile + adapters -- see extracted module files



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Constants

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



// ------------------------------------------------------------

function IntelligenceSummaryBlock({ cf }: { cf: ClientFile }) {

  const hasAnyIntel =

    cf.sellerSituationSummaryShort ||

    cf.recommendedCallAngle ||

    cf.topFact1 ||

    cf.opportunityScore != null ||

    cf.contactabilityScore != null ||

    cf.confidenceScore != null;



  if (!hasAnyIntel) return null;



  const facts = [cf.topFact1, cf.topFact2, cf.topFact3].filter(Boolean) as string[];



  function scoreBar(label: string, value: number | null, color: string) {

    if (value == null) return null;

    return (

      <div className="space-y-1">

        <div className="flex items-center justify-between text-sm">

          <span className="text-muted-foreground uppercase tracking-wider font-medium">{label}</span>

          <span className="font-semibold text-foreground">{value}</span>

        </div>

        <div className="h-1.5 rounded-full bg-overlay-6 overflow-hidden">

          <div

            className={cn("h-full rounded-full transition-all", color)}

            style={{ width: `${Math.min(value, 100)}%` }}

          />

        </div>

      </div>

    );

  }



  return (

    <div className="rounded-[12px] border border-overlay-8 bg-overlay-2 p-4 space-y-4">

      <div className="flex items-center gap-2">

        <Brain className="h-4 w-4 text-muted-foreground" />

        <h3 className="text-xs font-semibold text-foreground">Intelligence Summary</h3>

        <Badge className="border-overlay-20 bg-overlay-8 text-foreground text-xs ml-auto">CRM Projection</Badge>

      </div>



      {/* Scores row */}

      {(cf.opportunityScore != null || cf.contactabilityScore != null || cf.confidenceScore != null) && (

        <div className="grid grid-cols-3 gap-3">

          {scoreBar("Opportunity", cf.opportunityScore, "bg-foreground/70")}

          {scoreBar("Contactability", cf.contactabilityScore, "bg-foreground/50")}

          {scoreBar("Confidence", cf.confidenceScore, "bg-muted-foreground/60")}

        </div>

      )}



      {/* Seller situation */}

      {cf.sellerSituationSummaryShort && (

        <div>

          <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-1">

            Seller Situation

          </h4>

          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">

            {cf.sellerSituationSummaryShort}

          </p>

        </div>

      )}



      {/* Recommended call angle */}

      {cf.recommendedCallAngle && (

        <div className="rounded-[10px] border border-overlay-15 bg-overlay-5 px-3 py-2">

          <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-1">

            Recommended Call Angle

          </h4>

          <p className="text-sm text-foreground/90">{cf.recommendedCallAngle}</p>

        </div>

      )}



      {/* Top facts */}

      {facts.length > 0 && (

        <div>

          <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">

            Top Facts

          </h4>

          <ul className="space-y-1.5">

            {facts.map((fact, i) => (

              <li key={i} className="flex items-start gap-2 text-xs text-foreground/85">

                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-foreground/40 shrink-0" />

                {fact}

              </li>

            ))}

          </ul>

        </div>

      )}



      {/* Dossier link */}

      {cf.dossierUrl && (

        <a

          href={cf.dossierUrl}

          target="_blank"

          rel="noreferrer"

          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"

        >

          <ExternalLink className="h-3 w-3" />

          View Full Dossier

        </a>

      )}

    </div>

  );

}



const TABS = [

  { id: "overview", label: "Overview", icon: LayoutDashboard },

  { id: "contact", label: "Contact", icon: Contact2 },

  { id: "comps", label: "Property Intel", icon: Map },

  { id: "dossier", label: "Dossier", icon: Brain },

  { id: "legal", label: "Legal", icon: Scale },

] as const;



// [EXTRACTED] Type aliases + option constants -- see extracted module files



// [EXTRACTED] parseSuggestedRoute+qualificationRouteLabel -- see extracted module files



type CallAssistCard = {

  id: string;

  title: string;

  summary: string;

  talkingPoints: string[];

  actionHint: string;

  score: (cf: ClientFile) => number;

};



const CALL_ASSIST_CARDS: CallAssistCard[] = [

  {

    id: "think_about_it",

    title: "I want to think about it",

    summary: "Slow the pace, isolate the real concern, and leave with a clear next step.",

    talkingPoints: [

      "Totally fair. What part feels unclear right now: price, timing, or process?",

      "Would a short follow-up after you review options be helpful?",

      "If we reconnect, what would you want ready before that call?",

    ],

    actionHint: "If undecided, set a specific follow-up date before ending the call.",

    score: (cf) => (cf.qualificationRoute === "follow_up" || cf.qualificationRoute === "nurture" ? 3 : 0),

  },

  {

    id: "why_offer_lower",

    title: "Why is your cash offer lower?",

    summary: "Explain certainty, speed, and repair/holding risk without sounding defensive.",

    talkingPoints: [

      "A cash offer usually trades top price for speed, certainty, and no repair prep.",

      "Our range has to account for repairs, closing costs, and resale risk.",

      "If needed, we can walk line-by-line through how we got to the number.",

    ],

    actionHint: "Use this when asking price and cash range are far apart.",

    score: (cf) => {

      const hasAsk = cf.priceExpectation != null;

      const hasValue = cf.estimatedValue != null;

      if (hasAsk && hasValue && (cf.priceExpectation as number) > (cf.estimatedValue as number) * 0.9) return 3;

      if (hasAsk) return 2;

      return cf.qualificationRoute === "offer_ready" ? 1 : 0;

    },

  },

  {

    id: "are_you_agent",

    title: "Are you an agent?",

    summary: "Answer clearly and keep expectations transparent.",

    talkingPoints: [

      "No, we are local direct buyers. We are not listing your home on market.",

      "Sometimes we buy directly, and sometimes we assign our contract to another buyer.",

      "If we are not the right fit, we will tell you quickly and respectfully.",

    ],

    actionHint: "Keep language direct and compliance-safe.",

    score: (cf) => ((cf.totalCalls ?? 0) <= 1 ? 2 : 0),

  },

  {

    id: "how_got_info",

    title: "How did you get my info?",

    summary: "Use a plain, respectful explanation and offer to stop outreach when requested.",

    talkingPoints: [

      "We use public property records and marketing responses to identify possible sellers.",

      "If you prefer no more outreach, we can mark that immediately.",

      "I can also share exactly what property details we had on file.",

    ],

    actionHint: "Good for first-touch conversations and ad-generated leads.",

    score: (cf) => {

      const source = (cf.source ?? "").toLowerCase();

      const adLikeSource =

        source.includes("google") || source.includes("facebook") || source.includes("craigslist") || source.includes("ads");

      if ((cf.totalCalls ?? 0) === 0) return 3;

      return adLikeSource ? 2 : 0;

    },

  },

  {

    id: "want_retail",

    title: "I want retail",

    summary: "Acknowledge the goal and honestly compare speed/certainty versus listing.",

    talkingPoints: [

      "That makes sense. Retail can be best when time and repairs are not a constraint.",

      "Our option is usually best when speed, convenience, or certainty matters more.",

      "If listing is likely better for you, we would rather be upfront now.",

    ],

    actionHint: "If seller wants retail, route to nurture or close out respectfully.",

    score: (cf) => {

      if (cf.qualificationRoute === "nurture") return 3;

      if ((cf.motivationLevel ?? 0) > 0 && (cf.motivationLevel as number) <= 3) return 2;

      return cf.sellerTimeline === "flexible" ? 2 : 0;

    },

  },

  {

    id: "verbal_offer_framing",

    title: "Verbal offer framing",

    summary: "Set expectations before giving numbers, then confirm next decision step.",

    talkingPoints: [

      "Based on what you shared, I can give a rough range before a final written offer.",

      "If that range works for you, we can move to simple next steps right away.",

      "If it does not fit, we can pause and schedule a clean follow-up.",

    ],

    actionHint: "Best used when lead looks offer-ready.",

    score: (cf) => {

      if (cf.qualificationRoute === "offer_ready") return 4;

      const fastTimeline = cf.sellerTimeline === "immediate" || cf.sellerTimeline === "30_days";

      return (cf.motivationLevel ?? 0) >= 4 && fastTimeline ? 2 : 0;

    },

  },

  {

    id: "local_trust",

    title: "Local trust / who we are",

    summary: "Lead with clarity on who Dominion is and how your process works.",

    talkingPoints: [

      "We are a small local home-buying team serving both Spokane and Kootenai markets.",

      "Our goal is a clear process, straightforward communication, and no pressure.",

      "You can take time to review and decide what path is best for your situation.",

    ],

    actionHint: "Use when trust is low or the seller is guarded.",

    score: (cf) => ((cf.totalCalls ?? 0) <= 1 || cf.qualificationRoute === "escalate" ? 2 : 1),

  },

];



function selectCallAssistCards(cf: ClientFile): { defaultCards: CallAssistCard[]; allCards: CallAssistCard[] } {

  const scored = CALL_ASSIST_CARDS

    .map((card) => ({ card, score: card.score(cf) }))

    .sort((a, b) => b.score - a.score);



  const top = scored.filter((entry) => entry.score > 0).slice(0, 3).map((entry) => entry.card);

  const fallbackIds = new Set(["think_about_it", "verbal_offer_framing", "local_trust"]);

  const fallback = CALL_ASSIST_CARDS.filter((card) => fallbackIds.has(card.id)).slice(0, 3);

  const defaultCards = top.length > 0 ? top : fallback;



  return {

    defaultCards,

    allCards: CALL_ASSIST_CARDS,

  };

}



const PRIMARY_TAB_IDS = new Set<TabId>(["overview", "contact", "comps", "dossier", "legal"]);



const WORKFLOW_STAGE_OPTIONS: Array<{ id: WorkflowStageId; label: string }> = [

  { id: "prospect", label: "New" },

  { id: "lead", label: "Lead" },

  { id: "negotiation", label: "Negotiation" },

  { id: "disposition", label: "Disposition" },

  { id: "nurture", label: "Nurture" },

  { id: "dead", label: "Dead" },

  { id: "closed", label: "Closed" },

];





// [EXTRACTED] normalizeWorkflowStage through getNextActionUrgency -- see extracted module files

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Tab: Overview

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



function OverviewTab({ cf, computedArv, activityRefreshToken, onDial, calling }: {

  cf: ClientFile; computedArv: number; activityRefreshToken: number;

  onDial: (phone: string) => void; calling: boolean;

}) {

  const displayPhone = cf.ownerPhone ?? (cf.ownerFlags?.contact_phone as string | null) ?? null;

  const displayEmail = cf.ownerEmail ?? (cf.ownerFlags?.contact_email as string | null) ?? null;

  const { loading: callHistoryLoading } = useCallNotes(cf.id, 20, activityRefreshToken);
  const sellerContinuity = cf.sellerSituationSummaryShort?.trim() || null;



  const DISTRESS_CFG: Record<string, { icon: typeof AlertTriangle; color: string; label: string }> = {

    pre_foreclosure: { icon: AlertTriangle, color: "text-foreground border-overlay-20 bg-overlay-8", label: "Pre-Foreclosure" },

    foreclosure: { icon: AlertTriangle, color: "text-foreground border-overlay-20 bg-overlay-8", label: "Foreclosure" },

    tax_lien: { icon: DollarSign, color: "text-foreground border-overlay-15 bg-overlay-6", label: "Tax Lien" },

    tax_delinquency: { icon: DollarSign, color: "text-foreground border-overlay-15 bg-overlay-6", label: "Tax Delinquent" },

    divorce: { icon: Users, color: "text-muted-foreground border-overlay-12 bg-overlay-4", label: "Divorce" },

    probate: { icon: User, color: "text-muted-foreground border-overlay-12 bg-overlay-4", label: "Probate" },

    deceased: { icon: User, color: "text-muted-foreground border-overlay-12 bg-overlay-4", label: "Deceased" },

    bankruptcy: { icon: AlertTriangle, color: "text-foreground border-overlay-15 bg-overlay-6", label: "Bankruptcy" },

    code_violation: { icon: AlertTriangle, color: "text-muted-foreground border-overlay-12 bg-overlay-4", label: "Code Violation" },

    vacant: { icon: Home, color: "text-muted-foreground border-overlay-10 bg-overlay-3", label: "Vacant" },

    inherited: { icon: User, color: "text-muted-foreground border-overlay-12 bg-overlay-4", label: "Inherited" },

    tired_landlord: { icon: Home, color: "text-muted-foreground border-overlay-10 bg-overlay-3", label: "Tired Landlord" },

  };





  const [distressEvents, setDistressEvents] = useState<{ id: string; event_type: string; source: string; created_at: string; severity?: number; raw_data?: Record<string, unknown> }[]>([]);

  useEffect(() => {

    if (!cf.propertyId) return;

    (async () => {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const { data } = await (supabase.from("distress_events") as any)

        .select("id, event_type, source, created_at, severity, raw_data")

        .eq("property_id", cf.propertyId)

        .order("created_at", { ascending: false })

        .limit(20);

      if (data) setDistressEvents(data);

    })();

  }, [cf.propertyId]);



  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const [activityLog, setActivityLog] = useState<{ id: string; type: string; disposition?: string; notes?: string; created_at: string; duration_sec?: number }[]>([]);

  useEffect(() => {

    if (!cf.id) return;

    (async () => {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const [callsRes, eventsRes] = await Promise.all([

        (supabase.from("calls_log") as any)

          .select("id, disposition, notes, started_at, duration_sec")

          .or(`lead_id.eq.${cf.id},property_id.eq.${cf.propertyId}`)

          .order("started_at", { ascending: false })

          .limit(30),

        (supabase.from("event_log") as any)

          .select("id, action, details, created_at")

          .eq("entity_id", cf.id)

          .order("created_at", { ascending: false })

          .limit(20),

      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const merged = [

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        ...(callsRes.data ?? []).map((c: any) => ({

          id: c.id, type: c.disposition === "sms_outbound" ? "sms" : c.disposition === "operator_note" ? "note" : "call",

          disposition: c.disposition, notes: c.notes,

          created_at: c.started_at, duration_sec: c.duration_sec,

        })),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        ...(eventsRes.data ?? []).map((e: any) => {

          const details = e.details && typeof e.details === "object" && !Array.isArray(e.details) ? e.details as Record<string, unknown> : null;

          const eventNote = typeof details?.note_appended === "string" && (details.note_appended as string).trim().length > 0

            ? (details.note_appended as string).trim() : null;

          return { id: e.id, type: "event", disposition: e.action?.replace(/_/g, " ").toLowerCase(), notes: eventNote, created_at: e.created_at };

        }),

      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 40);

      setActivityLog(merged);

    })();

  }, [activityRefreshToken, cf.id, cf.propertyId]);



  const [noteDraft, setNoteDraft] = useState("");

  const [savingNote, setSavingNote] = useState(false);

  const handleAddNote = useCallback(async () => {

    if (!cf.id || !noteDraft.trim()) return;

    setSavingNote(true);

    try {

      const { data: { session } } = await supabase.auth.getSession();

      const now = new Date().toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      await (supabase.from("calls_log") as any).insert({

        lead_id: cf.id, property_id: cf.propertyId ?? null,

        user_id: session?.user?.id ?? null,

        disposition: "operator_note", notes: noteDraft.trim(),

        started_at: now, ended_at: now, duration_sec: 0,

        direction: "note", source: "mcf",

      });

      setNoteDraft("");

    } catch { /* ignore */ }

    setSavingNote(false);

  }, [cf.id, cf.propertyId, noteDraft]);



  const bestArv = computedArv > 0 ? computedArv : (cf.ownerFlags?.bricked_arv as number) ?? cf.estimatedValue ?? 0;

  const brickedCmv = (cf.ownerFlags?.bricked_cmv as number) ?? 0;

  const repairCost = (cf.ownerFlags?.bricked_repair_cost as number) ?? 0;




  return (

    <div className="space-y-3">

      {/* --�----�-- 1. CALL CARD (2-col span) --�----�-- */}

      <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3.5">

        <div className="flex items-start justify-between gap-4">

          <div className="space-y-1.5 min-w-0">

            <p className="text-base font-bold text-foreground truncate">{formatOwnerName(cf.ownerName) || "Unknown Seller"}</p>

            {displayPhone ? (

              <button

                onClick={() => onDial(displayPhone)}

                disabled={calling}

                className="flex items-center gap-1.5 text-sm text-foreground hover:underline"

              >

                <Phone className="h-3.5 w-3.5 shrink-0" />

                {displayPhone}

              </button>

            ) : (

              <p className="text-sm text-muted-foreground/60 italic">No phone — needs skip trace</p>

            )}

            {displayEmail && (

              <p className="text-sm text-muted-foreground">{displayEmail}</p>

            )}

          </div>

          <div className="text-right text-sm text-muted-foreground shrink-0 space-y-0.5">

            <p className="truncate max-w-[260px]">{cf.fullAddress}</p>

            {cf.isAbsentee && Boolean(cf.ownerFlags?.mailing_address) && (

              <p className="text-xs text-muted-foreground/60">Mailing: {String(cf.ownerFlags.mailing_address)}</p>

            )}

          </div>

        </div>

      </div>



      {/* --�----�-- 2x2 TILE GRID --�----�-- */}

      <div className="grid grid-cols-2 gap-3">

        {/* --�----�-- 2. DISTRESS SIGNALS --�----�-- */}

        <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">

          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Distress Signals</p>

          {(() => {

            // Same tags as Lead Queue row (leads.tags → distressSignals in use-leads)

            const leadInboxTags = cf.tags ?? [];

            const tagTypeSet = new Set(leadInboxTags);

            const supplementalEvents = distressEvents.filter((e) => !tagTypeSet.has(e.event_type));

            const hasAny = leadInboxTags.length > 0 || supplementalEvents.length > 0;

            if (!hasAny) {

              return <p className="text-sm text-muted-foreground/50 italic">No distress signals detected</p>;

            }

            const maxInboxTags = 8;

            const visibleTags = leadInboxTags.slice(0, maxInboxTags);

            const tagOverflow = leadInboxTags.length - visibleTags.length;

            return (

              <div className="flex flex-wrap gap-1.5 items-center">

                {visibleTags.map((sig, i) => (

                  <span

                    key={`inbox-tag-${i}-${sig}`}

                    className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium border border-overlay-12 bg-overlay-4 text-muted-foreground truncate max-w-[200px]"

                    title={sig.replace(/_/g, " ")}

                  >

                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" />

                    {sig.replace(/_/g, " ")}

                  </span>

                ))}

                {tagOverflow > 0 && (

                  <span className="text-[10px] text-muted-foreground/50">+{tagOverflow}</span>

                )}

                {supplementalEvents.slice(0, 8).map((evt) => {

                  const cfg = DISTRESS_CFG[evt.event_type];

                  const EvtIcon = cfg?.icon ?? AlertTriangle;

                  return (

                    <span

                      key={evt.id}

                      className={cn(

                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",

                        cfg?.color ?? "border-overlay-10 text-muted-foreground bg-overlay-3",

                      )}

                    >

                      <EvtIcon className="h-3 w-3" />

                      {cfg?.label ?? evt.event_type.replace(/_/g, " ")}

                    </span>

                  );

                })}

              </div>

            );

          })()}

        </div>



        {/* --�----�-- 3. SELLER MEMORY --�----�-- */}

        {sellerContinuity && (
          <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Seller Memory</p>

            <p className="text-sm text-foreground line-clamp-3">{sellerContinuity}</p>

          </div>
        )}

      </div>



      {/* --�----�-- 4. PROPERTY BASICS (2-col span) --�----�-- */}

      <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">

        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Property Basics</p>

        <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 text-sm">

          {cf.bedrooms != null && <div><span className="text-muted-foreground/60">Beds</span> <span className="text-foreground font-mono">{cf.bedrooms}</span></div>}

          {cf.bathrooms != null && <div><span className="text-muted-foreground/60">Baths</span> <span className="text-foreground font-mono">{cf.bathrooms}</span></div>}

          {cf.sqft != null && <div><span className="text-muted-foreground/60">Sq Ft</span> <span className="text-foreground font-mono">{cf.sqft.toLocaleString()}</span></div>}

          {cf.yearBuilt != null && <div><span className="text-muted-foreground/60">Year</span> <span className="text-foreground font-mono">{cf.yearBuilt}</span></div>}

          {cf.propertyType && <div><span className="text-muted-foreground/60">Type</span> <span className="text-foreground">{cf.propertyType}</span></div>}

          {cf.lotSize != null && <div><span className="text-muted-foreground/60">Lot</span> <span className="text-foreground font-mono">{cf.lotSize.toFixed(2)} ac</span></div>}

          {cf.apn && <div className="col-span-2"><span className="text-muted-foreground/60">APN</span> <span className="text-foreground font-mono">{cf.apn}</span></div>}

        </div>

        {!cf.bedrooms && !cf.sqft && !cf.yearBuilt && (

          <p className="text-sm text-muted-foreground/50 italic">No property details enriched yet</p>

        )}

      </div>



      {(cf.recommendedCallAngle || bestArv > 0) && (
        <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Call Context</p>

          <div className="space-y-1.5 text-sm">
            {cf.recommendedCallAngle && (
              <p className="text-foreground line-clamp-2">{cf.recommendedCallAngle}</p>
            )}

            {bestArv > 0 && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-muted-foreground">
                  ARV <span className="text-foreground font-mono font-semibold">{formatCurrency(bestArv)}</span>
                </span>
                {repairCost > 0 && (
                  <span className="text-muted-foreground">
                    Repairs <span className="text-foreground font-mono">-{formatCurrency(repairCost)}</span>
                  </span>
                )}
                {cf.equityPercent != null && (
                  <span className="text-muted-foreground">
                    Equity <span className={cn("font-mono", cf.equityPercent >= 50 ? "text-foreground" : "text-muted-foreground")}>{cf.equityPercent}%</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}



      {/* --�----�-- NOTES & CALL HISTORY --�----�-- */}

      <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3.5">

        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent Notes & Calls</p>

        <div className="flex gap-2 mb-3">

          <input

            value={noteDraft}

            onChange={(e) => setNoteDraft(e.target.value)}

            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}

            placeholder="+ Add note..."

            className="flex-1 h-8 rounded-[8px] border border-overlay-12 bg-overlay-4 px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-overlay-30"

            maxLength={1000}

          />

          <Button size="sm" className="h-8 text-sm px-3" disabled={savingNote || !noteDraft.trim()} onClick={handleAddNote}>

            {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}

          </Button>

        </div>

        {activityLog.length > 0 ? (

          <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">

            {activityLog.map((entry) => {

              const typeBadge = entry.type === "call" ? "Call" : entry.type === "sms" ? "SMS" : entry.type === "note" ? "Note" : "Event";

              const typeBadgeClass = entry.type === "call" ? "bg-overlay-8 text-foreground" : entry.type === "sms" ? "bg-overlay-6 text-muted-foreground" : "bg-overlay-4 text-muted-foreground";

              return (

                <div key={entry.id} className="flex items-start gap-2 py-1.5 border-b border-overlay-4 last:border-0">

                  <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase", typeBadgeClass)}>{typeBadge}</span>

                  <div className="flex-1 min-w-0">

                    {entry.disposition && entry.type !== "note" && (

                      <p className="text-xs text-muted-foreground capitalize">{entry.disposition.replace(/_/g, " ")}</p>

                    )}

                    {entry.notes && <p className="text-sm text-foreground line-clamp-2">{entry.notes}</p>}

                    {entry.type === "call" && entry.duration_sec != null && entry.duration_sec > 0 && (

                      <p className="text-xs text-muted-foreground/50">{Math.floor(entry.duration_sec / 60)}m {entry.duration_sec % 60}s</p>

                    )}

                  </div>

                  <span className="shrink-0 text-[10px] text-muted-foreground/40">{formatRelativeFromNow(entry.created_at)}</span>

                </div>

              );

            })}

          </div>

        ) : callHistoryLoading ? (

          <div className="flex items-center gap-2 py-4 justify-center text-sm text-muted-foreground/50"><Loader2 className="h-4 w-4 animate-spin" />Loading history...</div>

        ) : (

          <p className="text-sm text-muted-foreground/50 italic text-center py-4">No activity yet</p>

        )}

      </div>

    </div>

  );

}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Tab: PropertyRadar Data

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



function PropertyRadarTab({ cf }: { cf: ClientFile }) {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;

  const entries = Object.entries(prRaw).filter(([, v]) => v != null && v !== "");

  const hasData = entries.length > 0;



  return (

    <div className="space-y-4">

      <Section title="PropertyRadar Enrichment" icon={Radar}>

        {!hasData ? (

          <div className="text-center py-8 space-y-2">

            <Radar className="h-8 w-8 mx-auto text-muted-foreground/30" />

            <p className="text-sm text-muted-foreground">No PropertyRadar data available</p>

            <p className="text-xs text-muted-foreground/60">Run Skip Trace to pull enrichment data</p>

          </div>

        ) : (

          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-h-[50vh] overflow-y-auto">

            {entries.map(([key, val]) => (

              <div key={key} className="flex items-start gap-2 py-1">

                <div className="flex-1 min-w-0">

                  <p className="text-sm text-muted-foreground uppercase tracking-wider font-mono">{key}</p>

                  <p className="text-xs text-foreground truncate">{typeof val === "object" ? JSON.stringify(val) : String(val)}</p>

                </div>

              </div>

            ))}

          </div>

        )}

      </Section>



      {cf.radarId && (

        <div className="flex flex-wrap gap-2">

          <a href={`https://app.propertyradar.com/properties/${cf.radarId}`} target="_blank" rel="noopener noreferrer">

            <Button size="sm" variant="outline" className="gap-2 text-xs">

              <ExternalLink className="h-3 w-3" />View on PropertyRadar

            </Button>

          </a>

          <a href={`https://app.propertyradar.com/properties/${cf.radarId}/report`} target="_blank" rel="noopener noreferrer">

            <Button size="sm" variant="outline" className="gap-2 text-xs">

              <FileText className="h-3 w-3" />Full Property Report

            </Button>

          </a>

        </div>

      )}



      {cf.enriched && (

        <div className="flex items-center gap-2 text-xs text-muted-foreground">

          <CheckCircle2 className="h-3.5 w-3.5" />

          <span>Enriched from PropertyRadar{cf.radarId ? ` — RadarID: ${cf.radarId}` : ""}</span>

        </div>

      )}

    </div>

  );

}



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Tab: County Records

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



function CountyRecordsTab({ cf }: { cf: ClientFile }) {

  const countyKey = cf.county.toLowerCase().replace(/\s+county$/i, "").trim();

  const countyInfo = COUNTY_LINKS[countyKey];

  const searchQuery = encodeURIComponent(`${cf.apn} ${cf.county} county ${cf.state}`);

  const googleSearch = `https://www.google.com/search?q=${searchQuery}+property+records`;



  return (

    <div className="space-y-4">

      <Section title={countyInfo ? countyInfo.name : `${cf.county || "Unknown"} County`} icon={Globe}>

        <div className="grid grid-cols-2 gap-x-6 mb-4">

          <InfoRow icon={Copy} label="APN" value={cf.apn} mono highlight />

          <InfoRow icon={MapPin} label="County" value={cf.county} />

          <InfoRow icon={MapPin} label="Full Address" value={cf.fullAddress} />

          <InfoRow icon={User} label="Owner" value={formatOwnerName(cf.ownerName)} />

        </div>



        {countyInfo ? (

          <div className="space-y-2">

            <a href={countyInfo.gis(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">

              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">

                <Map className="h-3.5 w-3.5 text-foreground" />GIS / Parcel Map — {countyInfo.name}

                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />

              </Button>

            </a>

            <a href={countyInfo.assessor(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">

              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">

                <Building className="h-3.5 w-3.5 text-foreground" />Assessor&apos;s Office — {countyInfo.name}

                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />

              </Button>

            </a>

            {countyInfo.treasurer && (

              <a href={countyInfo.treasurer(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">

                <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">

                  <DollarSign className="h-3.5 w-3.5 text-foreground" />Treasurer / Tax Records — {countyInfo.name}

                  <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />

                </Button>

              </a>

            )}

          </div>

        ) : (

          <div className="space-y-3">

            <p className="text-xs text-muted-foreground/70">No pre-configured links for this county. Use the search below.</p>

            <a href={googleSearch} target="_blank" rel="noopener noreferrer">

              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">

                <Search className="h-3.5 w-3.5 text-foreground" />Search County Records (Google)

                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />

              </Button>

            </a>

          </div>

        )}

      </Section>



      <div className="text-sm text-muted-foreground/50 italic">

        Tip: Search the APN <span className="font-mono text-foreground/60">{cf.apn}</span> on the county GIS to pull official parcel data, liens, and tax history.

      </div>

    </div>

  );

}



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Tab: Comps & ARV — Interactive Leaflet Map + PropertyRadar Search

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



function SubjectPhotoCarousel({
  photos,
  lat,
  lng,
  onSkipTrace,
}: {
  photos: string[];
  /** Used when all URLs fail or list is empty — same-origin `/api/street-view` proxy */
  lat?: number | null;
  lng?: number | null;
  onSkipTrace?: () => void;
}) {

  const [urls, setUrls] = useState<string[]>(photos);

  const [idx, setIdx] = useState(0);

  const [fallbackFailed, setFallbackFailed] = useState(false);



  useEffect(() => {

    setUrls(photos);

    setIdx(0);

    setFallbackFailed(false);

  }, [photos]);



  const fallbackUrl =

    lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)

      ? `/api/street-view?lat=${lat}&lng=${lng}&size=800x400&heading=0`

      : null;



  const displayUrls =

    urls.length > 0 ? urls : (fallbackUrl && !fallbackFailed ? [fallbackUrl] : []);



  useEffect(() => {

    setIdx((i) => Math.min(i, Math.max(0, displayUrls.length - 1)));

  }, [displayUrls.length]);



  const handleImgError = () => {

    // Showing proxy fallback while urls is empty — stop retrying the same URL

    if (urls.length === 0) {

      setFallbackFailed(true);

      return;

    }

    setUrls((prev) => {

      if (prev.length === 0) return prev;

      const failed = prev[idx];

      const next = prev.filter((u) => u !== failed);

      if (failed === fallbackUrl) setFallbackFailed(true);

      return next;

    });

  };



  if (displayUrls.length === 0) {

    return (

      <div className="h-full flex flex-col items-center justify-center text-center p-2">

        <ImageIcon className="h-5 w-5 text-muted-foreground/40 mb-1" />

        {onSkipTrace ? (

          <button

            onClick={onSkipTrace}

            className="text-xs text-foreground hover:underline font-medium mt-0.5"

          >

            Enrich for photos

          </button>

        ) : (

          <p className="text-xs text-muted-foreground leading-tight">

            Enrich for photos

          </p>

        )}

      </div>

    );

  }



  return (

    <div className="relative h-full group">

      {/* eslint-disable-next-line @next/next/no-img-element */}

      <img

        src={displayUrls[idx]}

        alt={`Property photo ${idx + 1}`}

        className="h-full w-full object-cover"

        onError={handleImgError}

      />

      {displayUrls.length > 1 && (

        <>

          <button

            type="button"

            onClick={() => setIdx((i) => (i - 1 + displayUrls.length) % displayUrls.length)}

            className="absolute left-1 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"

          >

            <ChevronLeft className="h-3.5 w-3.5" />

          </button>

          <button

            type="button"

            onClick={() => setIdx((i) => (i + 1) % displayUrls.length)}

            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"

          >

            <ChevronRight className="h-3.5 w-3.5" />

          </button>

          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">

            {displayUrls.map((_, i) => (

              <div key={i} className={cn("h-1 w-1 rounded-full transition-colors", i === idx ? "bg-primary" : "bg-overlay-40")} />

            ))}

          </div>

        </>

      )}

    </div>

  );

}



// —— Comp detail panel with auto-fetching Zillow photo carousel ————————



function CompDetailPanel({ comp, onClose }: { comp: CompProperty; onClose: () => void }) {

  const [photos, setPhotos] = useState<string[]>([]);

  const [photoIdx, setPhotoIdx] = useState(0);

  const [loading, setLoading] = useState(false);



  // Build full address for photo lookup

  const fullAddress = [comp.streetAddress, comp.city, comp.state, comp.zip].filter(Boolean).join(", ");



  // Auto-fetch photos from Zillow via Apify

  useEffect(() => {

    if (!fullAddress) return;

    let cancelled = false;

    setLoading(true);

    setPhotos([]);

    setPhotoIdx(0);

    (async () => {

      try {

        const res = await fetch("/api/property-photos", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ address: fullAddress, lat: comp.lat, lng: comp.lng }),

        });

        if (cancelled) return;

        const data = await res.json();

        if (data.photos?.length > 0) {

          // eslint-disable-next-line @typescript-eslint/no-explicit-any

          setPhotos(data.photos.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean));

        }

      } catch { /* ignore — fallback to street view / satellite */ }

      if (!cancelled) setLoading(false);

    })();

    return () => { cancelled = true; };

  }, [fullAddress, comp.lat, comp.lng]);



  // Fallback image sources

  const fallbackSrc = comp.photoUrl

    ?? comp.streetViewUrl

    ?? (comp.lat && comp.lng ? getSatelliteTileUrl(comp.lat, comp.lng, 17) : null);



  const allPhotos = photos.length > 0 ? photos : (fallbackSrc ? [fallbackSrc] : []);

  const safeIdx = allPhotos.length > 0 ? photoIdx % allPhotos.length : 0;



  return (

    <div className="rounded-[10px] border border-overlay-20 bg-panel-deep backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">

      <div className="flex items-center justify-between px-4 py-2 border-b border-overlay-6 bg-overlay-4">

        <p className="text-xs font-semibold flex items-center gap-1.5">

          <Eye className="h-3 w-3 text-foreground" />

          {comp.streetAddress}

        </p>

        <button onClick={onClose} className="text-muted-foreground hover:text-white">

          <X className="h-3.5 w-3.5" />

        </button>

      </div>

      <div className="flex">

        {/* Photo carousel */}

        <div className="w-64 h-44 shrink-0 border-r border-overlay-6 bg-black/30 relative group">

          {loading && allPhotos.length === 0 ? (

            <div className="h-full flex items-center justify-center">

              <Loader2 className="h-5 w-5 text-foreground animate-spin" />

              <span className="ml-2 text-sm text-muted-foreground">Fetching photos&hellip;</span>

            </div>

          ) : allPhotos.length > 0 ? (

            <>

              {/* eslint-disable-next-line @next/next/no-img-element */}

              <img

                src={allPhotos[safeIdx]}

                alt={`Comp photo ${safeIdx + 1}`}

                className="h-full w-full object-cover"

              />

              {allPhotos.length > 1 && (

                <>

                  <button

                    onClick={() => setPhotoIdx((i) => (i - 1 + allPhotos.length) % allPhotos.length)}

                    className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"

                  >

                    <ChevronLeft className="h-3.5 w-3.5" />

                  </button>

                  <button

                    onClick={() => setPhotoIdx((i) => (i + 1) % allPhotos.length)}

                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"

                  >

                    <ChevronRight className="h-3.5 w-3.5" />

                  </button>

                  <span className="absolute bottom-1.5 right-2 text-xs bg-black/60 text-overlay-80 px-1.5 py-0.5 rounded-full">

                    {safeIdx + 1}/{allPhotos.length}

                  </span>

                </>

              )}

              {loading && (

                <span className="absolute top-1.5 right-2 text-xs bg-black/60 text-foreground px-1.5 py-0.5 rounded-full flex items-center gap-1">

                  <Loader2 className="h-2.5 w-2.5 animate-spin" />loading more

                </span>

              )}

            </>

          ) : (

            <div className="h-full flex items-center justify-center">

              <ImageIcon className="h-5 w-5 text-muted-foreground/40" />

              <span className="ml-2 text-sm text-muted-foreground">No photos available</span>

            </div>

          )}

        </div>

        {/* Property details */}

        <div className="flex-1 p-3 min-w-0">

          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">

            <div><span className="text-muted-foreground">Beds:</span> <span className="font-medium">{comp.beds ?? "—"}</span></div>

            <div><span className="text-muted-foreground">Baths:</span> <span className="font-medium">{comp.baths ?? "—"}</span></div>

            <div><span className="text-muted-foreground">Sqft:</span> <span className="font-medium">{comp.sqft?.toLocaleString() ?? "—"}</span></div>

            <div><span className="text-muted-foreground">Year:</span> <span className="font-medium">{comp.yearBuilt ?? "—"}</span></div>

            <div><span className="text-muted-foreground">AVM:</span> <span className="font-medium text-foreground">{comp.avm ? formatCurrency(comp.avm) : "—"}</span></div>

            <div><span className="text-muted-foreground">Last Sale:</span> <span className="font-medium">{comp.lastSalePrice ? formatCurrency(comp.lastSalePrice) : "—"}</span></div>

            {comp.lastSaleDate && (

              <div><span className="text-muted-foreground">Sale Date:</span> <span className="font-medium">{new Date(comp.lastSaleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>

            )}

            {comp.lotSize != null && (

              <div><span className="text-muted-foreground">Lot:</span> <span className="font-medium">{comp.lotSize.toLocaleString()} sqft</span></div>

            )}

            {comp.sqft != null && (comp.lastSalePrice ?? comp.avm) ? (

              <div><span className="text-muted-foreground">$/sqft:</span> <span className="font-medium">${Math.round((comp.lastSalePrice ?? comp.avm ?? 0) / comp.sqft)}</span></div>

            ) : null}

          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">

            {comp.isVacant && <span className="px-1.5 py-0.5 rounded text-xs bg-overlay-5/10 text-muted-foreground border border-overlay-12">Vacant</span>}

            {comp.isAbsentee && <span className="px-1.5 py-0.5 rounded text-xs bg-overlay-6/10 text-foreground border border-overlay-12">Absentee</span>}

            {comp.isFreeAndClear && <span className="px-1.5 py-0.5 rounded text-xs bg-overlay-6/10 text-foreground border border-overlay-15">Free & Clear</span>}

            {comp.isForeclosure && <span className="px-1.5 py-0.5 rounded text-xs bg-overlay-5/10 text-foreground border border-overlay-15">Foreclosure</span>}

            {comp.isListedForSale && <span className="px-1.5 py-0.5 rounded text-xs bg-overlay-5/10 text-muted-foreground border border-overlay-12">Listed</span>}

            {comp.isRecentSale && <span className="px-1.5 py-0.5 rounded text-xs bg-overlay-10 text-foreground border border-overlay-20">Recent Sale</span>}

          </div>

          {comp.lat && comp.lng && (

            <a

              href={getGoogleStreetViewLink(comp.lat, comp.lng)}

              target="_blank"

              rel="noopener noreferrer"

              className="inline-flex items-center gap-1 text-xs text-foreground hover:underline mt-2"

            >

              <ExternalLink className="h-2.5 w-2.5" />

              Street View

            </a>

          )}

        </div>

      </div>

    </div>

  );

}



// —— Lat/Lng extraction with fallbacks —————————————————————————————————



// eslint-disable-next-line @typescript-eslint/no-explicit-any

// [EXTRACTED] extractLatLng -- see extracted module files

// —— ARV adjustment helpers ————————————————————————————————————————————



const CONDITION_LABELS: Record<number, string> = {

  [-15]: "Poor (\u201315%)",

  [-10]: "Below Avg (\u201310%)",

  [-5]: "Fair (\u20135%)",

  [0]: "Average",

  [5]: "Good (+5%)",

};



function CompsTab({ cf, selectedComps, onAddComp, onRemoveComp, onSkipTrace, computedArv, onArvChange, conditionAdj, onConditionAdjChange }: {

  cf: ClientFile;

  selectedComps: CompProperty[];

  onAddComp: (comp: CompProperty) => void;

  onRemoveComp: (apn: string) => void;

  onSkipTrace?: () => void;

  computedArv: number;

  onArvChange: (arv: number) => void;

  conditionAdj: number;

  onConditionAdjChange: (adj: number) => void;

}) {

  const [focusedComp, setFocusedComp] = useState<CompProperty | null>(null);

  const [researchMode, setResearchMode] = useState(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;



  // —— Lat/lng with multi-source fallback + geocoding ——

  const extracted = extractLatLng(cf);

  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [geocoding, setGeocoding] = useState(false);

  const [geocodeError, setGeocodeError] = useState<string | null>(null);



  const lat = extracted.lat ?? geocodedCoords?.lat ?? null;

  const lng = extracted.lng ?? geocodedCoords?.lng ?? null;



  // Auto-geocode via Nominatim on mount if no lat/lng from data

  useEffect(() => {

    if (extracted.lat || extracted.lng || geocodedCoords || !cf.fullAddress) return;

    let cancelled = false;

    (async () => {

      setGeocoding(true);

      setGeocodeError(null);

      try {

        const q = encodeURIComponent(cf.fullAddress);

        const res = await fetch(

          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,

          { headers: { "User-Agent": "SentinelERP/1.0" } },

        );

        const data = await res.json();

        if (cancelled) return;

        if (data?.[0]?.lat && data?.[0]?.lon) {

          setGeocodedCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });

        } else {

          setGeocodeError("Could not geocode address");

        }

      } catch {

        if (!cancelled) setGeocodeError("Geocoding service unavailable");

      } finally {

        if (!cancelled) setGeocoding(false);

      }

    })();

    return () => { cancelled = true; };

  }, [extracted.lat, extracted.lng, geocodedCoords, cf.fullAddress]);



  // ARV adjustment state — conditionAdj lifted to parent for persistence

  const [offerPct, setOfferPct] = useState(75);

  const [rehabEst, setRehabEst] = useState(40000);



  const cachedPhotos = useMemo(() => {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const oFlags = (cf.ownerFlags ?? {}) as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const pr = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;

    const urls: string[] = [];

    // Zillow photos from owner_flags (cached from Apify)

    const cached = oFlags?.photos ?? oFlags?.deep_crawl?.photos ?? [];

    if (Array.isArray(cached)) {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      urls.push(...cached.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean));

    }

    // PropertyRadar photos

    if (Array.isArray(pr.Photos)) urls.push(...pr.Photos.filter((u: unknown) => typeof u === "string"));

    if (Array.isArray(pr.photos)) urls.push(...pr.photos.filter((u: unknown) => typeof u === "string"));

    if (typeof pr.PropertyImageUrl === "string" && pr.PropertyImageUrl) urls.push(pr.PropertyImageUrl);

    if (typeof pr.StreetViewUrl === "string" && pr.StreetViewUrl) urls.push(pr.StreetViewUrl);

    // Bricked AI photos

    const brickedImgs = (oFlags?.bricked_images) as string | undefined;

    if (brickedImgs) {

      try { const parsed = JSON.parse(brickedImgs); if (Array.isArray(parsed)) urls.push(...parsed.filter((u: unknown) => typeof u === "string")); } catch {}

    }

    // Deduplicate

    return [...new Set(urls)];

  }, [cf.ownerFlags]);



  // Auto-fetch photos from Google Places if none cached

  const [fetchedPhotos, setFetchedPhotos] = useState<string[]>([]);

  useEffect(() => {

    // Re-fetch if fewer than 3 cached photos (old caches had only 1 Street View)

    if (cachedPhotos.length >= 3 || !cf.fullAddress) return;

    let cancelled = false;

    (async () => {

      try {

        const res = await fetch("/api/property-photos", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ address: cf.fullAddress, property_id: cf.propertyId, lat, lng }),

        });

        if (cancelled) return;

        const data = await res.json();

        if (data.photos?.length > 0) {

          // eslint-disable-next-line @typescript-eslint/no-explicit-any

          setFetchedPhotos(data.photos.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean));

        }

      } catch { /* ignore */ }

    })();

    return () => { cancelled = true; };

  // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [cf.fullAddress, cf.propertyId, lat, lng]);



  // Merge fetched (Places / SV / Apify) first, then cached PR/Zillow URLs — avoids stale pr_raw masking fresh API results.

  const mergedPhotos = useMemo(() => {

    const seen = new Set<string>();

    const out: string[] = [];

    for (const u of [...fetchedPhotos, ...cachedPhotos]) {

      if (!u || typeof u !== "string") continue;

      const t = u.trim();

      if (!t || seen.has(t)) continue;

      seen.add(t);

      out.push(t);

    }

    return out;

  }, [fetchedPhotos, cachedPhotos]);



  const photosWithFallback = useMemo(() => {

    if (mergedPhotos.length > 0) return mergedPhotos;

    if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {

      return [`/api/street-view?lat=${lat}&lng=${lng}&size=800x400&heading=0`];

    }

    return [];

  }, [mergedPhotos, lat, lng]);



  // ARV from selected comps via canonical valuation kernel

  const subjectSqft = cf.sqft ?? 0;

  const compMetrics: CompMetric[] = selectedComps

    .filter((c) => (c.lastSalePrice ?? c.avm ?? 0) > 0)

    .map((c) => {

      const price = c.lastSalePrice ?? c.avm ?? 0;

      const ppsf = c.sqft && c.sqft > 0 ? price / c.sqft : null;

      return { price, sqft: c.sqft ?? 0, ppsf };

    });



  const arvRangeResult = calculateARVRange(compMetrics, subjectSqft, conditionAdj);

  const arvConfResult = calculateArvConfidence(arvRangeResult.compCount, arvRangeResult.spreadPct);



  // Fall back to AVM if no comps



  const arvLow = arvRangeResult.arvLow;

  const arvHigh = arvRangeResult.arvHigh;

  const arvConfidence = arvRangeResult.compCount > 0 ? arvConfResult.confidence : "low";

  const arv = arvRangeResult.arvBase > 0 ? arvRangeResult.arvBase : (cf.estimatedValue ?? 0) > 0 ? Math.round((cf.estimatedValue ?? 0) * (1 + conditionAdj / 100)) : 0;

  const avgPpsqft = arvRangeResult.avgPpsf != null ? Math.round(arvRangeResult.avgPpsf) : null;



  // Profit projection via kernel

  const compsUnderwrite = calculateWholesaleUnderwrite({

    arv,

    arvSource: arvRangeResult.compCount > 0 ? "comps" : "avm",

    offerPercentage: offerPct / 100,

    rehabEstimate: rehabEst,

    assignmentFeeTarget: VALUATION_DEFAULTS.assignmentFeeTarget,

    holdingCosts: VALUATION_DEFAULTS.holdMonths * VALUATION_DEFAULTS.monthlyHoldCost,

    closingCosts: VALUATION_DEFAULTS.closingCosts,

  });

  const offer = compsUnderwrite.maxAllowable;

  const totalCost = offer + rehabEst;

  const profit = compsUnderwrite.grossProfit;

  const roi = totalCost > 0 ? Math.round((profit / totalCost) * 100) : 0;



  useEffect(() => { if (arv > 0) onArvChange(arv); }, [arv, onArvChange]);



  if (geocoding) {

    return (

      <div className="text-center py-12">

        <Loader2 className="h-10 w-10 text-foreground mx-auto mb-3 animate-spin" />

        <p className="text-sm text-muted-foreground">Geocoding address...</p>

      </div>

    );

  }



  const handleRetryGeocode = async () => {

    if (!cf.fullAddress) return;

    setGeocoding(true);

    setGeocodeError(null);

    try {

      const q = encodeURIComponent(cf.fullAddress);

      const res = await fetch(

        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,

        { headers: { "User-Agent": "SentinelERP/1.0" } },

      );

      const data = await res.json();

      if (data?.[0]?.lat && data?.[0]?.lon) {

        setGeocodedCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });

      } else {

        setGeocodeError("Could not geocode — try enriching from PropertyRadar");

      }

    } catch {

      setGeocodeError("Geocoding service unavailable");

    } finally {

      setGeocoding(false);

    }

  };



  const hasCoords = !!(lat && lng);



  const subject: SubjectProperty = {

    lat: lat ?? 0, lng: lng ?? 0, address: cf.fullAddress,

    beds: cf.bedrooms, baths: cf.bathrooms,

    sqft: cf.sqft, yearBuilt: cf.yearBuilt,

    propertyType: cf.propertyType, avm: cf.estimatedValue,

    radarId: cf.radarId, zip: cf.zip, county: cf.county, state: cf.state,

  };



  // Decision Summary computations

  const arvSource = arvRangeResult.compCount > 0 ? "comps" : "avm";

  const modeLabel = arvRangeResult.compCount > 0 ? "Underwrite" : cf.estimatedValue ? "Quick Screen" : null;

  const isScreeningMode = arvRangeResult.compCount === 0;

  const quickScreenResult = isScreeningMode && (cf.estimatedValue ?? 0) > 0

    ? calculateQuickScreen(cf.estimatedValue ?? 0)

    : null;

  const formatRoughCurrency = (n: number): string => {

    if (n >= 1000) return `~$${Math.round(n / 1000)}k`;

    return `~$${n}`;

  };

  const screeningReasons: string[] = [];

  if (isScreeningMode) {

    screeningReasons.push("AVM-only");

    screeningReasons.push("No comps selected");

  }

  if (cf.conditionLevel == null) screeningReasons.push("Condition unverified");



  const decisionWarnings = buildValuationWarnings({

    arv,

    arvSource,

    compCount: arvRangeResult.compCount,

    confidence: arvConfidence,

    spreadPct: arvRangeResult.spreadPct,

    mao: compsUnderwrite.mao,

    rehabEstimate: rehabEst,

    conditionLevel: cf.conditionLevel ?? null,

  });



  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const snapUpdatedAt = (cf.ownerFlags as any)?.offer_prep_snapshot?.updated_at as string | undefined;

  const daysSinceSnapshot = snapUpdatedAt ? Math.floor((Date.now() - new Date(snapUpdatedAt).getTime()) / (1000 * 60 * 60 * 24)) : null;

  const isStale = daysSinceSnapshot != null && daysSinceSnapshot > 7;



  // Frozen comp provenance

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const frozenComps = ((cf.ownerFlags as any)?.offer_prep_snapshot?.frozen_comps ?? []) as Array<{ apn: string }>;

  const frozenApns = new Set(frozenComps.map((fc: { apn: string }) => fc.apn));

  const currentApns = new Set(selectedComps.map((c) => c.apn));

  const frozenCount = frozenComps.length;

  const snapDate = snapUpdatedAt ? new Date(snapUpdatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

  const apnsDrifted = frozenCount > 0 && (frozenApns.size !== currentApns.size || [...frozenApns].some((apn) => !currentApns.has(apn)));

  const countDrifted = frozenCount > 0 && frozenCount !== selectedComps.length;



  const confidenceReason = (() => {

    if (arvRangeResult.compCount === 0) {

      return cf.estimatedValue ? "No comps \u2014 using AVM estimate only" : "No valuation data available";

    }

    if (arvRangeResult.compCount === 1) return "Single comp \u2014 verify with additional sales";

    const spreadStr = arvRangeResult.spreadPct != null ? `${Math.round(arvRangeResult.spreadPct * 100)}%` : "?%";

    if (arvConfidence === "high") return `${arvRangeResult.compCount} strong comps, ${spreadStr} spread`;

    if (arvRangeResult.spreadPct != null && arvRangeResult.spreadPct > 0.15) return `${arvRangeResult.compCount} comps but ${spreadStr} price spread`;

    return `Only ${arvRangeResult.compCount} comp${arvRangeResult.compCount > 1 ? "s" : ""} \u2014 need 3+ for high confidence`;

  })();



  return (

    <div className="space-y-4">

      {/* No-coords banner — graceful degradation */}

      {!hasCoords && (

        <div className="rounded-[10px] border border-dashed border-overlay-12 bg-overlay-3 p-3 flex items-center justify-between gap-3">

          <div className="flex items-center gap-2 min-w-0">

            <MapPinned className="h-4 w-4 text-muted-foreground shrink-0" />

            <p className="text-sm text-muted-foreground truncate">

              {geocodeError ?? "Map unavailable \u2014 add coordinates or retry geocode"}

            </p>

          </div>

          <div className="flex gap-2 shrink-0">

            <Button variant="outline" size="sm" onClick={handleRetryGeocode} className="gap-1.5">

              <MapPinned className="h-3 w-3" /> Retry Geocode

            </Button>

            {onSkipTrace && (

              <Button variant="outline" size="sm" onClick={onSkipTrace} className="gap-1.5">

                <Globe className="h-3 w-3" /> Enrich

              </Button>

            )}

          </div>

        </div>

      )}



      {/* Subject property header with photo carousel */}

      <div className="rounded-[10px] border border-overlay-6 bg-panel backdrop-blur-xl p-0 flex overflow-hidden">

        <div className="w-44 h-28 shrink-0 border-r border-overlay-6 bg-overlay-4">

          <SubjectPhotoCarousel photos={photosWithFallback} lat={lat} lng={lng} onSkipTrace={onSkipTrace} />

        </div>

        <div className="flex-1 p-3 flex flex-col justify-center min-w-0">

          <p className="text-sm font-bold truncate" style={{ textShadow: "0 0 8px var(--overlay-12)" }}>

            {cf.fullAddress}

          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-muted-foreground">

            {cf.bedrooms != null && <span className="flex items-center gap-1"><Home className="h-3 w-3" />{cf.bedrooms} bd</span>}

            {cf.bathrooms != null && <span className="flex items-center gap-1"><Home className="h-3 w-3" />{cf.bathrooms} ba</span>}

            {cf.sqft != null && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" />{cf.sqft.toLocaleString()} sqft</span>}

            {cf.yearBuilt != null && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{cf.yearBuilt}</span>}

            {cf.propertyType && <span className="flex items-center gap-1"><Building className="h-3 w-3" />{cf.propertyType}</span>}

          </div>

          <div className="flex items-center gap-3 mt-1.5 text-sm">

            {cf.estimatedValue != null && (

              <span className="font-semibold text-foreground">{formatCurrency(cf.estimatedValue)} AVM</span>

            )}

            {cf.equityPercent != null && (

              <span className="text-muted-foreground">{cf.equityPercent}% equity</span>

            )}

            {cf.sqft != null && cf.estimatedValue != null && (

              <span className="text-muted-foreground">${Math.round(cf.estimatedValue / cf.sqft)}/sqft</span>

            )}

          </div>

        </div>

      </div>



      {/* === SECTION 1: DECISION SUMMARY === */}

      <div className={cn(

        "rounded-[10px] border p-4 space-y-3",

        isScreeningMode ? "border-dashed border-overlay-12 bg-overlay-5" :

        arvConfidence === "high" ? "border-overlay-15 bg-overlay-6" :

        arvConfidence === "medium" ? "border-overlay-12 bg-overlay-5" :

        "border-overlay-15 bg-overlay-5",

      )}>

        <div className="flex items-center justify-between">

          <div className="flex items-center gap-2">

            <Scale className="h-3.5 w-3.5 text-foreground" />

            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Decision Summary</span>

          </div>

          <div className="flex items-center gap-2">

            {isScreeningMode ? (

              <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-overlay-12 bg-overlay-5/10 text-muted-foreground font-bold">

                Screening Only

              </span>

            ) : modeLabel ? (

              <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-overlay-10 bg-overlay-4 text-muted-foreground">

                {modeLabel}

              </span>

            ) : null}

            {isStale && (

              <span className="text-xs text-muted-foreground flex items-center gap-0.5">

                <Clock className="h-2.5 w-2.5" />

                {daysSinceSnapshot}d since save

              </span>

            )}

            {frozenCount > 0 && (

              <span className={cn("text-xs flex items-center gap-0.5",

                apnsDrifted ? "text-muted-foreground" : countDrifted ? "text-muted-foreground" : "text-muted-foreground/70",

              )}>

                {apnsDrifted

                  ? "Saved comps differ from current selection"

                  : countDrifted

                    ? `Saved ${frozenCount} comps - ${selectedComps.length} now selected`

                    : `Saved ${frozenCount} comps${snapDate ? ` - ${snapDate}` : ""}`}

              </span>

            )}

            {typeof cf.ownerFlags?.bricked_share_link === "string" && (

              <a href={cf.ownerFlags.bricked_share_link} target="_blank" rel="noopener noreferrer"

                className="text-xs text-primary underline hover:text-primary/80">

                View Bricked Report

              </a>

            )}

          </div>

        </div>



        {arv > 0 ? (

          <>

            <div className="grid grid-cols-2 gap-4">

              <div>

                <p className="text-xs text-muted-foreground uppercase mb-0.5">{isScreeningMode ? "Screening Estimate" : "ARV"}</p>

                <p className={cn("text-2xl font-black font-mono tracking-tight", isScreeningMode ? "text-muted-foreground" : "text-foreground")} style={isScreeningMode ? {} : { textShadow: "0 0 10px var(--glow-soft)" }}>

                  {isScreeningMode ? formatRoughCurrency(arv) : formatCurrency(arv)}

                </p>

                {!isScreeningMode && arvLow > 0 && arvHigh > 0 && arvRangeResult.compCount > 1 && (

                  <p className="text-sm text-muted-foreground/70 font-mono mt-0.5">

                    {formatCurrency(arvLow)} {"\u2014"} {formatCurrency(arvHigh)}

                  </p>

                )}

              </div>

              <div>

                <p className="text-xs text-muted-foreground uppercase mb-0.5">{isScreeningMode ? <span className="text-muted-foreground">Screening Range</span> : "MAO"}</p>

                <p className={cn("text-2xl font-black font-mono tracking-tight", isScreeningMode ? "text-muted-foreground" : "text-foreground")}>

                  {compsUnderwrite.mao > 0 ? (isScreeningMode ? (quickScreenResult ? `${formatRoughCurrency(quickScreenResult.maoLow)} - ${formatRoughCurrency(quickScreenResult.maoHigh)}` : formatRoughCurrency(compsUnderwrite.mao)) : formatCurrency(compsUnderwrite.mao)) : "\u2014"}

                </p>

                <p className="text-xs text-muted-foreground/60 mt-0.5">

                  {!isScreeningMode && `${offerPct}% less $${(rehabEst / 1000).toFixed(0)}k rehab, $12k fee, $9.5k costs`}

                </p>

              </div>

            </div>



            {isScreeningMode ? (

              <div className="space-y-2">

                <p className="text-sm text-muted-foreground italic">

                  AVM-only screening estimate. Run comps before offering.

                </p>

                {screeningReasons.length > 0 && (

                  <div className="flex flex-wrap gap-1">

                    {screeningReasons.map((r, i) => (

                      <span key={i} className="text-xs px-1.5 py-0.5 rounded border border-overlay-12 bg-overlay-5/5 text-muted-foreground">{r}</span>

                    ))}

                  </div>

                )}

              </div>

            ) : (

              <div className="flex items-start gap-2">

                <span className={cn(

                  "text-sm px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0",

                  arvConfidence === "high" ? "bg-overlay-6/20 text-foreground" :

                  arvConfidence === "medium" ? "bg-overlay-5/20 text-muted-foreground" :

                  "bg-overlay-5/20 text-foreground",

                )}>

                  {arvConfidence}

                </span>

                <p className="text-sm text-foreground/80">{confidenceReason}</p>

              </div>

            )}



            <p className="text-sm text-muted-foreground/70">

              {cf.conditionLevel == null ? (

                <span className="text-muted-foreground font-semibold">Condition: Not assessed</span>

              ) : conditionAdj !== 0 ? (

                <>Condition adj: <span className={cn("font-semibold", conditionAdj > 0 ? "text-foreground" : "text-foreground")}>

                  {CONDITION_LABELS[conditionAdj] ?? `${conditionAdj > 0 ? "+" : ""}${conditionAdj}%`}

                </span></>

              ) : (

                <span className="text-muted-foreground">Condition: Level 4 (Light cosmetic, 0% adj)</span>

              )}

            </p>



            {(() => {

              const danger = decisionWarnings.filter((w) => w.severity === "danger");

              const warnLevel = decisionWarnings.filter((w) => w.severity === "warn");

              const shownWarn = warnLevel.slice(0, 2);

              const overflowCount = warnLevel.length - shownWarn.length;

              return (

                <>

                  {danger.map((w, i) => (

                    <p key={`d-${i}`} className="text-sm flex items-center gap-1 text-foreground">

                      <AlertTriangle className="h-3 w-3 shrink-0" />

                      {w.message}

                    </p>

                  ))}

                  {shownWarn.map((w, i) => (

                    <p key={`w-${i}`} className="text-sm flex items-center gap-1 text-muted-foreground">

                      <AlertTriangle className="h-3 w-3 shrink-0" />

                      {w.message}

                    </p>

                  ))}

                  {overflowCount > 0 && (

                    <p className="text-xs text-muted-foreground/50">+{overflowCount} more</p>

                  )}

                  {danger.length > 0 && (

                    <p className="text-sm text-foreground font-semibold mt-1">Review with Adam before offering</p>

                  )}

                </>

              );

            })()}



            {isScreeningMode && (

              <button

                onClick={() => setResearchMode(true)}

                className="w-full mt-1 py-1.5 rounded-[6px] border border-overlay-30 bg-overlay-10 text-foreground text-sm font-semibold hover:bg-overlay-20 transition-colors"

              >

                Underwrite with comps

              </button>

            )}

          </>

        ) : (

          <p className="text-sm text-muted-foreground">Add comps or enrich to generate valuation</p>

        )}

      </div>





      {/* === BRICKED REPAIR BREAKDOWN === */}

      {(() => {

        const repairsJson = cf.ownerFlags?.bricked_repairs as string | undefined;

        if (!repairsJson) return null;

        let repairItems: Array<{ repair?: string; description?: string; cost?: number }> = [];

        try { repairItems = JSON.parse(repairsJson); } catch { return null; }

        if (!Array.isArray(repairItems) || repairItems.length === 0) return null;

        const totalRepair = (cf.ownerFlags?.bricked_repair_cost as number) ?? repairItems.reduce((sum, r) => sum + (r.cost ?? 0), 0);

        return (

          <details className="rounded-[10px] border border-overlay-6 bg-overlay-2">

            <summary className="p-3 cursor-pointer flex items-center justify-between text-sm">

              <span className="font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">

                <Wrench className="h-3 w-3" />

                Repair Estimate ({repairItems.length} items)

              </span>

              <span className="font-mono font-bold text-foreground">{formatCurrency(totalRepair)}</span>

            </summary>

            <div className="px-3 pb-3 space-y-1">

              {repairItems.map((r, i) => (

                <div key={i} className="flex items-center justify-between text-sm py-1 border-t border-overlay-4">

                  <div className="min-w-0">

                    <span className="text-foreground/90">{r.repair}</span>

                    {r.description && <span className="text-muted-foreground/60 ml-1.5 text-xs">({r.description})</span>}

                  </div>

                  <span className="font-mono text-foreground/80 shrink-0 ml-3">{r.cost ? formatCurrency(r.cost) : "\u2014"}</span>

                </div>

              ))}

            </div>

          </details>

        );

      })()}



      {/* === NUDGE BAR === */}

      {(() => {

        const strongCompCount = selectedComps.filter((c) => scoreComp(c, subject).total >= 55).length;

        const noPhotoComps = selectedComps.length > 0 && selectedComps.every((c) => !c.photoUrl && !c.streetViewUrl);

        const showNudge = !isScreeningMode && arv > 0 && (

          arvConfidence === "low" || strongCompCount < 2 || cf.conditionLevel == null || noPhotoComps

        );

        if (!showNudge) return null;

        const nudgeReason = cf.conditionLevel == null

          ? "Condition not assessed \u2014 review before offering."

          : noPhotoComps

            ? "No photo evidence on selected comps \u2014 verify before offering."

            : arvConfidence === "low"

              ? "Low confidence \u2014 review comp quality before offering."

              : `Only ${strongCompCount} strong comp match${strongCompCount === 1 ? "" : "es"} \u2014 review evidence before offering.`;

        return (

          <div className="rounded-[8px] border border-overlay-12 bg-overlay-5 px-3 py-2 flex items-start gap-2">

            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />

            <div className="flex-1">

              <p className="text-sm text-foreground font-semibold">Evidence needs strengthening</p>

              <p className="text-sm text-muted-foreground mt-0.5">{nudgeReason}</p>

            </div>

            <button

              onClick={() => setResearchMode(true)}

              className="text-sm text-foreground underline shrink-0"

            >

              Open Research Mode

            </button>

          </div>

        );

      })()}



      {/* === SECTION 2: TOP 3 COMP EVIDENCE === */}

      {(() => {

        const compsToShow = selectedComps.length > 0

          ? selectedComps.slice(0, 3)

          : [];



        // Show Bricked comps if no manual comps selected

        const brickedCompsJson = cf.ownerFlags?.bricked_comps as string | undefined;

        let brickedComps: Array<{ address?: string; beds?: number; baths?: number; sqft?: number; lastSaleAmount?: number; adjustedValue?: number; compType?: string; selected?: boolean }> = [];

        if (brickedCompsJson && compsToShow.length === 0) {

          try { brickedComps = JSON.parse(brickedCompsJson); } catch {}

        }



        if (compsToShow.length === 0 && brickedComps.length > 0 && arv > 0) {

          return (

            <div className="space-y-2">

              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">

                <CheckCircle2 className="h-3 w-3 text-foreground" />

                Bricked AI Comps ({brickedComps.length})

              </p>

              {brickedComps.slice(0, 5).map((bc, idx) => {

                const price = bc.lastSaleAmount ?? bc.adjustedValue ?? 0;

                const ppsf = price > 0 && bc.sqft ? Math.round(price / bc.sqft) : null;

                return (

                  <div key={idx} className="rounded-[8px] border border-overlay-6 bg-overlay-2 px-3 py-2.5">

                    <div className="flex items-start justify-between gap-2">

                      <div className="min-w-0 flex-1">

                        <p className="text-sm font-semibold truncate">{bc.address ?? "Unknown"}</p>

                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-sm text-muted-foreground">

                          {price > 0 && <span className="font-semibold text-foreground">{formatCurrency(price)}</span>}

                          {ppsf != null && <span className="font-mono">${ppsf}/sqft</span>}

                          {bc.beds != null && <span>{bc.beds}bd</span>}

                          {bc.baths != null && <span>{bc.baths}ba</span>}

                          {bc.sqft != null && <span>{bc.sqft.toLocaleString()} sqft</span>}

                        </div>

                      </div>

                      {bc.compType && (

                        <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-overlay-10 bg-overlay-4 text-muted-foreground shrink-0">

                          {bc.compType}

                        </span>

                      )}

                    </div>

                  </div>

                );

              })}

              <p className="text-xs text-muted-foreground text-center mt-1">

                Bricked AI comps shown {"\u2014"} open Research Mode to select manual comps.

              </p>

            </div>

          );

        }



        if (compsToShow.length === 0 && arv > 0) {

          return (

            <div className="rounded-[10px] border border-overlay-6 bg-overlay-2 p-3 text-center">

              <p className="text-sm text-muted-foreground">No comps selected {"\u2014"} open Research Mode to find and add comps.</p>

            </div>

          );

        }



        if (compsToShow.length === 0) return null;



        return (

          <div className="space-y-2">

            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">

              <CheckCircle2 className="h-3 w-3 text-foreground" />

              Top {compsToShow.length} Comp Evidence

            </p>

            {compsToShow.map((comp, idx) => {

              const compScore = scoreComp(comp, subject);

              const qualityLabel = getCompQualityLabel(compScore.total, comp.isForeclosure || comp.isTaxDelinquent);

              const rationale = getCompRationale(compScore, comp, subject);

              const salePrice = comp.lastSalePrice ?? comp.avm ?? 0;

              const ppsf = salePrice > 0 && comp.sqft ? Math.round(salePrice / comp.sqft) : null;

              const dist = comp.lat && comp.lng ? haversine(subject.lat, subject.lng, comp.lat, comp.lng) : null;

              const saleMonths = comp.lastSaleDate

                ? Math.round((Date.now() - new Date(comp.lastSaleDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44))

                : null;



              const qualityColor = qualityLabel === "Strong" ? "text-emerald-400" : qualityLabel === "Usable" ? "text-amber-400" : "text-red-400";



              return (

                <div

                  key={comp.apn}

                  className="rounded-[8px] border border-overlay-6 bg-overlay-2 px-3 py-2.5 cursor-pointer hover:bg-overlay-4 transition-colors"

                  onClick={() => { setResearchMode(true); setFocusedComp(comp); }}

                >

                  <div className="flex items-start justify-between gap-2">

                    <div className="min-w-0 flex-1">

                      <p className="text-sm font-semibold truncate">{comp.streetAddress}</p>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-sm text-muted-foreground">

                        {salePrice > 0 && <span className="font-semibold text-foreground">{formatCurrency(salePrice)}</span>}

                        {ppsf != null && <span className="font-mono">${ppsf}/sqft</span>}

                        {dist != null && <span>{dist.toFixed(1)}mi</span>}

                        {saleMonths != null && <span>{saleMonths}mo ago</span>}

                      </div>

                    </div>

                    <span className={cn("text-sm font-bold shrink-0 mt-0.5", qualityColor)}>

                      {qualityLabel}

                    </span>

                  </div>

                  <p className="text-xs text-muted-foreground/70 mt-1 italic">{rationale}</p>

                  {(() => {

                    const flags: Array<{ label: string; color: string }> = [];

                    if (comp.isForeclosure) flags.push({ label: "Foreclosure", color: "text-foreground border-overlay-15 bg-overlay-5/10" });

                    if (comp.isTaxDelinquent) flags.push({ label: "Tax Delinquent", color: "text-foreground border-overlay-15 bg-overlay-5/10" });

                    if (comp.isVacant) flags.push({ label: "Vacant", color: "text-muted-foreground border-overlay-12 bg-overlay-5/10" });

                    if (comp.isListedForSale) flags.push({ label: "Listed", color: "text-muted-foreground border-overlay-12 bg-overlay-5/10" });

                    const hasPhoto = !!(comp.photoUrl || comp.streetViewUrl);

                    if (flags.length === 0 && hasPhoto) return null;

                    return (

                      <div className="flex flex-wrap items-center gap-1 mt-1">

                        {flags.map((f, fi) => (

                          <span key={fi} className={cn("text-xs px-1 py-0.5 rounded border", f.color)}>{f.label}</span>

                        ))}

                        {hasPhoto

                          ? <span className="text-xs text-muted-foreground/50 flex items-center gap-0.5"><Camera className="h-2.5 w-2.5" />Photo</span>

                          : <span className="text-xs text-muted-foreground/40 flex items-center gap-0.5"><CameraOff className="h-2.5 w-2.5" />No photo</span>

                        }

                      </div>

                    );

                  })()}

                </div>

              );

            })}

          </div>

        );

      })()}



      {/* === RESEARCH MODE TOGGLE === */}

      <button

        onClick={() => setResearchMode((prev) => !prev)}

        className="w-full flex items-center justify-center gap-2 py-2 rounded-[8px] border border-overlay-6 bg-overlay-2 hover:bg-overlay-4 transition-colors text-sm text-muted-foreground"

      >

        <ChevronDown className={cn("h-3 w-3 transition-transform", researchMode && "rotate-180")} />

        {researchMode ? "Hide Research Mode" : "Research Mode \u2014 Map, all comps, score details"}

      </button>



      {/* === RESEARCH MODE CONTENT === */}

      {researchMode && (

        <>

          {/* Interactive map — requires coordinates */}

          {hasCoords ? (

            <CompsMap

              subject={subject}

              selectedComps={selectedComps}

              onAddComp={onAddComp}

              onRemoveComp={onRemoveComp}

              focusedComp={focusedComp}

            />

          ) : (

            <div className="rounded-[10px] border border-dashed border-overlay-10 bg-overlay-2 p-6 text-center">

              <MapPinned className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />

              <p className="text-sm text-muted-foreground/60">Map requires coordinates. Retry geocode or enrich from PropertyRadar.</p>

            </div>

          )}



          {/* Selected comps table */}

          {selectedComps.length > 0 && (

            <div className="rounded-[10px] border border-overlay-6 overflow-hidden">

              <div className="flex items-center justify-between px-4 py-2 bg-panel border-b border-overlay-6">

                <p className="text-xs font-semibold flex items-center gap-1.5">

                  <CheckCircle2 className="h-3 w-3 text-foreground" />

                  Selected Comps ({selectedComps.length})

                </p>

              </div>

              <div className="overflow-x-auto">

                <table className="w-full text-sm">

                  <thead>

                    <tr className="border-b border-overlay-6 bg-overlay-4">

                      <th className="px-2 py-2 font-medium text-muted-foreground w-[52px]"></th>

                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Address</th>

                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Beds</th>

                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Baths</th>

                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sqft</th>

                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Year</th>

                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">AVM</th>

                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Last Sale</th>

                      <th className="text-center px-3 py-2 font-medium text-muted-foreground"></th>

                    </tr>

                  </thead>

                  <tbody>

                    {selectedComps.map((comp) => {

                      const thumbSrc = comp.photoUrl

                        ?? comp.streetViewUrl

                        ?? (comp.lat && comp.lng ? getSatelliteTileUrl(comp.lat, comp.lng, 17) : null);

                      return (

                      <tr key={comp.apn} className="border-b border-overlay-6/50 hover:bg-overlay-4 cursor-pointer" onClick={() => setFocusedComp(prev => prev?.apn === comp.apn ? null : comp)}>

                        <td className="px-2 py-1.5">

                          {thumbSrc ? (

                            <div className="w-10 h-8 rounded overflow-hidden bg-black/30 border border-overlay-6">

                              <img src={thumbSrc} alt="" className="w-full h-full object-cover" />

                            </div>

                          ) : (

                            <div className="w-10 h-8 rounded bg-overlay-4 border border-overlay-6 flex items-center justify-center">

                              <Home className="h-3 w-3 text-muted-foreground" />

                            </div>

                          )}

                        </td>

                        <td className="px-3 py-2 max-w-[180px]">

                          <div className="truncate">{comp.streetAddress}</div>

                          {comp.lastSaleDate && (

                            <div className="text-xs text-muted-foreground">

                              Sold {new Date(comp.lastSaleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}

                            </div>

                          )}

                        </td>

                        <td className="px-3 py-2 text-right">{comp.beds ?? "—"}</td>

                        <td className="px-3 py-2 text-right">{comp.baths ?? "—"}</td>

                        <td className="px-3 py-2 text-right">{comp.sqft?.toLocaleString() ?? "—"}</td>

                        <td className="px-3 py-2 text-right">{comp.yearBuilt ?? "—"}</td>

                        <td className="px-3 py-2 text-right font-medium text-foreground">{comp.avm ? formatCurrency(comp.avm) : "—"}</td>

                        <td className="px-3 py-2 text-right">{comp.lastSalePrice ? formatCurrency(comp.lastSalePrice) : "—"}</td>

                        <td className="px-3 py-2 text-center">

                          <button onClick={() => onRemoveComp(comp.apn)} className="text-foreground hover:text-foreground">

                            <X className="h-3 w-3" />

                          </button>

                        </td>

                      </tr>

                      );

                    })}

                  </tbody>

                </table>

              </div>

            </div>

          )}



          {/* Focused comp detail panel with photo carousel */}

          {focusedComp && (

            <CompDetailPanel comp={focusedComp} onClose={() => setFocusedComp(null)} />

          )}



          {/* Condition Adjustment slider */}

          <div className="rounded-[10px] border border-overlay-6 bg-panel p-3">

            <div className="flex items-center justify-between mb-2">

              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Condition Adjustment</p>

              <span className={cn("text-xs font-bold", conditionAdj > 0 ? "text-foreground" : conditionAdj < 0 ? "text-foreground" : "text-muted-foreground")}>

                {CONDITION_LABELS[conditionAdj] ?? `${conditionAdj > 0 ? "+" : ""}${conditionAdj}%`}

              </span>

            </div>

            <p className="text-xs text-muted-foreground/60 mb-2">Adjust the ARV up or down based on the subject property{"'"}s condition relative to the comps. If it needs more work than the comps, slide left. If it{"'"}s in better shape, slide right.</p>

            <input type="range" min={-15} max={5} step={5} value={conditionAdj} onChange={(e) => onConditionAdjChange(Number(e.target.value))} className="w-full h-1.5 accent-foreground bg-secondary rounded-full" />

          </div>



          {/* Live ARV + Profit projection */}

          <div className="grid grid-cols-2 gap-4">

            <div className="rounded-lg border border-overlay-15 bg-overlay-4 p-4">

              <p className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">

                <TrendingUp className="h-3 w-3" />

                Live ARV

                {selectedComps.length > 0 && (

                  <span className={cn("ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium",

                    arvConfidence === "high" ? "bg-overlay-6/20 text-foreground" :

                    arvConfidence === "medium" ? "bg-overlay-5/20 text-muted-foreground" :

                    "bg-overlay-5/20 text-foreground"

                  )}>

                    {arvConfidence} confidence

                  </span>

                )}

              </p>

              {selectedComps.length > 0 ? (

                <div className="space-y-1.5 text-xs">

                  {avgPpsqft != null && (

                    <div className="flex justify-between">

                      <span className="text-muted-foreground">Avg $/sqft</span>

                      <span className="font-bold text-foreground">${avgPpsqft}</span>

                    </div>

                  )}

                  {arvLow > 0 && arvHigh > 0 && (

                    <div className="flex justify-between">

                      <span className="text-muted-foreground">Range</span>

                      <span className="font-medium">{formatCurrency(arvLow)} &ndash; {formatCurrency(arvHigh)}</span>

                    </div>

                  )}

                  {conditionAdj !== 0 && (

                    <div className="flex justify-between">

                      <span className="text-muted-foreground">Condition</span>

                      <span className={cn("font-medium", conditionAdj > 0 ? "text-foreground" : "text-foreground")}>

                        {conditionAdj > 0 ? "+" : ""}{conditionAdj}%

                      </span>

                    </div>

                  )}

                  <div className="pt-2 mt-2 border-t border-overlay-15 flex justify-between">

                    <span className="font-medium">Estimated ARV</span>

                    <span className="font-bold text-foreground text-xl" style={{ textShadow: "0 0 10px var(--overlay-10)" }}>

                      {formatCurrency(arv)}

                    </span>

                  </div>

                  <p className="text-xs text-muted-foreground/60 pt-1">

                    {avgPpsqft != null ? `Based on ${arvRangeResult.compCount} comp${arvRangeResult.compCount > 1 ? "s" : ""} × ${subjectSqft.toLocaleString()} sqft` : `Average of ${compMetrics.length} comp sale price${compMetrics.length > 1 ? "s" : ""}`}

                  </p>

                </div>

              ) : cf.estimatedValue ? (

                <div className="space-y-1.5 text-xs">

                  <div className="flex justify-between">

                    <span className="text-muted-foreground">AVM (pre-comps)</span>

                    <span className="font-bold text-foreground">{formatCurrency(cf.estimatedValue)}</span>

                  </div>

                  {conditionAdj !== 0 && (

                    <div className="flex justify-between">

                      <span className="text-muted-foreground">Condition</span>

                      <span className={cn("font-medium", conditionAdj > 0 ? "text-foreground" : "text-foreground")}>

                        {conditionAdj > 0 ? "+" : ""}{conditionAdj}%

                      </span>

                    </div>

                  )}

                  <div className="pt-2 mt-2 border-t border-overlay-15 flex justify-between">

                    <span className="font-medium">Est. ARV</span>

                    <span className="font-bold text-foreground text-xl" style={{ textShadow: "0 0 10px var(--overlay-10)" }}>

                      {formatCurrency(arv)}

                    </span>

                  </div>

                  <p className="text-xs text-muted-foreground/60 pt-1">Add comps for a more accurate ARV</p>

                </div>

              ) : (

                <p className="text-sm text-muted-foreground">Add comps to calculate</p>

              )}

            </div>



            <div className="rounded-[12px] border border-glass-border bg-secondary/10 p-4">

              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">

                <DollarSign className="h-3 w-3" />

                Quick Profit Projection

              </p>

              <div className="space-y-1 text-xs">

                <div className="flex justify-between">

                  <span className="text-muted-foreground">ARV</span>

                  <span className="font-medium">{formatCurrency(arv)}</span>

                </div>

                <div className="flex justify-between items-center">

                  <span className="text-muted-foreground flex items-center gap-1">

                    Offer

                    <input type="range" min={50} max={80} step={5} value={offerPct} onChange={(e) => setOfferPct(Number(e.target.value))} className="w-14 h-1 accent-foreground" />

                    <span className="text-sm font-mono w-7 text-right">{offerPct}%</span>

                  </span>

                  <span className="font-medium text-foreground">-{formatCurrency(offer)}</span>

                </div>

                <div className="flex justify-between items-center">

                  <span className="text-muted-foreground flex items-center gap-1">

                    Rehab

                    <input type="number" value={rehabEst} onChange={(e) => setRehabEst(Number(e.target.value) || 0)} className="w-16 h-5 text-sm text-right bg-overlay-6 border border-overlay-10 rounded px-1 font-mono" />

                  </span>

                  <span className="font-medium text-foreground">-{formatCurrency(rehabEst)}</span>

                </div>

                <div className="pt-1.5 mt-1.5 border-t border-overlay-6 flex justify-between">

                  <span className="font-semibold">Est. Assignment Fee</span>

                  <span className={cn("font-bold text-lg", profit >= 0 ? "text-foreground" : "text-foreground")} style={profit >= 0 ? { textShadow: "0 0 10px var(--glow-soft)" } : {}}>

                    {formatCurrency(profit)}

                  </span>

                </div>

                <div className="flex justify-between text-sm">

                  <span className="text-muted-foreground">ROI</span>

                  <span className={cn("font-semibold", roi >= 0 ? "text-foreground" : "text-foreground")}>{roi}%</span>

                </div>

              </div>

            </div>

          </div>

        </>

      )}

    </div>

  );

}





interface MasterClientFileModalProps {

  clientFile: ClientFile | null;

  open: boolean;

  onClose: () => void;

  onClaim?: (id: string) => void;

  onRefresh?: () => void;

}



function mergeClientFileState(

  base: ClientFile | null,

  patch: Partial<ClientFile> | null,

  ownerFlagsOverride: Record<string, unknown> | null,

): ClientFile | null {

  if (!base) return null;

  if (!patch && !ownerFlagsOverride) return base;

  return {

    ...base,

    ...(patch ?? {}),

    ownerFlags: ownerFlagsOverride ?? patch?.ownerFlags ?? base.ownerFlags,

  };

}



function readResponseString(payload: Record<string, unknown>, key: string): string | null | undefined {

  if (!Object.prototype.hasOwnProperty.call(payload, key)) return undefined;

  const value = payload[key];

  return typeof value === "string" ? value : value == null ? null : undefined;

}



export function MasterClientFileModal({ clientFile: incomingClientFile, open, onClose, onClaim, onRefresh }: MasterClientFileModalProps) {

  const router = useRouter();

  const { startCall, callState: twilioCallState } = useTwilio();

  const { sidebarOpen, sidebarWidth } = useSentinelStore();

  const sidebarOffset = sidebarOpen ? sidebarWidth / 2 : 0;

  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const [skipTracing, setSkipTracing] = useState(false);

  const [skipTraceResult, setSkipTraceResult] = useState<string | null>(null);

  const [skipTraceMs, setSkipTraceMs] = useState<number | null>(null);

  const [overlay, setOverlay] = useState<SkipTraceOverlay | null>(null);

  const [skipTraceError, setSkipTraceError] = useState<SkipTraceError | null>(null);

  const [selectedComps, setSelectedComps] = useState<CompProperty[]>([]);

  const [computedArv, setComputedArv] = useState(

    () => (incomingClientFile?.ownerFlags?.comp_arv as number) ?? 0

  );

  // Phase 2.5 — condition adjustment lifted from CompsTab for persistence

  const [conditionAdj, setConditionAdj] = useState(

    () => typeof (incomingClientFile?.ownerFlags as any)?.offer_prep_snapshot?.condition_adj_pct === "number"

      ? ((incomingClientFile?.ownerFlags as any).offer_prep_snapshot.condition_adj_pct as number)

      : 0

  );

  const [editOpen, setEditOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const [claiming, setClaiming] = useState(false);

  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [activeTaskLoading, setActiveTaskLoading] = useState(false);
  const [jeffInteractions, setJeffInteractions] = useState<Array<{
    id: string;
    status: "needs_review" | "task_open" | "reviewed" | "resolved";
    direction: string;
    caller_phone: string | null;
    caller_name: string | null;
    property_address: string | null;
    interaction_type: string;
    summary: string | null;
    callback_requested: boolean;
    callback_due_at: string | null;
    callback_timing_text: string | null;
    transfer_outcome: string | null;
    voice_session_id: string;
    task_id: string | null;
    task?: { id: string; title: string | null; status: string | null; due_at: string | null } | null;
  }>>([]);
  const [jeffInteractionsLoading, setJeffInteractionsLoading] = useState(false);

  const calling = twilioCallState === "dialing" || twilioCallState === "connected";

  const [callStatus, setCallStatus] = useState<string | null>(null);

  const [smsOpen, setSmsOpen] = useState(false);

  const [smsMessage, setSmsMessage] = useState("");

  const [smsSending, setSmsSending] = useState(false);

  const [smsPhone, setSmsPhone] = useState<string | null>(null);

  const [dialHistoryMap, setDialHistoryMap] = useState<Record<string, { count: number; lastDate: string; lastDisposition: string }>>({});

  const [autofilling, setAutofilling] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  const [assigneeLabel, setAssigneeLabel] = useState("Unassigned");

  const [selectedStage, setSelectedStage] = useState<WorkflowStageId>("prospect");

  const [stageUpdating, setStageUpdating] = useState(false);

  const [allowedTransitions, setAllowedTransitions] = useState<Array<{ status: string; requires_next_action: boolean }>>([]);
  const [stageLockVersion, setStageLockVersion] = useState<number>(0);
  const [stageNextAction, setStageNextAction] = useState("");
  const [stageNextActionDueAt, setStageNextActionDueAt] = useState("");

  const [qualificationDraft, setQualificationDraft] = useState<QualificationDraft>(() => getQualificationDraft(incomingClientFile));

  const [offerPrepDraft, setOfferPrepDraft] = useState<OfferPrepSnapshotDraft>(() => getOfferPrepDraft(incomingClientFile));

  const [offerStatusDraft, setOfferStatusDraft] = useState<OfferStatusSnapshotDraft>(() => getOfferStatusDraft(incomingClientFile));

  const [buyerDispoTruthDraft, setBuyerDispoTruthDraft] = useState<BuyerDispoTruthDraft>(() => getBuyerDispoTruthDraft(incomingClientFile));

  const [ownerFlagsOverride, setOwnerFlagsOverride] = useState<Record<string, unknown> | null>(null);

  const [clientFilePatch, setClientFilePatch] = useState<Partial<ClientFile> | null>(null);

  const [offerPrepEditing, setOfferPrepEditing] = useState(false);

  const [offerPrepSaving, setOfferPrepSaving] = useState(false);

  const [offerStatusEditing, setOfferStatusEditing] = useState(false);

  const [offerStatusSaving, setOfferStatusSaving] = useState(false);

  const [buyerDispoTruthEditing, setBuyerDispoTruthEditing] = useState(false);

  const [buyerDispoTruthSaving, setBuyerDispoTruthSaving] = useState(false);

  const [qualificationSuggestedRoute, setQualificationSuggestedRoute] = useState<QualificationRoute | null>(null);

  const [qualificationSaving, setQualificationSaving] = useState(false);

  const [nextActionAt, setNextActionAt] = useState("");

  const [settingNextAction, setSettingNextAction] = useState(false);

  const [nextActionEditorOpen, setNextActionEditorOpen] = useState(false);

  const [noteDraft, setNoteDraft] = useState("");

  const [milestoneDraft, setMilestoneDraft] = useState<MilestoneDraft>(() => ({

    appointmentAt: incomingClientFile?.appointmentAt ? toLocalDateTimeInput(incomingClientFile.appointmentAt) : "",

    offerAmount: incomingClientFile?.offerAmount != null ? String(incomingClientFile.offerAmount) : "",

    contractAt: incomingClientFile?.contractAt ? toLocalDateTimeInput(incomingClientFile.contractAt) : "",

    assignmentFeeProjected: incomingClientFile?.assignmentFeeProjected != null ? String(incomingClientFile.assignmentFeeProjected) : "",

  }));

  const [milestoneEditing, setMilestoneEditing] = useState(false);

  const [milestoneSaving, setMilestoneSaving] = useState(false);

  const [savingNote, setSavingNote] = useState(false);

  const [noteEditorOpen, setNoteEditorOpen] = useState(false);

  const [closeoutOpen, setCloseoutOpen] = useState(false);

  const [closeoutSaving, setCloseoutSaving] = useState(false);

  const [closeoutOutcome, setCloseoutOutcome] = useState<string>("");

  const [closeoutNote, setCloseoutNote] = useState("");

  const [closeoutAction, setCloseoutAction] = useState<CloseoutNextAction>("follow_up_call");

  const [closeoutPreset, setCloseoutPreset] = useState<CloseoutPresetId>("call_3_days");

  const [closeoutAt, setCloseoutAt] = useState("");

  const [closeoutPresetTouched, setCloseoutPresetTouched] = useState(false);

  const [closeoutDateTouched, setCloseoutDateTouched] = useState(false);

  const [activityRefreshToken, setActivityRefreshToken] = useState(0);

  const [assignmentOptions, setAssignmentOptions] = useState<Array<{ id: string; name: string }>>([]);

  const [reassignTargetId, setReassignTargetId] = useState("");

  const [reassigning, setReassigning] = useState(false);

  const [activeUpdating, setActiveUpdating] = useState(false);
  const [moveTarget, setMoveTarget] = useState<"" | "active" | "drive_by" | "dead">("");



  // —— Deep Crawl state ——

  const [deepCrawling, setDeepCrawling] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const [deepCrawlResult, setDeepCrawlResult] = useState<any>(null);

  const [deepCrawlExpanded, setDeepCrawlExpanded] = useState(false);

  const [crawlSteps, setCrawlSteps] = useState<CrawlStep[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const [deepSkipResult, setDeepSkipResult] = useState<any>(null);



  // Pre-populate deep crawl from cached results

  // Results persist permanently once crawled (like addresses/phone numbers)

  // Uses a ref to avoid infinite re-render loops from ownerFlags dependency

  // Check if a saved Deep Crawl report exists for this property

  const [hasSavedReport, setHasSavedReport] = useState(false);

  const [loadingReport, setLoadingReport] = useState(false);

  const deepCrawlCheckedRef = useRef<string | null>(null);

  const clientFile = useMemo(

    () => mergeClientFileState(incomingClientFile, clientFilePatch, ownerFlagsOverride),

    [incomingClientFile, clientFilePatch, ownerFlagsOverride],

  );



  // ------------------------------------------------------------

  const qualCompleteness = useMemo(() => {

    if (!clientFile) return 0;

    let filled = 0;

    if (clientFile.motivationLevel != null && clientFile.motivationLevel > 0) filled++;

    if (clientFile.sellerTimeline) filled++;

    if (clientFile.conditionLevel != null && clientFile.conditionLevel > 0) filled++;

    if (clientFile.decisionMakerConfirmed) filled++;

    if (clientFile.priceExpectation != null && clientFile.priceExpectation > 0) filled++;

    return filled / 5;

  }, [clientFile]);



  useCoachSurface(

    closeoutOpen ? "lead_detail_closeout" : "lead_detail",

    {

      lead: clientFile ? {

        id: clientFile.id,

        status: clientFile.status,

        qualification_route: clientFile.qualificationRoute ?? undefined,

        assigned_to: clientFile.assignedTo ?? undefined,

        calls_count: clientFile.totalCalls ?? 0,

        next_action_at: clientFile.nextActionDueAt ?? clientFile.followUpDate ?? clientFile.nextCallScheduledAt ?? undefined,

        last_contact_at: clientFile.lastContactAt ?? undefined,

        qualification_completeness: qualCompleteness,

        offer_amount: (clientFile.ownerFlags as Record<string, unknown>)?.offer_status_snapshot

          ? ((clientFile.ownerFlags as Record<string, unknown>)?.offer_status_snapshot as Record<string, unknown>)?.amount as number | undefined

          : undefined,

        has_note_context: !!(clientFile.notes?.length),

        has_disposition: !!clientFile.dispositionCode,

        address: clientFile.fullAddress ?? undefined,

      } : undefined,

      closeout: closeoutOpen ? {

        action_type: closeoutAction,

        has_date: !!closeoutAt,

        has_disposition: closeoutOutcome !== "" && closeoutOutcome !== "no_change",

        has_note: !!closeoutNote?.trim(),

      } : undefined,

    },

  );



  // ------------------------------------------------------------

  useEffect(() => {

    if (!clientFile?.id) return;



    // Fire-and-forget — don't block modal rendering

    fetch(`/api/leads/${clientFile.id}/contradiction-scan`, { method: 'POST' })

      .catch(() => {}); // Silent fail — contradictions are informational

  }, [clientFile?.id]);



  useEffect(() => {

    const propId = clientFile?.propertyId;

    if (!propId || deepCrawlCheckedRef.current === propId) return;

    deepCrawlCheckedRef.current = propId;



    // First check inline ownerFlags (works for prospects with full data)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const inlineCached = (clientFile?.ownerFlags as any)?.deep_crawl;

    if (inlineCached?.crawledAt && (inlineCached.grokSuccess === true || inlineCached.aiDossier?.webFindings?.length > 0)) {

      setHasSavedReport(true);

      return;

    }



    // For leads (ownerFlags is empty), do a lightweight DB check

    (async () => {

      try {

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        const { data } = await (supabase.from("properties") as any)

          .select("owner_flags")

          .eq("id", propId)

          .single();

        const dc = data?.owner_flags?.deep_crawl;

        if (dc?.crawledAt && (dc.grokSuccess === true || dc.aiDossier?.webFindings?.length > 0)) {

          setHasSavedReport(true);

        }

      } catch {

        // Silently fail

      }

    })();

  }, [clientFile?.propertyId, clientFile?.ownerFlags]);



  useEffect(() => {

    setOwnerFlagsOverride(null);

    setClientFilePatch(null);

  }, [incomingClientFile?.id, incomingClientFile?.ownerFlags]);



  // Load saved report from DB when user clicks "View Report"

  const loadSavedReport = useCallback(async () => {

    const propId = clientFile?.propertyId;

    if (!propId) return;

    setLoadingReport(true);

    try {

      // First try inline ownerFlags

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const inlineCached = (clientFile?.ownerFlags as any)?.deep_crawl;

      if (inlineCached?.crawledAt) {

        setDeepCrawlResult(inlineCached);

        setDeepCrawlExpanded(true);

        // Also load deep skip if available

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        const ds = (clientFile?.ownerFlags as any)?.deep_skip ?? inlineCached?.deepSkip;

        if (ds) setDeepSkipResult(ds);

        return;

      }

      // Fetch from DB

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const { data } = await (supabase.from("properties") as any)

        .select("owner_flags")

        .eq("id", propId)

        .single();

      const dc = data?.owner_flags?.deep_crawl;

      if (dc?.crawledAt) {

        setDeepCrawlResult(dc);

        setDeepCrawlExpanded(true);

        // Also load deep skip

        const ds = data?.owner_flags?.deep_skip ?? dc?.deepSkip;

        if (ds) setDeepSkipResult(ds);

      }

    } catch {

      // Silently fail

    } finally {

      setLoadingReport(false);

    }

  }, [clientFile?.propertyId, clientFile?.ownerFlags]);



  const displayPhone = overlay?.primaryPhone ?? clientFile?.ownerPhone ?? null;



  useEffect(() => {

    let active = true;

    if (!open) return;



    (async () => {

      try {

        const { data: { user } } = await supabase.auth.getUser();

        if (!active) return;

        setCurrentUserId(user?.id ?? null);

        if (!user?.id) {

          setCurrentUserName(null);

          return;

        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        const { data } = await (supabase.from("user_profiles") as any)

          .select("full_name")

          .eq("id", user.id)

          .maybeSingle();

        if (!active) return;

        const fullName = (data?.full_name as string | undefined)?.trim();

        setCurrentUserName(fullName && fullName.length > 0 ? fullName : null);

      } catch {

        if (active) {

          setCurrentUserId(null);

          setCurrentUserName(null);

        }

      }

    })();



    return () => { active = false; };

  }, [open]);



  useEffect(() => {

    let active = true;

    if (!open) return;



    (async () => {

      try {

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        const { data } = await (supabase.from("user_profiles") as any)

          .select("id, full_name")

          .order("full_name", { ascending: true });

        if (!active) return;

        const options = (data as Array<{ id: string; full_name: string | null }> | null | undefined)

          ?.filter((row) => typeof row.id === "string" && row.id.length > 0)

          .map((row) => ({

            id: row.id,

            name: row.full_name?.trim() && row.full_name.trim().length > 0 ? row.full_name.trim() : row.id.slice(0, 8),

          })) ?? [];

        setAssignmentOptions(options);

      } catch {

        if (active) setAssignmentOptions([]);

      }

    })();



    return () => { active = false; };

  }, [open]);



  useEffect(() => {

    setReassignTargetId(clientFile?.assignedTo ?? currentUserId ?? "");

  }, [clientFile?.id, clientFile?.assignedTo, currentUserId]);



  useEffect(() => {

    setSelectedStage(normalizeWorkflowStage(clientFile?.status));

  }, [clientFile?.id, clientFile?.status]);

  // Fetch allowed stage transitions from the stage API
  useEffect(() => {
    if (!clientFile?.id) return;
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        const res = await fetch(`/api/leads/${clientFile.id}/stage`, { headers });
        if (res.ok && active) {
          const data = await res.json();
          setAllowedTransitions(data.allowed_transitions ?? []);
          setStageLockVersion(data.lock_version ?? 0);
        }
      } catch { /* non-fatal */ }
    })();
    return () => { active = false; };
  }, [clientFile?.id, clientFile?.status]);



  useEffect(() => {

    setQualificationDraft(getQualificationDraft(clientFile));

    setOfferPrepDraft(getOfferPrepDraft(clientFile));

    setOfferStatusDraft(getOfferStatusDraft(clientFile));

    setBuyerDispoTruthDraft(getBuyerDispoTruthDraft(clientFile));

    setOfferPrepEditing(false);

    setOfferStatusEditing(false);

    setBuyerDispoTruthEditing(false);

    setQualificationSuggestedRoute(null);

    const existingNextAction = toLocalDateTimeInput(clientFile?.nextCallScheduledAt ?? clientFile?.followUpDate);

    setNextActionAt(existingNextAction);

    setNoteDraft("");

    setNextActionEditorOpen(false);

    setNoteEditorOpen(false);

    setCloseoutOpen(false);

    setCloseoutSaving(false);

    setCloseoutOutcome(clientFile?.dispositionCode ?? "");

    setCloseoutNote("");

    setCloseoutAction("follow_up_call");

    setCloseoutPreset("call_3_days");

    setCloseoutAt(existingNextAction || presetDateTimeLocal(3));

    setCloseoutPresetTouched(false);

    setCloseoutDateTouched(false);

    // Granular deps are intentional: clientFile is a useMemo that changes on any

    // patch, but this reset should only fire on identity/field changes, not drafts.

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [clientFile?.id, clientFile?.nextCallScheduledAt, clientFile?.followUpDate, clientFile?.dispositionCode]);



  useEffect(() => {

    let active = true;

    const assignedTo = clientFile?.assignedTo ?? null;



    if (!assignedTo) {

      setAssigneeLabel("Unassigned");

      return () => { active = false; };

    }



    if (currentUserId && assignedTo === currentUserId) {

      setAssigneeLabel(currentUserName ? `${currentUserName} (You)` : "You");

      return () => { active = false; };

    }



    (async () => {

      try {

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        const { data } = await (supabase.from("user_profiles") as any)

          .select("full_name")

          .eq("id", assignedTo)

          .maybeSingle();

        if (!active) return;

        const fullName = (data?.full_name as string | undefined)?.trim();

        setAssigneeLabel(fullName && fullName.length > 0 ? fullName : `${assignedTo.slice(0, 8)}...`);

      } catch {

        if (active) setAssigneeLabel(`${assignedTo.slice(0, 8)}...`);

      }

    })();



    return () => { active = false; };

  }, [clientFile?.assignedTo, currentUserId, currentUserName]);



  // Reset all skip-trace / enrichment state when switching to a different prospect

  // Without this, overlay data from the previous prospect bleeds into the new one

  const prevPropertyIdRef = useRef(clientFile?.propertyId);

  useEffect(() => {

    if (clientFile?.propertyId !== prevPropertyIdRef.current) {

      prevPropertyIdRef.current = clientFile?.propertyId;

      setOverlay(null);

      setSkipTraceResult(null);

      setSkipTraceMs(null);

      setSkipTraceError(null);

      setSelectedComps([]);

      setComputedArv((clientFile?.ownerFlags?.comp_arv as number) ?? 0);

      setSelectedStage(normalizeWorkflowStage(clientFile?.status));

      setOfferPrepDraft(getOfferPrepDraft(clientFile));

      setOfferStatusDraft(getOfferStatusDraft(clientFile));

      setBuyerDispoTruthDraft(getBuyerDispoTruthDraft(clientFile));

      setOfferPrepEditing(false);

      setOfferStatusEditing(false);

      setBuyerDispoTruthEditing(false);

      setDialHistoryMap({});

      // Reset deep crawl

      setDeepCrawling(false);

      setDeepCrawlResult(null);

      setDeepCrawlExpanded(false);

      setHasSavedReport(false);

      setLoadingReport(false);

      setCrawlSteps([]);

      setDeepSkipResult(null);

      deepCrawlCheckedRef.current = null;

    }

    // Granular deps are intentional: this resets enrichment state only when switching

    // properties, not on every clientFile patch (which would clear user work in progress).

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [clientFile?.propertyId, clientFile?.ownerFlags]);



  // Fetch dial history for this lead — groups calls_log by phone_dialed

  const fetchDialHistory = useCallback(async () => {

    if (!clientFile?.id) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const { data } = await (supabase.from("calls_log") as any)

      .select("phone_dialed, disposition, started_at")

      .eq("lead_id", clientFile.id)

      .order("started_at", { ascending: false });



    if (!data) return;

    const grouped: Record<string, { count: number; lastDate: string; lastDisposition: string }> = {};

    for (const row of data as { phone_dialed: string; disposition: string; started_at: string }[]) {

      const norm = row.phone_dialed.replace(/\D/g, "").slice(-10);

      if (!grouped[norm]) {

        grouped[norm] = { count: 1, lastDate: row.started_at, lastDisposition: row.disposition };

      } else {

        grouped[norm].count++;

      }

    }

    setDialHistoryMap(grouped);

  }, [clientFile?.id]);



  useEffect(() => { fetchDialHistory(); }, [fetchDialHistory]);



  // Real-time subscription for call updates

  useEffect(() => {

    if (!clientFile?.id) return;

    const channel = supabase

      .channel(`dial-history-${clientFile.id}`)

      .on(

        "postgres_changes",

        { event: "*", schema: "public", table: "calls_log", filter: `lead_id=eq.${clientFile.id}` },

        () => { fetchDialHistory(); },

      )

      .subscribe();

    return () => { supabase.removeChannel(channel); };

  }, [clientFile?.id, fetchDialHistory]);



  const extractUpdatedOwnerFlags = useCallback((payload: unknown): Record<string, unknown> | null => {

    const property = (payload as { property?: unknown } | null | undefined)?.property;

    if (!property || typeof property !== "object" || Array.isArray(property)) return null;

    const ownerFlags = (property as { owner_flags?: unknown }).owner_flags;

    if (!ownerFlags || typeof ownerFlags !== "object" || Array.isArray(ownerFlags)) return null;

    return ownerFlags as Record<string, unknown>;

  }, []);



  const applyOwnerFlagsOverride = useCallback((payload: unknown): Record<string, unknown> | null => {

    const updatedOwnerFlags = extractUpdatedOwnerFlags(payload);

    if (updatedOwnerFlags) {

      setOwnerFlagsOverride(updatedOwnerFlags);

    }

    return updatedOwnerFlags;

  }, [extractUpdatedOwnerFlags]);



  const applyLeadPatchFromResponse = useCallback((payload: unknown) => {

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

    const response = payload as Record<string, unknown>;

    setClientFilePatch((prev) => {

      const next: Partial<ClientFile> = { ...(prev ?? {}) };

      const status = readResponseString(response, "status");

      if (status !== undefined) next.status = status ?? "prospect";

      if (Object.prototype.hasOwnProperty.call(response, "assigned_to")) {

        next.assignedTo = typeof response.assigned_to === "string" ? response.assigned_to : null;

      }

      const nextCall = readResponseString(response, "next_call_scheduled_at");

      if (nextCall !== undefined) next.nextCallScheduledAt = nextCall;

      const nextFollowUp = readResponseString(response, "next_follow_up_at");

      if (nextFollowUp !== undefined) next.followUpDate = nextFollowUp;

      const lastContact = readResponseString(response, "last_contact_at");

      if (lastContact !== undefined) next.lastContactAt = lastContact;

      const disposition = readResponseString(response, "disposition_code");

      if (disposition !== undefined) next.dispositionCode = disposition;

      if (Object.prototype.hasOwnProperty.call(response, "qualification_route")) {

        next.qualificationRoute = parseSuggestedRoute(response.qualification_route);

      }

      const nextAction = readResponseString(response, "next_action");

      if (nextAction !== undefined) next.nextAction = nextAction;

      const nextActionDueAt = readResponseString(response, "next_action_due_at");

      if (nextActionDueAt !== undefined) next.nextActionDueAt = nextActionDueAt;

      const notes = readResponseString(response, "notes");

      if (notes !== undefined) next.notes = notes;

      if (Object.prototype.hasOwnProperty.call(response, "qualification_score_total")) {

        next.qualificationScoreTotal = typeof response.qualification_score_total === "number"

          ? response.qualification_score_total

          : null;

      }

      if (Object.prototype.hasOwnProperty.call(response, "lock_version")) {

        next.lockVersion = typeof response.lock_version === "number" ? response.lock_version : next.lockVersion;

      }

      return next;

    });

  }, []);



  const handleClaimLead = useCallback(async () => {

    if (!clientFile) return;

    const normalizedStatus = normalizeWorkflowStage(clientFile.status);

    const canClaimToLead = getAllowedTransitions(normalizedStatus).includes("lead");

    const actionLabel = canClaimToLead ? "Claim" : "Assign";

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {

      toast.error(`Session expired - cannot ${actionLabel.toLowerCase()}`);

      return;

    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {

      toast.error(`Not logged in - cannot ${actionLabel.toLowerCase()}`);

      return;

    }

    if (clientFile.assignedTo && clientFile.assignedTo !== user.id) {

      const confirmed = window.confirm(`This lead is currently owned by ${assigneeLabel}. Reassign it to you?`);

      if (!confirmed) return;

    }



    setClaiming(true);

    try {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)

        .select("status, lock_version")

        .eq("id", clientFile.id)

        .single();



      if (fetchErr || !current) {

        toast.error(`${actionLabel} failed: Could not fetch lead status. Refresh and try again.`);

        return;

      }



      const payload: Record<string, unknown> = {

        lead_id: clientFile.id,

        assigned_to: user.id,

      };

      if (canClaimToLead) {

        payload.status = "lead";

      }



      const res = await fetch("/api/prospects", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          "x-lock-version": String(current.lock_version ?? 0),

          Authorization: `Bearer ${session.access_token}`,

        },

        body: JSON.stringify(payload),

      });



      const data = await res.json();



      if (!res.ok) {

        console.error(`[MCF] ${actionLabel.toLowerCase()} failed:`, res.status, data);

        if (res.status === 409) {

          toast.error(`${actionLabel} failed: Lead was modified by someone else. Refresh and try again.`);

        } else if (res.status === 422) {

          toast.error(`${actionLabel} failed: ${data.detail ?? data.error ?? "Invalid transition"}`);

        } else {

          toast.error(`${actionLabel} failed: ${data.error ?? `HTTP ${res.status}`}`);

        }

        return;

      }



      applyLeadPatchFromResponse(data);

      toast.success(canClaimToLead ? "Lead claimed successfully" : "Lead assignment updated");

      onClaim?.(clientFile.id);

      onRefresh?.();

    } catch (err) {

      console.error(`[MCF] ${actionLabel.toLowerCase()} error:`, err);

      toast.error(`${actionLabel} failed: Network error. Check your connection and try again.`);

    } finally {

      setClaiming(false);

    }

  }, [applyLeadPatchFromResponse, assigneeLabel, clientFile, onClaim, onRefresh]);



  const handleReassignLead = useCallback(async () => {

    if (!clientFile) return;

    if (!reassignTargetId) {

      toast.error("Select an owner before reassigning.");

      return;

    }

    if (reassignTargetId === (clientFile.assignedTo ?? "")) {

      toast.message("Lead owner is already selected.");

      return;

    }



    const targetName = assignmentOptions.find((option) => option.id === reassignTargetId)?.name ?? "selected owner";

    const hasExistingOwner = Boolean(clientFile.assignedTo);

    if (hasExistingOwner) {

      const confirmed = window.confirm(`Reassign this lead to ${targetName}?`);

      if (!confirmed) return;

    }



    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {

      toast.error("Session expired - cannot reassign lead");

      return;

    }



    setReassigning(true);

    try {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)

        .select("lock_version")

        .eq("id", clientFile.id)

        .single();



      if (fetchErr || !current) {

        toast.error("Could not load current lead state. Refresh and try again.");

        return;

      }



      const res = await fetch("/api/prospects", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

          "x-lock-version": String(current.lock_version ?? 0),

        },

        body: JSON.stringify({

          lead_id: clientFile.id,

          assigned_to: reassignTargetId,

        }),

      });



      const data = await res.json().catch(() => ({}));

      if (!res.ok) {

        const detail = data.detail ?? data.error ?? `HTTP ${res.status}`;

        if (res.status === 409) {

          toast.error("Reassign conflict: refresh and try again.");

        } else {

          toast.error(`Could not reassign lead: ${detail}`);

        }

        return;

      }



      applyLeadPatchFromResponse(data);

      setAssigneeLabel(targetName);

      toast.success(`Lead reassigned to ${targetName}`);

      onRefresh?.();

    } catch (err) {

      console.error("[MCF] Reassign lead error:", err);

      toast.error("Could not reassign lead");

    } finally {

      setReassigning(false);

    }

  }, [applyLeadPatchFromResponse, assignmentOptions, clientFile, onRefresh, reassignTargetId]);



  const handleMoveStage = useCallback(async () => {

    if (!clientFile) return;

    const currentStatus = normalizeWorkflowStage(clientFile.status);

    if (selectedStage === currentStatus) {

      toast.message(`Already in ${workflowStageLabel(currentStatus)}`);

      return;

    }

    const precheck = precheckWorkflowStageChange({

      currentStatus: currentStatus as LeadStatus,

      targetStatus: selectedStage as LeadStatus,

      assignedTo: clientFile.assignedTo,

      lastContactAt: clientFile.lastContactAt,

      totalCalls: clientFile.totalCalls,

      dispositionCode: clientFile.dispositionCode,

      nextCallScheduledAt: clientFile.nextCallScheduledAt,

      nextFollowUpAt: clientFile.followUpDate,

      qualificationRoute: clientFile.qualificationRoute,

      notes: clientFile.notes,

    });

    if (!precheck.ok) {

      toast.error(precheck.blockingReason ?? "Stage move is missing required context.");

      return;

    }



    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {

      toast.error("Session expired - cannot move stage");

      return;

    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {

      toast.error("Not logged in — cannot move stage");

      return;

    }



    setStageUpdating(true);

    try {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)

        .select("status, lock_version")

        .eq("id", clientFile.id)

        .single();



      if (fetchErr || !current) {

        toast.error("Stage update failed: Could not fetch current lead state.");

        return;

      }



      const res = await fetch(`/api/leads/${clientFile.id}/stage`, {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

        },

        body: JSON.stringify({

          to: selectedStage,

          lock_version: current.lock_version ?? 0,

          next_action: stageNextAction.trim() || null,

          next_action_due_at: stageNextActionDueAt || null,

        }),

      });



      const data = await res.json().catch(() => ({}));

      if (!res.ok) {

        if (res.status === 409) {

          toast.error("Lead was updated by someone else — refresh and try again");

        } else if (res.status === 422) {

          toast.error(`Invalid stage transition: ${data.detail ?? data.error ?? "not allowed"}`);

        } else {

          toast.error(`Stage update failed: ${data.error ?? `HTTP ${res.status}`}`);

        }

        return;

      }



      if (data.lock_version != null) setStageLockVersion(data.lock_version);
      setStageNextAction("");
      setStageNextActionDueAt("");

      applyLeadPatchFromResponse(data);

      toast.success(`Moved to ${workflowStageLabel(selectedStage)}`);

      onRefresh?.();

    } catch (err) {

      console.error("[MCF] Move stage error:", err);

      toast.error("Stage update failed: Network error");

    } finally {

      setStageUpdating(false);

    }

  }, [applyLeadPatchFromResponse, clientFile, onRefresh, selectedStage, stageNextAction, stageNextActionDueAt, stageLockVersion]);



  const handleQualificationChange = useCallback((patch: Partial<QualificationDraft>) => {

    setQualificationDraft((prev) => ({ ...prev, ...patch }));

  }, []);



  const handleOfferPrepDraftChange = useCallback((patch: Partial<OfferPrepSnapshotDraft>) => {

    setOfferPrepDraft((prev) => ({ ...prev, ...patch }));

  }, []);



  const handleOfferStatusDraftChange = useCallback((patch: Partial<OfferStatusSnapshotDraft>) => {

    setOfferStatusDraft((prev) => ({ ...prev, ...patch }));

  }, []);



  const handleBuyerDispoTruthDraftChange = useCallback((patch: Partial<BuyerDispoTruthDraft>) => {

    setBuyerDispoTruthDraft((prev) => ({ ...prev, ...patch }));

  }, []);



  const handleMilestoneDraftChange = useCallback((patch: Partial<MilestoneDraft>) => {

    setMilestoneDraft((prev) => ({ ...prev, ...patch }));

  }, []);



  const handleSaveMilestones = useCallback(async () => {

    if (!clientFile?.id) return;

    setMilestoneSaving(true);

    try {

      const appointmentAt = fromLocalDateTimeInput(milestoneDraft.appointmentAt);

      const contractAt = fromLocalDateTimeInput(milestoneDraft.contractAt);

      const offerAmount = parseDraftCurrency(milestoneDraft.offerAmount);

      const assignmentFeeProjected = parseDraftCurrency(milestoneDraft.assignmentFeeProjected);



      // 1. Update Lead Record

      const { error: updateErr } = await (supabase.from("leads") as any)

        .update({

          appointment_at: appointmentAt,

          offer_amount: offerAmount,

          contract_at: contractAt,

          assignment_fee_projected: assignmentFeeProjected,

          lock_version: clientFile.lockVersion ? clientFile.lockVersion + 1 : 1

        })

        .eq("id", clientFile.id);



      if (updateErr) throw updateErr;



      // 2. Audit Trail

      await (supabase.from("event_log") as any).insert({

        user_id: currentUserId,

        action: "MILESTONES_UPDATED",

        entity_type: "lead",

        entity_id: clientFile.id,

        details: {

          appointment_at: appointmentAt,

          offer_amount: offerAmount,

          contract_at: contractAt,

          assignment_fee_projected: assignmentFeeProjected

        }

      });



      setMilestoneEditing(false);

      onRefresh?.();

      toast.success("Milestones updated");

    } catch (err: any) {

      console.error("[Milestones] Save failed:", err.message);

      toast.error(`Failed to save milestones: ${err.message}`);

    } finally {

      setMilestoneSaving(false);

    }

  }, [clientFile?.id, clientFile?.lockVersion, milestoneDraft, currentUserId, onRefresh]);



  const handleSaveOfferPrepSnapshot = useCallback(async () => {

    if (!clientFile?.propertyId) return;



    const arvUsed = parseDraftCurrency(offerPrepDraft.arvUsed);

    const rehabEstimate = parseDraftCurrency(offerPrepDraft.rehabEstimate);

    const maoLow = parseDraftCurrency(offerPrepDraft.maoLow);

    const maoHigh = parseDraftCurrency(offerPrepDraft.maoHigh);

    const confidence = offerPrepDraft.confidence || null;

    const sheetUrl = offerPrepDraft.sheetUrl.trim().length > 0 ? offerPrepDraft.sheetUrl.trim() : null;



    if (

      arvUsed == null

      || rehabEstimate == null

      || maoLow == null

      || maoHigh == null

      || !confidence

    ) {

      toast.error("Fill ARV, rehab, MAO low/high, and confidence before saving.");

      return;

    }



    if (maoHigh < maoLow) {

      toast.error("MAO high must be greater than or equal to MAO low.");

      return;

    }



    if (sheetUrl) {

      try {

        // eslint-disable-next-line no-new

        new URL(sheetUrl);

      } catch {

        toast.error("Sheet link must be a valid URL.");

        return;

      }

    }



    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {

      toast.error("Session expired - cannot save offer prep snapshot.");

      return;

    }



    setOfferPrepSaving(true);

    try {

      const nowIso = new Date().toISOString();



      // Phase 2.5 — Build full valuation snapshot via kernel + freeze comps

      const subjectSqft = clientFile.sqft ?? 0;

      const compMetrics: CompMetric[] = selectedComps

        .filter((c) => (c.lastSalePrice ?? c.avm ?? 0) > 0)

        .map((c) => {

          const price = c.lastSalePrice ?? c.avm ?? 0;

          const ppsf = c.sqft && c.sqft > 0 ? price / c.sqft : null;

          return { price, sqft: c.sqft ?? 0, ppsf };

        });



      const arvRange = calculateARVRange(compMetrics, subjectSqft, conditionAdj);

      const arvConf = calculateArvConfidence(arvRange.compCount, arvRange.spreadPct);

      const arvSourceDerived: "comps" | "avm" | "manual" = arvRange.compCount > 0 ? "comps" : "avm";



      const underwrite = calculateWholesaleUnderwrite({

        arv: arvUsed,

        arvSource: arvSourceDerived,

        rehabEstimate,

      });



      const warnings = buildValuationWarnings({

        arv: arvUsed,

        arvSource: arvSourceDerived,

        compCount: arvRange.compCount,

        confidence: arvConf.confidence,

        spreadPct: arvRange.spreadPct,

        mao: underwrite.mao,

        rehabEstimate,

        conditionLevel: clientFile.conditionLevel ?? null,

      });



      const valuationSnapshot = buildValuationSnapshot({

        arvRange,

        arvUsed: arvUsed,

        arvSource: arvSourceDerived,

        conditionLevel: clientFile.conditionLevel ?? null,

        conditionAdjPct: conditionAdj,

        confidence: arvConf,

        rehabEstimate,

        underwrite,

        quickScreen: null,

        warnings,

        calculatedBy: currentUserName ?? currentUserId ?? null,

      });



      // Freeze selected comps at save time (immutable record of what was used)

      const frozenComps = selectedComps.map((c) => ({

        apn: c.apn,

        address: c.address,

        lastSalePrice: c.lastSalePrice ?? null,

        lastSaleDate: c.lastSaleDate ?? null,

        sqft: c.sqft ?? null,

        avm: c.avm ?? null,

        beds: c.beds ?? null,

        baths: c.baths ?? null,

        yearBuilt: c.yearBuilt ?? null,

        ppsf: c.sqft && c.sqft > 0 && (c.lastSalePrice ?? c.avm ?? 0) > 0

          ? Math.round(((c.lastSalePrice ?? c.avm ?? 0) / c.sqft) * 100) / 100

          : null,

      }));



      const payload = {

        property_id: clientFile.propertyId,

        lead_id: clientFile.id,

        fields: {

          owner_flags: {

            offer_prep_snapshot: {

              arv_used: arvUsed,

              rehab_estimate: rehabEstimate,

              mao_low: maoLow,

              mao_high: maoHigh,

              confidence,

              sheet_url: sheetUrl,

              updated_at: nowIso,

              updated_by: currentUserName ?? currentUserId ?? null,

              // Phase 2.5 — full valuation packet

              formula_version: FORMULA_VERSION,

              formula_mode: valuationSnapshot.formulaMode,

              arv_low: arvRange.arvLow || null,

              arv_base: arvRange.arvBase || null,

              arv_high: arvRange.arvHigh || null,

              arv_source: arvSourceDerived,

              condition_adj_pct: conditionAdj,

              condition_level: clientFile.conditionLevel ?? null,

              avg_ppsf: arvRange.avgPpsf,

              comp_count: arvRange.compCount,

              spread_pct: arvRange.spreadPct,

              offer_percentage: underwrite.offerPercentage,

              assignment_fee_target: underwrite.assignmentFeeTarget,

              holding_costs: underwrite.holdingCosts,

              closing_costs: underwrite.closingCosts,

              mao_result: underwrite.mao,

              warnings: warnings.map((w) => ({ code: w.code, severity: w.severity, message: w.message })),

              frozen_comps: frozenComps,

              frozen_at: nowIso,

            },

          },

        },

      };



      const res = await fetch("/api/properties/update", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

        },

        body: JSON.stringify(payload),

      });



      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error || !data.success) {

        toast.error(`Could not save offer prep snapshot: ${data.detail ?? data.error ?? `HTTP ${res.status}`}`);

        return;

      }



      applyOwnerFlagsOverride(data);



      setOfferPrepEditing(false);

      toast.success("Offer prep snapshot saved");

      onRefresh?.();

    } catch (err) {

      console.error("[MCF] Offer prep save error:", err);

      toast.error("Could not save offer prep snapshot");

    } finally {

      setOfferPrepSaving(false);

    }

  }, [applyOwnerFlagsOverride, clientFile?.id, clientFile?.propertyId, clientFile?.sqft, clientFile?.conditionLevel, currentUserId, currentUserName, offerPrepDraft, onRefresh, selectedComps, conditionAdj]);



  const handleSaveOfferStatusSnapshot = useCallback(async () => {

    if (!clientFile?.propertyId) return;



    const amount = parseDraftCurrency(offerStatusDraft.amount);

    const amountLow = parseDraftCurrency(offerStatusDraft.amountLow);

    const amountHigh = parseDraftCurrency(offerStatusDraft.amountHigh);

    const sellerResponseNote = offerStatusDraft.sellerResponseNote.trim().length > 0

      ? offerStatusDraft.sellerResponseNote.trim()

      : null;

    const status = offerStatusDraft.status || null;



    if (amountLow != null && amountHigh != null && amountHigh < amountLow) {

      toast.error("Offer range high must be greater than or equal to offer range low.");

      return;

    }



    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {

      toast.error("Session expired - cannot save offer status.");

      return;

    }



    setOfferStatusSaving(true);

    try {

      const nowIso = new Date().toISOString();

      const payload = {

        property_id: clientFile.propertyId,

        lead_id: clientFile.id,

        fields: {

          owner_flags: {

            offer_status_snapshot: {

              status,

              amount,

              amount_low: amountLow,

              amount_high: amountHigh,

              seller_response_note: sellerResponseNote,

              updated_at: nowIso,

              updated_by: currentUserName ?? currentUserId ?? null,

            },

          },

        },

      };



      const res = await fetch("/api/properties/update", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

        },

        body: JSON.stringify(payload),

      });



      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error || !data.success) {

        toast.error(`Could not save offer status: ${data.detail ?? data.error ?? `HTTP ${res.status}`}`);

        return;

      }



      const updatedOwnerFlags = applyOwnerFlagsOverride(data);

      if (updatedOwnerFlags) {

        setOfferStatusDraft(getOfferStatusDraft({ ...clientFile, ownerFlags: updatedOwnerFlags }));

      }



      setOfferStatusEditing(false);

      toast.success("Offer status saved");

      onRefresh?.();

    } catch (err) {

      console.error("[MCF] Offer status save error:", err);

      toast.error("Could not save offer status");

    } finally {

      setOfferStatusSaving(false);

    }

    // clientFile is read inside for the spread merge but deps are intentionally

    // granular (id/propertyId) to avoid re-creating the callback on every patch.

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [applyOwnerFlagsOverride, clientFile?.id, clientFile?.propertyId, currentUserId, currentUserName, offerStatusDraft, onRefresh]);



  const handleSaveBuyerDispoTruthSnapshot = useCallback(async () => {

    if (!clientFile?.propertyId) return;



    const buyerFit = buyerDispoTruthDraft.buyerFit || null;

    const dispoStatus = buyerDispoTruthDraft.dispoStatus || null;

    const nextStep = buyerDispoTruthDraft.nextStep.trim().length > 0

      ? buyerDispoTruthDraft.nextStep.trim()

      : null;

    const dispoNote = buyerDispoTruthDraft.dispoNote.trim().length > 0

      ? buyerDispoTruthDraft.dispoNote.trim()

      : null;



    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {

      toast.error("Session expired - cannot save buyer/dispo truth.");

      return;

    }



    setBuyerDispoTruthSaving(true);

    try {

      const nowIso = new Date().toISOString();

      const payload = {

        property_id: clientFile.propertyId,

        lead_id: clientFile.id,

        fields: {

          owner_flags: {

            buyer_dispo_snapshot: {

              buyer_fit: buyerFit,

              dispo_status: dispoStatus,

              next_step: nextStep,

              dispo_note: dispoNote,

              updated_at: nowIso,

              updated_by: currentUserName ?? currentUserId ?? null,

            },

          },

        },

      };



      const res = await fetch("/api/properties/update", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

        },

        body: JSON.stringify(payload),

      });



      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error || !data.success) {

        toast.error(`Could not save buyer/dispo truth: ${data.detail ?? data.error ?? `HTTP ${res.status}`}`);

        return;

      }



      const updatedOwnerFlags = applyOwnerFlagsOverride(data);

      if (updatedOwnerFlags) {

        setBuyerDispoTruthDraft(getBuyerDispoTruthDraft({ ...clientFile, ownerFlags: updatedOwnerFlags }));

      }



      setBuyerDispoTruthEditing(false);

      toast.success("Buyer/dispo truth saved");

      onRefresh?.();

    } catch (err) {

      console.error("[MCF] Buyer/dispo truth save error:", err);

      toast.error("Could not save buyer/dispo truth");

    } finally {

      setBuyerDispoTruthSaving(false);

    }

  }, [applyOwnerFlagsOverride, buyerDispoTruthDraft, clientFile, currentUserId, currentUserName, onRefresh]);



  const persistQualification = useCallback(async (routeOverride?: QualificationRoute): Promise<boolean> => {

    if (!clientFile) return false;



    const nextDraft: QualificationDraft = routeOverride

      ? { ...qualificationDraft, qualificationRoute: routeOverride }

      : qualificationDraft;



    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {

      toast.error("Session expired - cannot save qualification");

      return false;

    }



    setQualificationSaving(true);

    try {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)

        .select("lock_version")

        .eq("id", clientFile.id)

        .single();



      if (fetchErr || !current) {

        toast.error("Could not load current lead state. Refresh and try again.");

        return false;

      }



      const res = await fetch("/api/prospects", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

          "x-lock-version": String(current.lock_version ?? 0),

        },

        body: JSON.stringify({

          lead_id: clientFile.id,

          motivation_level: nextDraft.motivationLevel,

          seller_timeline: nextDraft.sellerTimeline,

          condition_level: nextDraft.conditionLevel,

          decision_maker_confirmed: nextDraft.decisionMakerConfirmed,

          price_expectation: nextDraft.priceExpectation,

          qualification_route: nextDraft.qualificationRoute,

          occupancy_score: nextDraft.occupancyScore,

          equity_flexibility_score: nextDraft.equityFlexibilityScore,

        }),

      });



      const data = await res.json().catch(() => ({}));

      if (!res.ok) {

        if (nextDraft.qualificationRoute === "escalate") {

          toast.error(`Escalation review failed: ${data.detail ?? data.error ?? `HTTP ${res.status}`}`);

        } else {

          toast.error(`Could not save qualification: ${data.detail ?? data.error ?? `HTTP ${res.status}`}`);

        }

        return false;

      }



      applyLeadPatchFromResponse(data);

      setQualificationSuggestedRoute(parseSuggestedRoute(data.suggested_route));

      setQualificationDraft(nextDraft);

      toast.success(nextDraft.qualificationRoute === "escalate" ? "Escalation review saved" : "Qualification updated");

      onRefresh?.();

      return true;

    } catch (err) {

      console.error("[MCF] Qualification save error:", err);

      toast.error("Could not save qualification");

      return false;

    } finally {

      setQualificationSaving(false);

    }

  }, [applyLeadPatchFromResponse, clientFile, onRefresh, qualificationDraft]);



  const handleQualificationRouteSelect = useCallback((route: QualificationRoute) => {

    if (route === "escalate" && !clientFile?.assignedTo) {

      toast.error("Assign this lead before escalating for Adam review.");

      return;

    }

    const previousRoute = qualificationDraft.qualificationRoute ?? null;

    setQualificationDraft((prev) => ({ ...prev, qualificationRoute: route }));

    void (async () => {

      const saved = await persistQualification(route);

      if (!saved) {

        setQualificationDraft((prev) => ({ ...prev, qualificationRoute: previousRoute }));

        if (route === "escalate") {

          toast.error("Escalation review failed and was not saved.");

        }

      }

    })();

  }, [clientFile?.assignedTo, persistQualification, qualificationDraft.qualificationRoute]);



  const handleSetNextAction = useCallback(async () => {

    if (!clientFile) return;

    const nextIso = nextActionAt.trim() ? fromLocalDateTimeInput(nextActionAt) : null;

    if (nextActionAt.trim() && !nextIso) {

      toast.error("Enter a valid callback date and time.");

      return;

    }



    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {

      toast.error("Session expired - cannot set next action");

      return;

    }



    setSettingNextAction(true);

    try {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)

        .select("lock_version")

        .eq("id", clientFile.id)

        .single();



      if (fetchErr || !current) {

        toast.error("Could not load current lead state. Refresh and try again.");

        return;

      }



      const res = await fetch("/api/prospects", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

          "x-lock-version": String(current.lock_version ?? 0),

        },

        body: JSON.stringify({

          lead_id: clientFile.id,

          next_call_scheduled_at: nextIso,

          next_follow_up_at: nextIso,

        }),

      });



      const data = await res.json().catch(() => ({}));

      if (!res.ok) {

        toast.error(`Could not save next action: ${data.error ?? `HTTP ${res.status}`}`);

        return;

      }



      applyLeadPatchFromResponse(data);

      toast.success(nextIso ? "Next action updated" : "Next action cleared");

      setNextActionEditorOpen(false);

      onRefresh?.();

    } catch (err) {

      console.error("[MCF] Set next action error:", err);

      toast.error("Could not save next action");

    } finally {

      setSettingNextAction(false);

    }

  }, [applyLeadPatchFromResponse, clientFile, nextActionAt, onRefresh]);



  const handleAppendNote = useCallback(async () => {

    if (!clientFile) return;

    const note = noteDraft.trim();

    if (!note) {

      toast.message("Enter a note before saving.");

      return;

    }



    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token || !session.user?.id) {

      toast.error("Session expired - cannot save note");

      return;

    }



    setSavingNote(true);

    try {

      // Write note as a calls_log entry so it appears in the unified activity timeline

      // alongside call notes, stage changes, and system events — one timeline, not two.

      const now = new Date().toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const { error: insertErr } = await (supabase.from("calls_log") as any).insert({

        lead_id: clientFile.id,

        property_id: clientFile.propertyId ?? null,

        user_id: session.user.id,

        disposition: "operator_note",

        notes: note,

        started_at: now,

        ended_at: now,

        duration_sec: 0,

        direction: "note",

        source: "mcf",

      });



      if (insertErr) {

        console.error("[MCF] Note insert error:", insertErr);

        toast.error(`Could not save note: ${insertErr.message}`);

        return;

      }



      toast.success("Note added");

      setNoteDraft("");

      setNoteEditorOpen(false);

      setActivityRefreshToken((v) => v + 1);

      onRefresh?.();

    } catch (err) {

      console.error("[MCF] Append note error:", err);

      toast.error("Could not save note");

    } finally {

      setSavingNote(false);

    }

  }, [clientFile, noteDraft, onRefresh]);



  const handleCloseoutPresetSelect = useCallback((presetId: CloseoutPresetId) => {

    const preset = CLOSEOUT_PRESETS.find((item) => item.id === presetId);

    if (!preset) return;

    setCloseoutPresetTouched(true);

    setCloseoutPreset(preset.id);

    setCloseoutAction(preset.action);

    if (preset.daysFromNow != null) {

      setCloseoutAt(presetDateTimeLocal(preset.daysFromNow));

    }

  }, []);



  const handleSaveCallCloseout = useCallback(async () => {

    if (!clientFile) return;



    const nextIso = closeoutAt.trim() ? fromLocalDateTimeInput(closeoutAt) : null;

    if (closeoutAt.trim() && !nextIso) {

      toast.error("Enter a valid follow-up date and time.");

      return;

    }



    if (closeoutAction !== "escalation_review" && !nextIso) {

      toast.error("Select a follow-up date for this closeout.");

      return;

    }



    const routeToApply = routeForCloseoutAction(closeoutAction);

    const existingNextIso = clientFile.nextCallScheduledAt ?? clientFile.nextActionDueAt ?? clientFile.followUpDate ?? null;

    const explicitDueIntent = closeoutPresetTouched || closeoutDateTouched;

    const normalizedOutcome = closeoutOutcome.trim() || null;

    const outcomeChanged = normalizedOutcome !== (clientFile.dispositionCode ?? null);

    const nextChanged = nextIso !== existingNextIso;

    const noteText = closeoutNote.trim();

    const routeChanged = routeToApply != null && routeToApply !== (clientFile.qualificationRoute ?? null);

    const shouldSendDueDates = explicitDueIntent && nextChanged;



    const hasNextActionWrite = closeoutNextActionText(closeoutAction) != null;

    if (!outcomeChanged && !shouldSendDueDates && noteText.length === 0 && !routeChanged && !hasNextActionWrite) {

      toast.message("No closeout changes to save.");

      return;

    }



    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {

      toast.error("Session expired - cannot save closeout");

      return;

    }



    setCloseoutSaving(true);

    try {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)

        .select("lock_version")

        .eq("id", clientFile.id)

        .single();



      if (fetchErr || !current) {

        toast.error("Could not load current lead state. Refresh and try again.");

        return;

      }



      const payload: Record<string, unknown> = { lead_id: clientFile.id };

      if (outcomeChanged) {

        payload.disposition_code = normalizedOutcome;

      }

      if (noteText.length > 0) {

        payload.note_append = noteText;

      }

      if (shouldSendDueDates) {

        payload.next_call_scheduled_at = nextIso;

        payload.next_follow_up_at = nextIso;

      }

      if (routeChanged && routeToApply) {

        payload.qualification_route = routeToApply;

      }

      const nextActionText = closeoutNextActionText(closeoutAction);

      if (nextActionText) {

        payload.next_action = nextActionText;

        if (nextIso) payload.next_action_due_at = nextIso;

      }



      const res = await fetch("/api/prospects", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

          "x-lock-version": String(current.lock_version ?? 0),

        },

        body: JSON.stringify(payload),

      });



      const data = await res.json().catch(() => ({}));

      if (!res.ok) {

        if (res.status === 409) {

          toast.error("Closeout conflict: refresh and try again.");

        } else {

          toast.error(`Could not save closeout: ${data.detail ?? data.error ?? `HTTP ${res.status}`}`);

        }

        return;

      }



      applyLeadPatchFromResponse(data);

      setQualificationSuggestedRoute(parseSuggestedRoute(data.suggested_route));

      setCloseoutNote("");

      setCloseoutOpen(false);

      setCloseoutPresetTouched(false);

      setCloseoutDateTouched(false);

      setNextActionAt(toLocalDateTimeInput(nextIso));

      setActivityRefreshToken((v) => v + 1);

      const presetObj = CLOSEOUT_PRESETS.find((p) => p.id === closeoutPreset);
      toast.success(presetObj ? `Saved \u2014 ${presetObj.label}` : "Saved");

      onRefresh?.();

    } catch (err) {

      console.error("[MCF] Call closeout save error:", err);

      toast.error("Could not save call closeout");

    } finally {

      setCloseoutSaving(false);

    }

  }, [

    applyLeadPatchFromResponse,

    clientFile,

    closeoutAction,

    closeoutAt,

    closeoutDateTouched,

    closeoutNote,

    closeoutOutcome,

    closeoutPreset,

    closeoutPresetTouched,

    onRefresh,

  ]);



  // ── Active task fetch ─────────────────────────────────────────────
  const fetchActiveTask = useCallback(async () => {
    if (!clientFile?.id) return;
    setActiveTaskLoading(true);
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const hdrs: Record<string, string> = sess?.access_token
        ? { Authorization: `Bearer ${sess.access_token}` }
        : {};
      const res = await fetch(
        `/api/tasks?lead_id=${clientFile.id}&status=pending&view=all`,
        { headers: hdrs },
      );
      if (res.ok) {
        const json = await res.json();
        setActiveTask(json.tasks?.[0] ?? null);
      }
    } catch { /* non-fatal */ } finally {
      setActiveTaskLoading(false);
    }
  }, [clientFile?.id]);

  useEffect(() => { fetchActiveTask(); }, [fetchActiveTask]);

  const fetchJeffInteractions = useCallback(async () => {
    if (!clientFile?.id) return;
    setJeffInteractionsLoading(true);
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const hdrs: Record<string, string> = sess?.access_token
        ? { Authorization: `Bearer ${sess.access_token}` }
        : {};
      const res = await fetch(
        `/api/voice/jeff/interactions?leadId=${clientFile.id}&limit=3`,
        { headers: hdrs },
      );
      if (res.ok) {
        const json = await res.json();
        setJeffInteractions(json.interactions ?? []);
      }
    } catch {
      setJeffInteractions([]);
    } finally {
      setJeffInteractionsLoading(false);
    }
  }, [clientFile?.id]);

  useEffect(() => { fetchJeffInteractions(); }, [fetchJeffInteractions]);

  const handleTaskSave = useCallback(async (result: QuickTaskResult) => {
    if (!clientFile?.id) return;
    setTaskSaving(true);
    try {
      await createTaskApi({
        title: result.title,
        lead_id: clientFile.id,
        due_at: result.dueAt,
        task_type: result.taskType,
        notes: result.notes || undefined,
        priority: 2,
      } as Partial<TaskItem>);
      toast.success("Task set");
      setTaskPanelOpen(false);
      fetchActiveTask();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setTaskSaving(false);
    }
  }, [clientFile?.id, fetchActiveTask]);

  const handleTaskComplete = useCallback(async () => {
    if (!activeTask) return;
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const hdrs: Record<string, string> = sess?.access_token
        ? { Authorization: `Bearer ${sess.access_token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" };
      await fetch(`/api/tasks/${activeTask.id}`, {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({ status: "completed" }),
      });
      toast.success("Task completed");
      setActiveTask(null);
      fetchActiveTask();
    } catch {
      toast.error("Failed to complete task");
    }
  }, [activeTask, fetchActiveTask]);

  const handleTaskDelete = useCallback(async () => {
    if (!activeTask) return;
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const hdrs: Record<string, string> = sess?.access_token
        ? { Authorization: `Bearer ${sess.access_token}` }
        : {};
      await fetch(`/api/tasks/${activeTask.id}`, {
        method: "DELETE",
        headers: hdrs,
      });
      toast.success("Task deleted");
      setActiveTask(null);
      fetchActiveTask();
    } catch {
      toast.error("Failed to delete task");
    }
  }, [activeTask, fetchActiveTask]);

  const handleJeffInteractionStatus = useCallback(async (interactionId: string, status: "reviewed" | "resolved") => {
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const hdrs: Record<string, string> = sess?.access_token
        ? { Authorization: `Bearer ${sess.access_token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" };
      await fetch("/api/voice/jeff/interactions", {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({ id: interactionId, status }),
      });
      fetchJeffInteractions();
      toast.success(status === "resolved" ? "Jeff follow-up resolved" : "Jeff follow-up reviewed");
    } catch {
      toast.error("Failed to update Jeff follow-up");
    }
  }, [fetchJeffInteractions]);

  const handleDial = useCallback((phoneNumber?: string) => {

    const numberToDial = phoneNumber || displayPhone;

    if (!numberToDial) return;

    const digits = numberToDial.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);

    startCall(digits, clientFile?.id, clientFile?.ownerName);

  }, [displayPhone, startCall, clientFile]);




  const handleSendSms = useCallback(async (phoneNumber?: string) => {

    const numberToSms = phoneNumber || displayPhone;

    if (!clientFile || !numberToSms) return;

    // If called from dialer card without a message, open SMS panel with the phone pre-set

    if (!smsMessage.trim() && !phoneNumber) return;

    if (phoneNumber && !smsMessage.trim()) {

      setSmsPhone(numberToSms);

      setSmsOpen(true);

      return;

    }

    setSmsSending(true);

    try {

      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/dialer/sms", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),

        },

        body: JSON.stringify({

          phone: smsPhone || numberToSms,

          message: smsMessage.trim(),

          leadId: clientFile.id,

          propertyId: clientFile.propertyId,

        }),

      });

      const data = await res.json();

      if (res.ok) {

        toast.success("SMS sent successfully");

        setSmsMessage("");

        setSmsOpen(false);

        setSmsPhone(null);

      } else {

        toast.error(data.error ?? "SMS failed");

      }

    } catch {

      toast.error("Network error — SMS failed");

    } finally {

      setSmsSending(false);

    }

  }, [clientFile, displayPhone, smsMessage, smsPhone]);



  const handleAddComp = useCallback((comp: CompProperty) => {

    setSelectedComps((prev) => prev.some((c) => c.apn === comp.apn) ? prev : [...prev, comp]);

  }, []);



  const handleRemoveComp = useCallback((apn: string) => {

    setSelectedComps((prev) => prev.filter((c) => c.apn !== apn));

  }, []);



  const handleArvChange = useCallback(async (arv: number) => {

    setComputedArv(arv);

    if (!clientFile?.propertyId || arv <= 0) return;

    try {

      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) return;



      const res = await fetch("/api/properties/update", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

        },

        body: JSON.stringify({

          property_id: clientFile.propertyId,

          lead_id: clientFile.id,

          fields: {

            owner_flags: {

              comp_arv: arv,

              comp_arv_updated_at: new Date().toISOString(),

              comp_count: selectedComps.length,

              comp_addresses: selectedComps.map((c) => c.address).slice(0, 5),

            },

          },

        }),

      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error || !data.success) {

        throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);

      }

    } catch (err) {

      toast.error("ARV save failed. Your changes were not persisted.");

    }

  }, [clientFile?.id, clientFile?.propertyId, selectedComps]);



  const executeSkipTrace = useCallback(async (manual: boolean) => {

    if (!clientFile) return;

    setSkipTracing(true);

    setSkipTraceResult(null);

    setSkipTraceMs(null);

    setSkipTraceError(null);

    const t0 = performance.now();



    try {

      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {

        setSkipTraceResult("Session expired - please sign in again");

        return;

      }

      const res = await fetch("/api/prospects/skip-trace", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

        },

        body: JSON.stringify({ property_id: clientFile.propertyId, lead_id: clientFile.id, manual }),

      });

      const tApi = performance.now();

      const data = await res.json();



      if (data.success) {

        setOverlay({

          phones: data.phones ?? [], emails: data.emails ?? [],

          persons: data.persons ?? [], primaryPhone: data.primary_phone ?? null,

          primaryEmail: data.primary_email ?? null,

          phoneDetails: data.phone_details ?? [],

          emailDetails: data.email_details ?? [],

          providers: data.providers ?? [],

          isLitigator: data.is_litigator ?? false,

          hasDncNumbers: data.has_dnc_numbers ?? false,

        });

        const total = Math.round(performance.now() - t0);

        setSkipTraceMs(total);

        const parts = [];

        if (data.phones?.length) parts.push(`${data.phones.length} phone(s)`);

        if (data.emails?.length) parts.push(`${data.emails.length} email(s)`);

        if (data.persons?.length) parts.push(`${data.persons.length} person(s)`);

        setSkipTraceResult(parts.length > 0 ? `Found ${parts.join(", ")}` : "Complete — no contact info found");

        console.log(`[SkipTrace Perf] Total: ${total}ms | API: ${Math.round(tApi - t0)}ms`);

        onRefresh?.();

      } else {

        setSkipTraceMs(Math.round(performance.now() - t0));

        if (data.reason || data.suggestion || data.address_issues) {

          setSkipTraceError({

            error: data.error ?? "Skip trace failed",

            reason: data.reason,

            suggestion: data.suggestion,

            tier_reached: data.tier_reached,

            address_issues: data.address_issues,

          });

        } else {

          setSkipTraceResult(data.error ?? "Skip trace failed");

        }

      }

    } catch (err) {

      setSkipTraceResult(err instanceof Error ? err.message : "Network error");

      setSkipTraceMs(Math.round(performance.now() - t0));

    } finally {

      setSkipTracing(false);

    }

  }, [clientFile, onRefresh]);



  const handleSkipTrace = useCallback(() => executeSkipTrace(false), [executeSkipTrace]);

  const handleManualSkipTrace = useCallback(() => executeSkipTrace(true), [executeSkipTrace]);



  // —— Deep Crawl handler ——

  const executeDeepCrawl = useCallback(async () => {

    if (!clientFile) return;

    setDeepCrawling(true);

    setCrawlSteps([]);

    setDeepCrawlExpanded(true); // Show progress immediately

    try {

      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {

        toast.error("Session expired - please sign in again.");

        return;

      }

      const res = await fetch("/api/prospects/deep-crawl", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

        },

        body: JSON.stringify({ property_id: clientFile.propertyId, lead_id: clientFile.id }),

      });



      // Check if this is an SSE stream or regular JSON (cached responses are still JSON)

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") && res.body) {

        // SSE streaming mode — read events as they arrive

        const reader = res.body.getReader();

        const decoder = new TextDecoder();

        let buffer = "";



        while (true) {

          const { done, value } = await reader.read();

          if (done) break;



          buffer += decoder.decode(value, { stream: true });



          // Parse SSE events from buffer

          const lines = buffer.split("\n\n");

          buffer = lines.pop() ?? ""; // Keep incomplete chunk



          for (const line of lines) {

            const dataLine = line.trim();

            if (!dataLine.startsWith("data: ")) continue;

            try {

              const event = JSON.parse(dataLine.slice(6));



              if (event.phase === "complete" && event.result) {

                // Final event — the full result

                setDeepCrawlResult(event.result);

                setHasSavedReport(true);

                // deepSkip is sent as a sibling field (not nested inside result)

                const ds = event.deepSkip ?? event.result.deepSkip;

                if (ds) {

                  setDeepSkipResult(ds);

                  // Immediately inject new phones/emails into overlay so Contact tab updates

                  // without waiting for full parent re-fetch

                  if (ds.newPhones?.length > 0 || ds.newEmails?.length > 0) {

                    setOverlay(prev => {

                      const base = prev ?? { phones: [], emails: [], persons: [], primaryPhone: null, primaryEmail: null, phoneDetails: [], emailDetails: [], providers: [], isLitigator: false, hasDncNumbers: false };

                      const existingNums = new Set(base.phoneDetails.map((p: PhoneDetail) => p.number.replace(/\D/g, "").slice(-10)));

                      const existingEmails = new Set(base.emailDetails.map((e: EmailDetail) => e.email.toLowerCase()));

                      const addedPhones: PhoneDetail[] = (ds.newPhones ?? [])

                        .filter((np: { number: string }) => !existingNums.has(np.number.replace(/\D/g, "").slice(-10)))

                        .map((np: { number: string; source: string }) => ({

                          number: np.number,

                          lineType: "unknown" as const,

                          confidence: 60,

                          dnc: false,

                          source: `openclaw_${np.source}`,

                        }));

                      const addedEmails: EmailDetail[] = (ds.newEmails ?? [])

                        .filter((ne: { email: string }) => !existingEmails.has(ne.email.toLowerCase()))

                        .map((ne: { email: string; source: string }) => ({

                          email: ne.email,

                          deliverable: true,

                          source: `openclaw_${ne.source}`,

                        }));

                      return {

                        ...base,

                        phoneDetails: [...base.phoneDetails, ...addedPhones],

                        emailDetails: [...base.emailDetails, ...addedEmails],

                        phones: [...base.phones, ...addedPhones.map(p => p.number)],

                        emails: [...base.emails, ...addedEmails.map(e => e.email)],

                      };

                    });

                  }

                }

                toast.success(`Deep Crawl complete — ${event.result.sources?.join(", ") ?? "done"}`);

                // Also re-fetch from parent to get full updated data

                onRefresh?.();

              } else if (event.phase === "error") {

                toast.error(`Deep Crawl failed: ${event.detail}`);

              } else if (event.phase && event.status) {

                // Progress event

                setCrawlSteps(prev => {

                  // Update existing step or add new one

                  const existing = prev.findIndex(s => s.phase === event.phase);

                  if (existing >= 0) {

                    const updated = [...prev];

                    updated[existing] = { phase: event.phase, status: event.status, detail: event.detail, elapsed: event.elapsed };

                    return updated;

                  }

                  return [...prev, { phase: event.phase, status: event.status, detail: event.detail, elapsed: event.elapsed }];

                });

              }

            } catch {

              // Skip malformed events

            }

          }

        }

      } else {

        // Regular JSON response (cached results)

        const data = await res.json();

        if (data.error) {

          toast.error(`Deep Crawl failed: ${data.error}`);

        } else {

          setDeepCrawlResult(data);

          setDeepCrawlExpanded(true);

          setHasSavedReport(true);

          // Backward compat: cached results may still have nested deepSkip

          if (data.deepSkip) setDeepSkipResult(data.deepSkip);

          toast.success(`Deep Crawl complete — ${data.sources?.join(", ") ?? "done"}`);

          onRefresh?.();

        }

      }

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Deep Crawl network error");

    } finally {

      setDeepCrawling(false);

      setCrawlSteps([]);

    }

  }, [clientFile, onRefresh]);



  const handleAutofill = useCallback(async () => {

    if (!clientFile) return;

    setAutofilling(true);

    try {

      const res = await fetch("/api/properties/autofill", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ property_id: clientFile.propertyId }),

      });

      const data = await res.json();



      if (data.success && data.filled?.length > 0) {

        toast.success(`Autofilled: ${data.filled.join(", ")}`);

        onRefresh?.();

      } else if (data.success && data.filled?.length === 0) {

        toast.info("All property details already populated");

      } else {

        // ATTOM failed — offer Zillow link

        const zUrl = data.zillow_url;

        toast.error(

          `${data.error ?? "Autofill failed"}${zUrl ? " — opening Zillow for manual lookup" : ""}`,

          { duration: 6000 },

        );

        if (zUrl) window.open(zUrl, "_blank", "noopener,noreferrer");

      }

    } catch {

      toast.error("Network error during autofill");

    } finally {

      setAutofilling(false);

    }

  }, [clientFile, onRefresh]);

  const handleToggleActive = useCallback(async () => {
    if (!clientFile?.id || activeUpdating) return;

    const nextActive = !clientFile.pinned;
    setActiveUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expired");
        return;
      }

      const res = await fetch(`/api/leads/${clientFile.id}/pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pinned: nextActive }),
      });

      if (!res.ok) {
        toast.error("Failed to update");
        return;
      }

      const data = await res.json().catch(() => null) as {
        pinned?: boolean;
        pinned_at?: string | null;
        pinned_by?: string | null;
      } | null;

      setClientFilePatch((prev) => ({
        ...(prev ?? {}),
        pinned: data?.pinned ?? nextActive,
        pinnedAt: data?.pinned_at ?? null,
        pinnedBy: data?.pinned_by ?? null,
      }));
      toast.success(nextActive ? "Marked Active" : "Removed from Active");
      onRefresh?.();
    } finally {
      setActiveUpdating(false);
    }
  }, [clientFile?.id, clientFile?.pinned, onRefresh, activeUpdating]);

  const handleApplyMove = useCallback(() => {
    if (!clientFile || !moveTarget) return;

    if (moveTarget === "active") {
      if (clientFile.pinned) {
        toast.message("Already Active");
      } else {
        void handleToggleActive();
      }
      setMoveTarget("");
      return;
    }

    if (moveTarget === "drive_by") {
      setCloseoutOpen(true);
      setCloseoutOutcome(clientFile.dispositionCode ?? "");
      setCloseoutNote("");
      setCloseoutAction("drive_by");
      setCloseoutPreset("drive_by_tomorrow");
      setCloseoutAt(
        toLocalDateTimeInput(clientFile.nextActionDueAt ?? clientFile.nextCallScheduledAt ?? clientFile.followUpDate) || presetDateTimeLocal(1),
      );
      setCloseoutPresetTouched(false);
      setCloseoutDateTouched(false);
      setNextActionEditorOpen(false);
      setNoteEditorOpen(false);
      setMoveTarget("");
      return;
    }

    const currentStatus = normalizeWorkflowStage(clientFile.status);
    if (currentStatus === "dead") {
      toast.message("Already Dead");
      setMoveTarget("");
      return;
    }

    const deadTransition = allowedTransitions.find((t) => t.status === "dead");
    if (!deadTransition) {
      toast.error("Cannot move to Dead from current stage");
      setMoveTarget("");
      return;
    }

    setSelectedStage("dead");
    if (deadTransition.requires_next_action && !stageNextAction.trim()) {
      setStageNextAction("Marked dead - no further follow-up");
    }
    setMoveTarget("");
  }, [
    allowedTransitions,
    clientFile,
    handleToggleActive,
    moveTarget,
    stageNextAction,
  ]);

  if (!clientFile) return null;



  const overviewClientFile = clientFile;




  const currentStage = normalizeWorkflowStage(clientFile.status);

  const currentStageLabel = workflowStageLabel(clientFile.status);

  const marketLabel = marketDisplayLabel(clientFile.county);

  const sourceLabel = sourceDisplayLabel(clientFile.source);

  const operatorWf = buildOperatorWorkflowSummary({

    status: clientFile.status,

    qualificationRoute: clientFile.qualificationRoute,

    assignedTo: clientFile.assignedTo,

    nextCallScheduledAt: clientFile.nextCallScheduledAt,

    nextFollowUpAt: clientFile.followUpDate,

    lastContactAt: clientFile.lastContactAt,

    totalCalls: clientFile.totalCalls,

    nextAction: clientFile.nextAction,

    nextActionDueAt: clientFile.nextActionDueAt,

    createdAt: clientFile.promotedAt,

    promotedAt: clientFile.promotedAt,

  });

  const compactPropertyFacts: string[] = [];
  if (clientFile.bedrooms != null || clientFile.bathrooms != null) {
    compactPropertyFacts.push(`${clientFile.bedrooms ?? "?"}/${clientFile.bathrooms ?? "?"} bd/ba`);
  }
  if (clientFile.sqft != null) compactPropertyFacts.push(`${clientFile.sqft.toLocaleString()} sqft`);
  if (clientFile.yearBuilt != null) compactPropertyFacts.push(`Yr ${clientFile.yearBuilt}`);
  if (clientFile.estimatedValue != null) compactPropertyFacts.push(`AVM ${formatCurrency(clientFile.estimatedValue)}`);
  if (clientFile.delinquentAmount != null && clientFile.delinquentAmount > 0) {
    compactPropertyFacts.push(`Tax ${formatCurrency(clientFile.delinquentAmount)}`);
  }
  compactPropertyFacts.splice(4);

  const compactContextTags = (clientFile.tags ?? [])
    .filter((tag) => ["probate", "inherited", "vacant", "tax_lien", "tax_delinquency"].includes(tag))
    .slice(0, 2);

  const qualificationEditable = currentStage === "lead";

  const qualificationDirty =

    (qualificationDraft.motivationLevel ?? null) !== (clientFile.motivationLevel ?? null)

    || (qualificationDraft.sellerTimeline ?? null) !== (clientFile.sellerTimeline ?? null)

    || (qualificationDraft.conditionLevel ?? null) !== (clientFile.conditionLevel ?? null)

    || qualificationDraft.decisionMakerConfirmed !== (clientFile.decisionMakerConfirmed ?? false)

    || (qualificationDraft.priceExpectation ?? null) !== (clientFile.priceExpectation ?? null)

    || (qualificationDraft.qualificationRoute ?? null) !== (clientFile.qualificationRoute ?? null)

    || (qualificationDraft.occupancyScore ?? null) !== (clientFile.occupancyScore ?? null)

    || (qualificationDraft.equityFlexibilityScore ?? null) !== (clientFile.equityFlexibilityScore ?? null);

  const stageChanged = selectedStage !== currentStage;

  const stagePrecheck = precheckWorkflowStageChange({

    currentStatus: currentStage as LeadStatus,

    targetStatus: selectedStage as LeadStatus,

    assignedTo: clientFile.assignedTo,

    lastContactAt: clientFile.lastContactAt,

    totalCalls: clientFile.totalCalls,

    dispositionCode: clientFile.dispositionCode,

    nextCallScheduledAt: clientFile.nextCallScheduledAt,

    nextFollowUpAt: clientFile.followUpDate,

    qualificationRoute: clientFile.qualificationRoute,

    notes: clientFile.notes,

  });

  const canClaimToLead = getAllowedTransitions(currentStage as LeadStatus).includes("lead");

  const isAssignedToCurrentUser = !!currentUserId && clientFile.assignedTo === currentUserId;

  const claimButtonLabel = !clientFile.assignedTo

    ? (canClaimToLead ? "Claim" : "Assign")

    : isAssignedToCurrentUser

      ? "Assigned to You"

      : "Assign to Me";



  return (

    <AnimatePresence>

      {open && (

        <Fragment>

          <motion.div

            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}

            className="fixed inset-0 z-50 modal-backdrop"

            onClick={onClose}

          />

          <motion.div

            initial={{ opacity: 0, scale: 0.95, y: 20 }}

            animate={{ opacity: 1, scale: 1, y: 0 }}

            exit={{ opacity: 0, scale: 0.95, y: 20 }}

            transition={{ type: "spring", damping: 25, stiffness: 300 }}

            className={cn(

              "fixed inset-x-4 top-[4.5%] bottom-[2%] md:inset-x-auto md:-translate-x-1/2 z-50 flex flex-col transition-all duration-300",

              activeTab === "comps" ? "md:w-[1325px]" : activeTab === "dossier" || activeTab === "legal" ? "md:w-[1200px]" : "md:w-[1075px]",

            )}

            style={{
              left: `calc(50% + ${sidebarOffset}px)`,
              maxWidth: `calc(100vw - ${sidebarOpen ? sidebarWidth : 0}px - 2rem)`,
            }}

          >

            <div

              className="flex-1 overflow-hidden rounded-[16px] border border-overlay-8 modal-glass flex flex-row"

              data-operator-safe

            >

            <div className="flex-1 overflow-hidden flex flex-col min-w-0">

              {/* Header — compact */}

              <div className="shrink-0 border-b border-overlay-6 bg-panel-solid backdrop-blur-2xl rounded-t-[16px]">

                <div className="flex items-start justify-between gap-4 px-4 py-2.5">

                  <div className="min-w-0 space-y-1">

                    <div className="flex items-center gap-2 min-w-0">

                      <h2 className="text-lg font-bold truncate" style={{ textShadow: "0 1px 0 var(--overlay-6)" }}>

                        {formatOwnerName(clientFile.ownerName) || "Unknown Seller"}

                      </h2>

                      <RelationshipBadge data={{

                        ownerAgeInference: clientFile.prediction?.ownerAgeInference,

                        lifeEventProbability: clientFile.prediction?.lifeEventProbability,

                        tags: clientFile.tags,

                        bestAddress: clientFile.fullAddress,

                      }} />

                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">

                      <span className="truncate">{clientFile.fullAddress}</span>

                      <span className="shrink-0">·</span>

                      <span className="shrink-0">{marketLabel}</span>

                      <span className="shrink-0">·</span>

                      <Badge variant="outline" className="text-xs gap-1 border-overlay-20 text-foreground shrink-0">
                        <Target className="h-2.5 w-2.5" />{currentStageLabel}
                      </Badge>

                    </div>

                  </div>

                  <div className="flex items-start gap-2 shrink-0">
                    {clientFile.prediction && (

                      <PredictiveDistressBadge data={clientFile.prediction as PredictiveDistressData} size="sm" />

                    )}

                    <CoachToggle className="ml-1" />

                    <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-overlay-4 transition-colors text-muted-foreground hover:text-foreground">

                      <X className="h-4 w-4" />

                    </button>

                  </div>

                </div>

              </div>



              {/* Primary operator actions — single compact row */}

              <div className="shrink-0 px-4 py-2 border-b border-overlay-6 bg-panel-deep">

                <div className="flex flex-wrap items-center gap-1.5">

                  <Button

                    size="sm"

                    className="gap-1.5 h-7 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 shadow-sm"

                    disabled={!displayPhone || calling}

                    onClick={() => handleDial()}

                  >

                    {calling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}

                    {calling ? "Dialing..." : "Call Now"}

                  </Button>

                  <Button

                    size="sm"

                    variant="outline"

                    className="gap-1.5 h-7 border-overlay-15 hover:border-overlay-15 hover:bg-overlay-6"

                    disabled={!displayPhone}

                    onClick={() => setSmsOpen((v) => !v)}

                  >

                    <MessageSquare className="h-3 w-3 text-foreground" />Text

                  </Button>

                  <Button

                    size="sm"

                    variant="outline"

                    className="gap-1.5 h-7 border-overlay-25 hover:border-white/45 hover:bg-overlay-8"

                    onClick={() => {

                      setCloseoutOpen((v) => {

                        const next = !v;

                        if (next) {

                          setCloseoutOutcome(clientFile.dispositionCode ?? "");

                          setCloseoutNote("");

                          setCloseoutAction("follow_up_call");

                          setCloseoutPreset("call_3_days");

                          setCloseoutAt(

                            toLocalDateTimeInput(clientFile.nextCallScheduledAt ?? clientFile.nextActionDueAt ?? clientFile.followUpDate) || presetDateTimeLocal(3),

                          );

                          setCloseoutPresetTouched(false);

                          setCloseoutDateTouched(false);

                        }

                        return next;

                      });

                      setNextActionEditorOpen(false);

                      setNoteEditorOpen(false);

                    }}

                  >

                    <CheckCircle2 className="h-3 w-3 text-foreground" />Log Outcome

                  </Button>
                  <div className="flex items-center gap-1">
                    <select
                      value={moveTarget}
                      onChange={(e) => setMoveTarget(e.target.value as "" | "active" | "drive_by" | "dead")}
                      className="h-7 rounded-md border border-overlay-15 bg-overlay-4 px-2 text-xs text-foreground focus:outline-none focus:border-primary/30"
                      aria-label="Move file"
                    >
                      <option value="">Move…</option>
                      <option value="active">Active</option>
                      <option value="drive_by">Drive By</option>
                      <option value="dead">Dead</option>
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs border-overlay-15"
                      disabled={!moveTarget || stageUpdating || activeUpdating}
                      onClick={handleApplyMove}
                    >
                      Go
                    </Button>
                  </div>

                  <details className="relative ml-auto">
                    <summary className="list-none h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-overlay-15 bg-overlay-4 text-xs text-muted-foreground hover:text-foreground hover:border-overlay-30 cursor-pointer">
                      More
                      <ChevronDown className="h-3 w-3" />
                    </summary>
                    <div className="absolute right-0 top-8 z-20 w-[260px] rounded-[10px] border border-overlay-10 bg-panel p-2.5 shadow-lg space-y-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full justify-start gap-1.5 h-7 border-overlay-6 text-muted-foreground/75 hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                        disabled={claiming}
                        onClick={async () => {
                          try {
                            setClaiming(true);
                            const { data: { session: sess } } = await supabase.auth.getSession();
                            const hdrs: Record<string, string> = sess?.access_token
                              ? { Authorization: `Bearer ${sess.access_token}` }
                              : {};
                            await fetch(`/api/prospects?lead_id=${clientFile.id}`, {
                              method: "PATCH",
                              headers: { ...hdrs, "Content-Type": "application/json" },
                              body: JSON.stringify({ assign_to: currentUserId }),
                            });
                            window.location.href = "/dialer";
                          } catch {
                            setClaiming(false);
                          }
                        }}
                      >
                        <ListPlus className="h-3 w-3" />Queue
                      </Button>

                      {!(isAssignedToCurrentUser && assignmentOptions.length > 0) && !isAssignedToCurrentUser && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-start gap-1.5 h-7 text-xs"
                          disabled={claiming || isAssignedToCurrentUser}
                          onClick={handleClaimLead}
                        >
                          {claiming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
                          {claiming ? "..." : claimButtonLabel}
                        </Button>
                      )}

                      {assignmentOptions.length > 0 && (
                        <div className="flex items-center gap-1 rounded-[6px] border border-overlay-10 bg-overlay-2 px-1 py-1">
                          <select
                            value={reassignTargetId}
                            onChange={(e) => setReassignTargetId(e.target.value)}
                            className="h-6 flex-1 rounded border border-overlay-10 bg-overlay-4 px-1.5 text-xs text-foreground focus:outline-none focus:border-overlay-30"
                            aria-label="Select lead owner"
                          >
                            <option value="">Owner</option>
                            {assignmentOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.name}</option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-1.5 border-overlay-15"
                            disabled={reassigning || !reassignTargetId || reassignTargetId === (clientFile.assignedTo ?? "")}
                            onClick={handleReassignLead}
                          >
                            {reassigning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Go"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </details>

                </div>

                {closeoutOpen && (

                  <div className="mt-2">

                    {closeoutOpen && (

                      <div className="rounded-[10px] border border-overlay-20 bg-overlay-6 p-2.5 space-y-2">

                        <div className="flex items-center justify-between gap-2">

                          <p className="text-sm uppercase tracking-wider font-semibold text-foreground">Log Call Result</p>

                          <span className="text-xs text-foreground/80">{closeoutActionLabel(closeoutAction)}</span>

                        </div>

                        <label className="space-y-1">

                          <span className="text-xs uppercase tracking-wider text-muted-foreground">Call Outcome</span>

                          <select

                            value={closeoutOutcome}

                            onChange={(e) => {
                              const outcome = e.target.value;
                              setCloseoutOutcome(outcome);
                              const defaultPresetId = OUTCOME_PRESET_DEFAULTS[outcome];
                              if (defaultPresetId) handleCloseoutPresetSelect(defaultPresetId);
                            }}

                            className="h-8 w-full rounded-[8px] border border-overlay-12 bg-overlay-4 px-2 text-xs text-foreground focus:outline-none focus:border-overlay-30"

                          >

                            <option value="">No change</option>

                            {closeoutOutcome && !CALL_OUTCOME_OPTIONS.some((opt) => opt.id === closeoutOutcome) && (

                              <option value={closeoutOutcome}>{closeoutOutcome.replace(/_/g, " ")}</option>

                            )}

                            {CALL_OUTCOME_OPTIONS.map((opt) => (

                              <option key={opt.id} value={opt.id}>{opt.label}</option>

                            ))}

                          </select>

                        </label>

                        <div className="space-y-1">

                          <p className="text-xs uppercase tracking-wider text-muted-foreground">Next Step</p>

                          <div className="flex flex-wrap gap-1.5">

                            {CLOSEOUT_PRESETS.map((preset) => (

                              <button

                                key={preset.id}

                                type="button"

                                onClick={() => handleCloseoutPresetSelect(preset.id)}

                                className={cn(

                                  "h-6 px-2 rounded-[7px] border text-sm transition-colors",

                                  closeoutPreset === preset.id

                                    ? "border-overlay-40 text-foreground bg-overlay-12"

                                    : "border-overlay-12 text-muted-foreground hover:text-foreground hover:border-white/[0.24]",

                                )}

                              >

                                {preset.label}

                              </button>

                            ))}

                          </div>


                        </div>

                        <label className="space-y-1 block">

                          <span className="text-xs uppercase tracking-wider text-muted-foreground">Due Date</span>

                          <input

                            type="datetime-local"

                            value={closeoutAt}

                            onChange={(e) => {

                              setCloseoutDateTouched(true);

                              setCloseoutAt(e.target.value);

                            }}

                            className="h-8 w-full rounded-[8px] border border-overlay-12 bg-overlay-4 px-2.5 text-xs text-foreground focus:outline-none focus:border-overlay-30"

                          />

                        </label>

                        <textarea

                          value={closeoutNote}

                          onChange={(e) => setCloseoutNote(e.target.value)}

                          placeholder="Quick call summary note..."

                          className="w-full h-16 rounded-[8px] border border-overlay-12 bg-overlay-4 px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-overlay-30"

                          maxLength={1000}

                        />

                        <div className="flex items-center gap-2">

                          <Button

                            size="sm"

                            className="h-7 text-sm"

                            disabled={closeoutSaving}

                            onClick={handleSaveCallCloseout}

                          >

                            {closeoutSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}

                            Save Closeout

                          </Button>

                          <Button

                            size="sm"

                            variant="ghost"

                            className="h-7 text-sm text-muted-foreground"

                            onClick={() => {

                              setCloseoutOpen(false);

                              setCloseoutOutcome(clientFile.dispositionCode ?? "");

                              setCloseoutNote("");

                              setCloseoutAction("follow_up_call");

                              setCloseoutPreset("call_3_days");

                              setCloseoutAt(

                                toLocalDateTimeInput(clientFile.nextCallScheduledAt ?? clientFile.nextActionDueAt ?? clientFile.followUpDate) || presetDateTimeLocal(3),

                              );

                              setCloseoutPresetTouched(false);

                              setCloseoutDateTouched(false);

                            }}

                          >

                            Cancel

                          </Button>

                          <span className="ml-auto text-xs text-muted-foreground/50">{closeoutNote.length}/1000</span>

                        </div>

                      </div>

                    )}

                  </div>

                )}

              </div>



              {/* Compact status strip */}

              <div className="shrink-0 px-4 py-1.5 border-b border-overlay-6 bg-[rgba(8,10,18,0.55)]">

                <div className="flex items-center gap-x-4 gap-y-1 text-xs flex-wrap">
                  <span className="text-muted-foreground">
                    Stage <span className="text-foreground font-semibold">{currentStageLabel}</span>
                  </span>

                  <span className="text-muted-foreground">
                    Do now{" "}
                    <span
                      className={cn(
                        "font-semibold",
                        operatorWf.urgency === "critical" && "text-red-400",
                        operatorWf.urgency === "high" && "text-amber-300/90",
                        operatorWf.urgency !== "critical" && operatorWf.urgency !== "high" && "text-foreground",
                      )}
                    >
                      {operatorWf.doNow}
                    </span>
                  </span>

                  <span className="text-muted-foreground">
                    Due{" "}
                    <span className={cn(operatorWf.dueOverdue ? "text-amber-300 font-medium" : "text-foreground")}>
                      {operatorWf.dueLabel}
                    </span>
                  </span>

                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    Last touch <span className="text-foreground">{operatorWf.lastTouchLabel}</span>
                    {operatorWf.workedToday && (
                      <span className="rounded px-1 py-0 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20">
                        Today
                      </span>
                    )}
                  </span>

                  {compactPropertyFacts.length > 0 && (
                    <span className="text-muted-foreground/80">
                      {compactPropertyFacts.join(" · ")}
                    </span>
                  )}

                  {compactContextTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-1.5 py-0 rounded border border-overlay-15 bg-overlay-4 text-muted-foreground/85 uppercase tracking-wide text-[10px]"
                    >
                      {tag.replace(/_/g, " ")}
                    </span>
                  ))}

                  {clientFile.nextAction?.toLowerCase().startsWith("drive by") && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/25 font-bold text-xs uppercase tracking-wide">
                      <MapPin className="h-3 w-3" />
                      Drive By
                    </span>
                  )}
                </div>

              </div>



              {/* Stage transition next_action input */}
              {selectedStage !== currentStage && (() => {
                const transition = allowedTransitions.find(t => t.status === selectedStage);
                return transition ? (
                  <div className="shrink-0 px-4 py-2 border-b border-overlay-6 bg-overlay-2 flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-2">
                      <label className="text-xs text-muted-foreground shrink-0">
                        Next action{transition.requires_next_action ? " *" : ""}:
                      </label>
                      <input
                        value={stageNextAction}
                        onChange={(e) => setStageNextAction(e.target.value)}
                        placeholder={transition.requires_next_action ? "Required — what's the next step?" : "Optional next action"}
                        className="flex-1 bg-overlay-4 border border-overlay-10 rounded-md px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
                      />
                      <input
                        type="date"
                        value={stageNextActionDueAt}
                        onChange={(e) => setStageNextActionDueAt(e.target.value)}
                        className="bg-overlay-4 border border-overlay-10 rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/30"
                      />
                    </div>
                    <button
                      onClick={handleMoveStage}
                      disabled={stageUpdating || (transition.requires_next_action && !stageNextAction.trim())}
                      className="h-7 px-3 rounded-md text-xs font-bold bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors disabled:opacity-40"
                    >
                      {stageUpdating ? "Moving..." : `Move to ${workflowStageLabel(selectedStage)}`}
                    </button>
                    <button
                      onClick={() => setSelectedStage(currentStage)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null;
              })()}

              {/* Inline task setter panel */}
              <AnimatePresence>
                {taskPanelOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="shrink-0 overflow-hidden border-b border-overlay-6 bg-overlay-2"
                  >
                    <div className="px-4 py-3">
                      <QuickTaskSetter
                        onSave={handleTaskSave}
                        onCancel={() => setTaskPanelOpen(false)}
                        saving={taskSaving}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tabs */}

              <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-overlay-6 bg-panel overflow-x-auto scrollbar-none">

                {TABS.filter((tab) => PRIMARY_TAB_IDS.has(tab.id)).map((tab) => (

                  <button

                    key={tab.id}

                    onClick={() => setActiveTab(tab.id)}

                    className={cn(

                      "flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-all whitespace-nowrap",

                      activeTab === tab.id

                        ? "text-foreground bg-overlay-8 border border-overlay-15 shadow-[var(--shadow-badge-glow-tight)]"

                        : "text-muted-foreground hover:text-foreground border border-transparent hover:border-glass-border"

                    )}

                  >

                    <tab.icon className="h-3 w-3" />{tab.label}

                  </button>

                ))}



              </div>



              {/* Tab content */}

              <div className="flex-1 overflow-y-auto p-6">

                <AnimatePresence mode="wait">

                  <motion.div

                    key={`${activeTab}-${clientFile.propertyId}`}

                    initial={{ opacity: 0, y: 8 }}

                    animate={{ opacity: 1, y: 0 }}

                    exit={{ opacity: 0, y: -8 }}

                    transition={{ duration: 0.15 }}

                  >

                    {activeTab === "overview" && (
                      <div className="space-y-0">
                        {/* Task tile */}
                        <div className="px-4 pt-3">
                          {activeTaskLoading ? (
                            <div className="rounded-xl border border-overlay-6 bg-overlay-2 p-3 flex items-center gap-2 text-xs text-muted-foreground/50">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading task…
                            </div>
                          ) : activeTask ? (
                            <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-3 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <Pin className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                                  <span className="text-xs font-semibold uppercase tracking-wider text-primary/70">Next Task</span>
                                </div>
                                {activeTask.due_at && (
                                  <span className={`text-[11px] font-medium shrink-0 ${
                                    new Date(activeTask.due_at) < new Date()
                                      ? "text-red-400"
                                      : new Date(activeTask.due_at).toDateString() === new Date().toDateString()
                                        ? "text-amber-400"
                                        : "text-muted-foreground/50"
                                  }`}>
                                    Due: {formatDueDateLabel(activeTask.due_at).text}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-foreground/90 leading-snug">{activeTask.title}</p>
                              {activeTask.notes && (
                                <p className="text-xs text-muted-foreground/50 line-clamp-2">{activeTask.notes}</p>
                              )}
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={handleTaskComplete}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Complete
                                </button>
                                <button
                                  onClick={() => setTaskPanelOpen(true)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground/50 bg-overlay-3 hover:bg-overlay-6 border border-overlay-6 transition-colors"
                                >
                                  <Pencil className="h-3 w-3" /> Edit
                                </button>
                                <button
                                  onClick={handleTaskDelete}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-red-400/60 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" /> Delete
                                </button>
                              </div>
                            </div>
                          ) : !operatorWf.effectiveDueIso && operatorWf.actionable ? (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-400/70" />
                                <span className="text-xs text-amber-400/80 font-medium">No next step scheduled</span>
                              </div>
                              <button
                                onClick={() => {
                                  setCloseoutOpen(true);
                                  setCloseoutOutcome(clientFile.dispositionCode ?? "");
                                  setCloseoutNote("");
                                  setCloseoutAction("follow_up_call");
                                  setCloseoutPreset("call_3_days");
                                  setCloseoutAt(presetDateTimeLocal(3));
                                  setCloseoutPresetTouched(false);
                                  setCloseoutDateTouched(false);
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors"
                              >
                                <Plus className="h-3 w-3" /> Log Outcome
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div className="px-4 pt-3">
                          {jeffInteractionsLoading ? (
                            <div className="rounded-xl border border-overlay-6 bg-overlay-2 p-3 flex items-center gap-2 text-xs text-muted-foreground/50">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Jeff context…
                            </div>
                          ) : jeffInteractions.length > 0 ? (
                            <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <Brain className="h-3.5 w-3.5 text-sky-300 shrink-0" />
                                  <span className="text-xs font-semibold uppercase tracking-wider text-sky-200">Jeff Context</span>
                                </div>
                                <span className="text-[11px] text-sky-100/70">{jeffInteractions[0].status.replace("_", " ")}</span>
                              </div>
                              {jeffInteractions.map((interaction) => (
                                <div key={interaction.id} className="rounded-lg border border-sky-500/10 bg-background/20 p-2.5 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                    <Badge variant="outline">{interaction.direction}</Badge>
                                    <Badge variant="outline">{interaction.interaction_type.replace("_", " ")}</Badge>
                                    {interaction.callback_due_at ? (
                                      <span className="text-amber-300/80">Due {formatDueDateLabel(interaction.callback_due_at).text}</span>
                                    ) : null}
                                    {interaction.transfer_outcome ? (
                                      <span className="text-muted-foreground/60">{interaction.transfer_outcome.replace(/_/g, " ")}</span>
                                    ) : null}
                                  </div>
                                  {interaction.summary ? (
                                    <p className="text-xs text-foreground/85 leading-relaxed">{interaction.summary}</p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground/60">AI-captured Jeff conversation. Review the linked task or recent call context.</p>
                                  )}
                                  {(interaction.caller_phone || interaction.caller_name || interaction.property_address) ? (
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-sky-100/75">
                                      {interaction.caller_phone ? <span>Caller {interaction.caller_phone}</span> : null}
                                      {interaction.caller_name ? <span>Name {interaction.caller_name}</span> : null}
                                      {interaction.property_address ? <span>Property {interaction.property_address}</span> : null}
                                    </div>
                                  ) : null}
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    {interaction.task?.id ? (
                                      <Link
                                        href="/tasks"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors"
                                      >
                                        <Pin className="h-3 w-3" /> Open Task
                                      </Link>
                                    ) : null}
                                    <button
                                      onClick={() => handleDial()}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                                    >
                                      <Phone className="h-3 w-3" /> Call Now
                                    </button>
                                    {interaction.status !== "reviewed" && interaction.status !== "resolved" ? (
                                      <button
                                        onClick={() => handleJeffInteractionStatus(interaction.id, "reviewed")}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 transition-colors"
                                      >
                                        <CheckCircle2 className="h-3 w-3" /> Mark Reviewed
                                      </button>
                                    ) : null}
                                    {interaction.status !== "resolved" && !interaction.task?.id ? (
                                      <button
                                        onClick={() => handleJeffInteractionStatus(interaction.id, "resolved")}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground/70 bg-overlay-3 hover:bg-overlay-6 border border-overlay-6 transition-colors"
                                      >
                                        <CheckCircle className="h-3 w-3" /> Resolve
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <OverviewTab
                          cf={overviewClientFile}
                          computedArv={computedArv}
                          activityRefreshToken={activityRefreshToken}
                          onDial={handleDial}
                          calling={calling}
                        />
                      </div>
                    )}

                    {activeTab === "contact" && (

                      <ContactTab cf={clientFile} overlay={overlay} onSkipTrace={handleSkipTrace} skipTracing={skipTracing} skipTraceResult={skipTraceResult} skipTraceError={skipTraceError} onDial={handleDial} onSms={handleSendSms} calling={calling} onRefresh={onRefresh} />

                    )}

                    {activeTab === "dossier" && (

                      <div className="space-y-6">

                        <IntelligenceSummaryBlock cf={clientFile} />

                        <LeadDossierPanel
                          leadId={clientFile.id}
                          cachedDeepCrawl={(((clientFile.ownerFlags as Record<string, unknown> | undefined)?.deep_crawl)
                            ?? ((clientFile.ownerFlags as Record<string, unknown> | undefined)?.deep_crawl_result)) as DeepCrawlSnapshot | undefined}
                        />

                      </div>

                    )}

                    {activeTab === "comps" && (

                      process.env.NEXT_PUBLIC_BRICKED_ENABLED !== "false" && clientFile.fullAddress ? (

                        <BrickedAnalysisPanel

                          leadId={clientFile.id}

                          address={clientFile.fullAddress}

                          bedrooms={clientFile.bedrooms}

                          bathrooms={clientFile.bathrooms}

                          sqft={clientFile.sqft}

                          yearBuilt={clientFile.yearBuilt}

                          estimatedValue={clientFile.estimatedValue}

                          computedArv={computedArv}

                          cachedBrickedResponse={(clientFile.ownerFlags as Record<string, unknown> | undefined)?.bricked_full_response as BrickedAnalysisPanelProps["cachedBrickedResponse"]}

                          cachedBrickedFetchedAt={(clientFile.ownerFlags as Record<string, unknown> | undefined)?.bricked_fetched_at as string | null}

                          cachedBrickedId={(clientFile.ownerFlags as Record<string, unknown> | undefined)?.bricked_id as string | null}

                          cachedDealConfig={(clientFile.ownerFlags as Record<string, unknown> | undefined)?.deal_config as BrickedAnalysisPanelProps["cachedDealConfig"]}

                          cachedCompSelection={(clientFile.ownerFlags as Record<string, unknown> | undefined)?.bricked_comp_selection as number[] | null}

                          cachedRepairsEdited={(clientFile.ownerFlags as Record<string, unknown> | undefined)?.bricked_repairs_edited as BrickedAnalysisPanelProps["cachedRepairsEdited"]}

                        />

                      ) : (

                        <CompsTab cf={clientFile} selectedComps={selectedComps} onAddComp={handleAddComp} onRemoveComp={handleRemoveComp} onSkipTrace={handleSkipTrace} computedArv={computedArv} onArvChange={handleArvChange} conditionAdj={conditionAdj} onConditionAdjChange={setConditionAdj} />

                      )

                    )}

                    {activeTab === "legal" && (

                      <LegalBriefPanel leadId={clientFile.id} />

                    )}

                  </motion.div>

                </AnimatePresence>

              </div>



              {/* Footer */}

              <div className="shrink-0 flex flex-col border-t border-overlay-6 bg-panel-solid backdrop-blur-2xl rounded-b-[16px]">

                {/* Call status banner */}

                {callStatus && (

                  <div className="flex items-center gap-2 px-6 py-2 bg-overlay-8 border-b border-overlay-15 text-xs text-foreground">

                    <Loader2 className="h-3 w-3 animate-spin" />

                    <span className="font-semibold capitalize">{callStatus}</span>

                    <span className="text-muted-foreground/50 ml-1">via Twilio</span>

                    <button onClick={() => { setCallStatus(null); }} className="ml-auto text-muted-foreground hover:text-foreground">

                      <X className="h-3 w-3" />

                    </button>

                  </div>

                )}

                {/* SMS Compose */}

                {smsOpen && (smsPhone || displayPhone) && (

                  <div className="px-6 py-3 border-b border-overlay-6 space-y-2">

                    <div className="flex items-center gap-2">

                      <MessageSquare className="h-3.5 w-3.5 text-foreground" />

                      <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">SMS to ***{(smsPhone || displayPhone)?.slice(-4)}</p>

                      <button onClick={() => setSmsOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground">

                        <X className="h-3 w-3" />

                      </button>

                    </div>

                    <textarea

                      value={smsMessage}

                      onChange={(e) => setSmsMessage(e.target.value)}

                      placeholder="Type your message&hellip;"

                      className="w-full h-16 rounded-[8px] border border-overlay-8 bg-overlay-4 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-overlay-30"

                      maxLength={320}

                    />

                    <div className="flex items-center justify-between">

                      <span className="text-xs text-muted-foreground/40">{smsMessage.length}/320</span>

                      <Button size="sm" className="gap-1.5" disabled={smsSending || !smsMessage.trim()} onClick={() => handleSendSms()}>

                        {smsSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}

                        {smsSending ? "Sending\u2026" : "Send SMS"}

                      </Button>

                    </div>

                  </div>

                )}

                <div className="flex items-center gap-2 px-6 py-3">

                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>

                    <Pencil className="h-3.5 w-3.5" />Edit Details

                  </Button>

                  {clientFile.ownerEmail && (

                    <Button size="sm" variant="outline" className="gap-2" asChild>

                      <a href={`mailto:${clientFile.ownerEmail}`}><Mail className="h-3.5 w-3.5" />Email</a>

                    </Button>

                  )}

                  <div className="ml-auto text-sm text-muted-foreground">

                    Lead ID: {clientFile.id.slice(0, 8)} {"\u2022"} {sourceLabel}

                  </div>

                  <Button

                    size="sm"

                    variant="destructive"

                    className="gap-2"

                    onClick={() => setDeleteOpen(true)}

                  >

                    <Trash2 className="h-3.5 w-3.5" />Delete

                  </Button>

                </div>

              </div>

            </div>{/* end inner flex-col */}

            <CoachPanel variant="modal" />

            </div>{/* end outer flex-row */}

          </motion.div>



          {editOpen && (

            <EditDetailsModal

              cf={clientFile}

              onClose={() => setEditOpen(false)}

              onSaved={() => onRefresh?.()}

            />

          )}



          {deleteOpen && (

            <DeleteConfirmationModal

              cf={clientFile}

              onClose={() => setDeleteOpen(false)}

              onDeleted={() => {

                setDeleteOpen(false);

                onClose();

                onRefresh?.();

              }}

            />

          )}

        </Fragment>

      )}

    </AnimatePresence>

  );

}
