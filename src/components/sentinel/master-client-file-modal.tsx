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
  Pencil, Save, Voicemail, PhoneForwarded, Brain, Crosshair, MapPinned,
  MessageSquare, Flame, Smartphone, ShieldAlert, PhoneOff, Circle,
  RefreshCw, Target, ArrowRight, ChevronDown, Trash2, Lock, Contact2, Plus,
  Users, Briefcase, CheckCircle, XCircle, Camera, CameraOff, ListPlus,
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
  deriveNextActionVisibility,
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
import { deriveLeadActionSummary } from "@/lib/action-derivation";
import { getSequenceLabel, getSequenceProgress, getCadencePosition, suggestNextCadenceDate } from "@/lib/call-scheduler";
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
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";
import { NumericInput } from "@/components/sentinel/numeric-input";
import { usePreCallBrief } from "@/hooks/use-pre-call-brief";
import { SellerMemoryPreview } from "@/components/sentinel/seller-memory-preview";
import { supabase } from "@/lib/supabase";
import { precheckWorkflowStageChange } from "@/lib/workflow-stage-precheck";
import { getAllowedTransitions } from "@/lib/lead-guardrails";
import { LeadDossierPanel } from "@/components/sentinel/lead-dossier-panel";
import { BrickedAnalysisPanel } from "@/components/sentinel/bricked/bricked-analysis-panel";
import { IntakeGuideSection } from "@/components/sentinel/intake-guide-section";
import { formatDueDateLabel } from "@/lib/due-date-label";
import { toast } from "sonner";
import { extractProspectingSnapshot, sourceChannelLabel, tagLabel } from "@/lib/prospecting";
import Link from "next/link";
import { useDealBuyers } from "@/hooks/use-buyers";
import { dealBuyerStatusLabel } from "@/lib/buyer-types";
// ── Extracted modules ────────────────────────────────────────────────
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
  getQualificationDraft,
  toDraftCurrency,
  parseDraftCurrency,
  getOfferPrepDraft,
  getOfferStatusDraft,
  getBuyerDispoTruthDraft,
  getNextActionUrgency,
  dispositionColor,
  parseSuggestedRoute,
  CALL_OUTCOME_OPTIONS,
  CLOSEOUT_PRESETS,
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ClientFile — single unified shape for every funnel stage
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// [EXTRACTED] ClientFile + adapters -- see extracted module files

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Constants
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// ── Intelligence Summary Block (CRM projection fields) ───────────────
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
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", color)}
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-white/[0.08] bg-white/[0.02] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-foreground">Intelligence Summary</h3>
        <Badge className="border-white/20 bg-white/[0.08] text-foreground text-xs ml-auto">CRM Projection</Badge>
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
        <div className="rounded-[10px] border border-white/15 bg-white/[0.05] px-3 py-2">
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
  { id: "dossier", label: "Dossier", icon: Brain },
  { id: "comps", label: "Comps & ARV", icon: Map },
  { id: "calculator", label: "Deal Calculator", icon: Calculator },
  { id: "documents", label: "Documents / PSA", icon: FileText },
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

const PRIMARY_TAB_IDS = new Set<TabId>(["overview", "contact", "dossier"]);
const ADVANCED_TAB_IDS = new Set<TabId>(["comps", "calculator", "documents"]);

const WORKFLOW_STAGE_OPTIONS: Array<{ id: WorkflowStageId; label: string }> = [
  { id: "prospect", label: "Prospect" },
  { id: "lead", label: "Lead" },
  { id: "negotiation", label: "Negotiation" },
  { id: "disposition", label: "Disposition" },
  { id: "nurture", label: "Nurture" },
  { id: "dead", label: "Dead" },
  { id: "closed", label: "Closed" },
];


// [EXTRACTED] normalizeWorkflowStage through getNextActionUrgency -- see extracted module files
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: Overview
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function OverviewTab({ cf, computedArv, skipTracing, skipTraceResult, skipTraceMs, overlay, skipTraceError, onSkipTrace, onManualSkipTrace, onEdit, onDial, onSms, calling, dialHistory, autofilling, onAutofill, deepCrawling, deepCrawlResult, deepCrawlExpanded, setDeepCrawlExpanded, executeDeepCrawl, hasSavedReport, loadingReport, loadSavedReport, crawlSteps, deepSkipResult, activityRefreshToken, qualification, qualificationDirty, qualificationSaving, qualificationEditable, qualificationSuggestedRoute, onQualificationChange, onQualificationRouteSelect, onQualificationSave, offerPrepDraft, offerPrepEditing, offerPrepSaving, onOfferPrepDraftChange, onOfferPrepEditToggle, onOfferPrepSave, offerStatusDraft, offerStatusEditing, offerStatusSaving, onOfferStatusDraftChange, onOfferStatusEditToggle, onOfferStatusSave, buyerDispoTruthDraft, buyerDispoTruthEditing, buyerDispoTruthSaving, onBuyerDispoTruthDraftChange, onBuyerDispoTruthEditToggle, onBuyerDispoTruthSave, milestoneDraft, milestoneEditing, milestoneSaving, onMilestoneDraftChange, onMilestoneEditToggle, onSaveMilestones, isAdam, onEditNextAction }: {
  cf: ClientFile; computedArv: number; skipTracing: boolean; skipTraceResult: string | null; skipTraceMs: number | null;
  overlay: SkipTraceOverlay | null; skipTraceError: SkipTraceError | null;
  onSkipTrace: () => void; onManualSkipTrace: () => void; onEdit: () => void;
  onDial: (phone: string) => void; onSms: (phone: string) => void;
  calling: boolean;
  dialHistory: Record<string, { count: number; lastDate: string; lastDisposition: string }>;
  autofilling: boolean; onAutofill: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deepCrawling: boolean; deepCrawlResult: any; deepCrawlExpanded: boolean;
  setDeepCrawlExpanded: (v: boolean) => void; executeDeepCrawl: () => void;
  hasSavedReport: boolean; loadingReport: boolean; loadSavedReport: () => void;
  crawlSteps: CrawlStep[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deepSkipResult: any;
  activityRefreshToken: number;
  qualification: QualificationDraft;
  qualificationDirty: boolean;
  qualificationSaving: boolean;
  qualificationEditable: boolean;
  qualificationSuggestedRoute: QualificationRoute | null;
  onQualificationChange: (patch: Partial<QualificationDraft>) => void;
  onQualificationRouteSelect: (route: QualificationRoute) => void;
  onQualificationSave: () => void;
  offerPrepDraft: OfferPrepSnapshotDraft;
  offerPrepEditing: boolean;
  offerPrepSaving: boolean;
  onOfferPrepDraftChange: (patch: Partial<OfferPrepSnapshotDraft>) => void;
  onOfferPrepEditToggle: (next: boolean) => void;
  onOfferPrepSave: () => void;
  offerStatusDraft: OfferStatusSnapshotDraft;
  offerStatusEditing: boolean;
  offerStatusSaving: boolean;
  onOfferStatusDraftChange: (patch: Partial<OfferStatusSnapshotDraft>) => void;
  onOfferStatusEditToggle: (next: boolean) => void;
  onOfferStatusSave: () => void;
  buyerDispoTruthDraft: BuyerDispoTruthDraft;
  buyerDispoTruthEditing: boolean;
  buyerDispoTruthSaving: boolean;
  onBuyerDispoTruthDraftChange: (patch: Partial<BuyerDispoTruthDraft>) => void;
  onBuyerDispoTruthEditToggle: (next: boolean) => void;
  onBuyerDispoTruthSave: () => void;
  milestoneDraft: MilestoneDraft;
  milestoneEditing: boolean;
  milestoneSaving: boolean;
  onMilestoneDraftChange: (patch: Partial<MilestoneDraft>) => void;
  onMilestoneEditToggle: (next: boolean) => void;
  onSaveMilestones: () => void;
  isAdam: boolean;
  onEditNextAction: () => void;
}) {
  const displayPhone = overlay?.primaryPhone ?? cf.ownerPhone ?? (cf.ownerFlags?.contact_phone as string | null) ?? null;
  const displayEmail = overlay?.primaryEmail ?? cf.ownerEmail ?? (cf.ownerFlags?.contact_email as string | null) ?? null;
  const { notes: callHistory } = useCallNotes(cf.id, 5, activityRefreshToken);
  const prospectingSnapshot = useMemo(() => extractProspectingSnapshot(cf.ownerFlags), [cf.ownerFlags]);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [showAllCallAssist, setShowAllCallAssist] = useState(false);
  const summaryNotes = callHistory.filter((n) => n.ai_summary);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persons = overlay?.persons ?? (cf.ownerFlags?.persons as any[]) ?? [];
  const allPhones = overlay?.phones ?? (cf.ownerFlags?.all_phones as string[]) ?? [];
  const allEmails = overlay?.emails ?? (cf.ownerFlags?.all_emails as string[]) ?? [];

  // Rich phone/email details from dual skip-trace
  const phoneDetails: PhoneDetail[] = overlay?.phoneDetails
    ?? (cf.ownerFlags?.all_phones as PhoneDetail[] | undefined)?.filter((p) => typeof p === "object" && p !== null && "number" in p)
    ?? [];
  const emailDetails: EmailDetail[] = overlay?.emailDetails
    ?? (cf.ownerFlags?.all_emails as EmailDetail[] | undefined)?.filter((e) => typeof e === "object" && e !== null && "email" in e)
    ?? [];
  const isLitigator = overlay?.isLitigator ?? (cf.ownerFlags?.is_litigator as boolean) ?? false;
  const hasDncNumbers = overlay?.hasDncNumbers ?? (cf.ownerFlags?.has_dnc_numbers as boolean) ?? false;
  const skipProviders = overlay?.providers ?? (cf.ownerFlags?.skip_trace_providers as string[]) ?? [];

  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreType | null>(null);
  const [offerPrepExpanded, setOfferPrepExpanded] = useState(false);
  const isDealStage = ["negotiation", "disposition"].includes(cf.status);
  const [dealProgressOpen, setDealProgressOpen] = useState(isDealStage || cf.offerStatus !== "none");
  const canEdit = ["prospect", "lead"].includes(cf.status);

  const { brief, loading: briefLoading, regenerate: regenerateBrief } = usePreCallBrief(cf.id);

  const bestPhone = allPhones[0] ?? (phoneDetails[0]?.number) ?? displayPhone;
  const phoneConfidence = phoneDetails.length > 0
    ? phoneDetails[0]?.confidence ?? 70
    : allPhones.length >= 3 ? 95 : allPhones.length === 2 ? 80 : allPhones.length === 1 ? 65 : null;

  const equityPct = cf.equityPercent ?? 0;
  const equityIsGreen = equityPct >= 50;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = useMemo(() => (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>, [cf.ownerFlags?.pr_raw]);
  const tier = getTier(cf.compositeScore);
  const tc = TIER_COLORS[tier];

  const ownerAge = prRaw.OwnerAge ? Number(prRaw.OwnerAge) : null;
  const lastTransferDate = prRaw.LastTransferRecDate ?? prRaw.LastTransferDate ?? null;
  const yearsOwned = lastTransferDate ? Math.floor((Date.now() - new Date(lastTransferDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const lastTransferType = prRaw.LastTransferType ?? null;
  const lastTransferValue = prRaw.LastTransferValue ? Number(prRaw.LastTransferValue) : null;

  const estimatedOwed = cf.estimatedValue && cf.equityPercent != null
    ? Math.round(cf.estimatedValue * (1 - cf.equityPercent / 100)) : null;
  const roomLabel = cf.equityPercent != null
    ? (cf.equityPercent >= 50 ? "HIGH SPREAD" : cf.equityPercent >= 25 ? "MODERATE" : "TIGHT")
    : null;
  const roomColor = cf.equityPercent != null
    ? (cf.equityPercent >= 50 ? "text-foreground bg-white/[0.1]" : cf.equityPercent >= 25 ? "text-muted-foreground bg-white/[0.06]" : "text-muted-foreground bg-white/[0.04] border border-white/10")
    : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mailingAddr = cf.isAbsentee ? ((persons[0] as any)?.mailing_address ?? prRaw.MailAddress ?? prRaw.MailingAddress ?? null) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heirContacts = (cf.ownerFlags?.heir_contacts as any[]) ?? [];

  const warningFlags = useMemo(() => {
    const flags: { label: string; color: string }[] = [];
    if (prRaw.isListedForSale === "Yes" || prRaw.isListedForSale === true) flags.push({ label: "Listed for Sale", color: "text-foreground bg-white/[0.08] border-white/15" });
    if (prRaw.isRecentSale === "Yes" || prRaw.isRecentSale === true) flags.push({ label: "Recent Sale", color: "text-muted-foreground bg-white/[0.06] border-white/12" });
    if (prRaw.isRecentFlip === "Yes" || prRaw.isRecentFlip === true) flags.push({ label: "Recent Flip", color: "text-muted-foreground bg-white/[0.05] border-white/10" });
    if (prRaw.isAuction === "Yes" || prRaw.isAuction === true) flags.push({ label: "Auction", color: "text-foreground bg-white/[0.07] border-white/14" });
    if (prRaw.isBankOwned === "Yes" || prRaw.isBankOwned === true) flags.push({ label: "Bank-Owned (REO)", color: "text-muted-foreground bg-white/[0.06] border-white/12" });
    return flags;
  }, [prRaw]);

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

  const freshestEvent = distressEvents[0] ?? null;
  const freshestDays = freshestEvent
    ? Math.floor((Date.now() - new Date(freshestEvent.created_at).getTime()) / 86400000)
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activityLog, setActivityLog] = useState<{ id: string; type: string; disposition?: string; notes?: string; created_at: string; duration_sec?: number; phone?: string }[]>([]);
  const activityEventLabel = useCallback((action: string, details: Record<string, unknown> | null): string => {
    const statusAfter = typeof details?.status_after === "string" ? details.status_after.replace(/_/g, " ") : null;
    const routeAfter = typeof details?.qualification_route_after === "string" ? details.qualification_route_after.replace(/_/g, " ") : null;
    const dispositionAfter = typeof details?.disposition_code_after === "string" ? details.disposition_code_after.replace(/_/g, " ") : null;

    switch (action) {
      case "NOTE_ADDED":
        return "Note added";
      case "CALL_CLOSEOUT":
        return dispositionAfter ? `Log outcome: ${dispositionAfter}` : "Log outcome";
      case "FOLLOW_UP_UPDATED":
        return "Next action updated";
      case "CALL_OUTCOME_UPDATED":
        return dispositionAfter ? `Call outcome: ${dispositionAfter}` : "Call outcome updated";
      case "QUALIFICATION_ROUTED":
        return routeAfter === "escalate" ? "Escalation review requested" : routeAfter ? `Qualification: ${routeAfter}` : "Qualification routed";
      case "QUALIFICATION_UPDATED":
        return "Qualification updated";
      case "STATUS_CHANGED":
        return statusAfter ? `Stage moved to ${statusAfter}` : "Stage updated";
      case "CLAIMED":
        return "Owner updated";
      default:
        return action.replace(/_/g, " ").toLowerCase();
    }
  }, []);

  useEffect(() => {
    if (!cf.id) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [callsRes, eventsRes] = await Promise.all([
        (supabase.from("calls_log") as any)
          .select("id, disposition, notes, started_at, duration_sec, phone_dialed")
          .or(`lead_id.eq.${cf.id},property_id.eq.${cf.propertyId}`)
          .order("started_at", { ascending: false })
          .limit(20),
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
          id: c.id, type: c.disposition === "sms_outbound" ? "sms" : "call",
          disposition: c.disposition, notes: c.notes,
          created_at: c.started_at, duration_sec: c.duration_sec, phone: c.phone_dialed,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(eventsRes.data ?? []).map((e: any) => {
          const details = e.details && typeof e.details === "object" && !Array.isArray(e.details)
            ? e.details as Record<string, unknown>
            : null;
          const eventNote = typeof details?.note_appended === "string" && details.note_appended.trim().length > 0
            ? details.note_appended.trim()
            : typeof e.details === "string"
              ? e.details
              : null;
          return {
            id: e.id,
            type: "event",
            disposition: activityEventLabel(e.action, details),
            notes: eventNote,
          created_at: e.created_at,
          };
        }),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);
      setActivityLog(merged);
    })();
  }, [activityEventLabel, activityRefreshToken, cf.id, cf.propertyId]);

  const streetViewUrl = prRaw.StreetViewUrl ?? prRaw.PropertyImageUrl ?? (prRaw.Photos?.[0]) ?? null;

  // â"€â"€ Zillow photo carousel â"€â"€
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oFlags = cf.ownerFlags as any;
  const cachedPhotos: string[] = (oFlags?.photos ?? oFlags?.deep_crawl?.photos ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean);
  const [zillowPhotos, setZillowPhotos] = useState<string[]>(cachedPhotos);
  const [zPhotoIdx, setZPhotoIdx] = useState(0);
  const [zPhotosLoading, setZPhotosLoading] = useState(false);

  useEffect(() => {
    // Re-fetch if fewer than 3 cached photos (old caches had only 1 Street View)
    if (cachedPhotos.length >= 3 || !cf.fullAddress) return;
    let cancelled = false;
    setZPhotosLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/property-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: cf.fullAddress, property_id: cf.propertyId, lat: propLat, lng: propLng }),
        });
        if (cancelled) return;
        const data = await res.json();
        if (data.photos?.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setZillowPhotos(data.photos.map((p: any) => (typeof p === "string" ? p : p.url)));
        }
      } catch { /* ignore */ }
      if (!cancelled) setZPhotosLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cf.fullAddress, cf.propertyId]);

  const allPhotos = zillowPhotos.length > 0 ? zillowPhotos : [];

  // â"€â"€ Geocode if no lat/lng from data (same as Comps tab) â"€â"€
  const extracted = extractLatLng(cf);
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (extracted.lat || extracted.lng || geocodedCoords || !cf.fullAddress) return;
    let cancelled = false;
    (async () => {
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
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [extracted.lat, extracted.lng, geocodedCoords, cf.fullAddress]);

  const propLat = extracted.lat ?? geocodedCoords?.lat ?? null;
  const propLng = extracted.lng ?? geocodedCoords?.lng ?? null;

  // â"€â"€ Clickable Street View â†’ Google Maps â"€â"€
  const streetViewLink = propLat && propLng ? getGoogleStreetViewLink(propLat, propLng) : null;

  // â"€â"€ Satellite tile fallback when no Street View available â"€â"€
  const satelliteFallbackUrl = (!streetViewUrl && propLat && propLng) ? getSatelliteTileUrl(propLat, propLng, 18) : null;
  const imageUrl = streetViewUrl ?? satelliteFallbackUrl;
  const imageLabel = streetViewUrl ? "Street View" : "Satellite";
  // â"€â"€ Small thumbnail for property tile (always satellite for compact view) â"€â"€
  const thumbUrl = propLat && propLng ? getSatelliteTileUrl(propLat, propLng, 17) : null;

  const sectionOwner = useRef<HTMLDivElement>(null);
  const sectionSignals = useRef<HTMLDivElement>(null);
  const sectionEquity = useRef<HTMLDivElement>(null);
  const sectionProperty = useRef<HTMLDivElement>(null);
  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // MAO Formula: ARV x 75% - Repairs (10%) - Assignment Fee ($15K)
  const persistedCompArv = (cf.ownerFlags?.comp_arv as number) ?? 0;
  const brickedShareLink = (cf.ownerFlags?.bricked_share_link as string) ?? null;
  const brickedRepairCost = (cf.ownerFlags?.bricked_repair_cost as number) ?? 0;
  const brickedCmv = (cf.ownerFlags?.bricked_cmv as number) ?? 0;
  const bestArv = computedArv > 0 ? computedArv : persistedCompArv > 0 ? persistedCompArv : cf.estimatedValue ?? 0;
  const arvSource: "comps" | "avm" = (computedArv > 0 || persistedCompArv > 0) ? "comps" : "avm";
  const compCount = (cf.ownerFlags?.comp_count as number) ?? 0;

  // Canonical MAO via valuation kernel
  const overviewUnderwrite = bestArv > 0 ? calculateWholesaleUnderwrite({
    arv: bestArv,
    arvSource,
  }) : null;
  const wholesaleValue = overviewUnderwrite?.maxAllowable ?? 0;
  const repairEstimate = overviewUnderwrite?.rehabEstimate ?? 0;
  const assignmentFee = overviewUnderwrite?.assignmentFeeTarget ?? VALUATION_DEFAULTS.assignmentFeeTarget;
  const mao = overviewUnderwrite?.mao ?? null;

  // â"€â"€ Signal-specific motivation text â"€â"€
  const getSignalMotivation = (evtType: string, rd?: Record<string, unknown>): string => {
    switch (evtType) {
      case "pre_foreclosure": case "foreclosure": {
        const d = rd?.ForeclosureRecDate ?? rd?.event_date;
        return d ? `Foreclosure filed ${new Date(String(d)).toLocaleDateString()} — auction pressure` : "Foreclosure filing — auction pressure mounting";
      }
      case "tax_lien": case "tax_delinquency": {
        const amt = rd?.DelinquentAmount ?? rd?.delinquent_amount;
        const inst = rd?.NumberDelinquentInstallments;
        return amt ? `Tax delinquent $${Number(amt).toLocaleString()}${inst ? ` — ${inst} installments behind` : ""}` : "Tax delinquent — penalties accumulating";
      }
      case "divorce": return "Divorce filing — forced partition possible";
      case "probate": case "deceased": return "Estate in probate — heirs likely want quick liquidation";
      case "bankruptcy": return "Bankruptcy filing — motivated to resolve debts";
      case "code_violation": return "Code violations — mounting fines, pressure to sell";
      case "vacant": return "Vacant property — carrying costs with no income";
      case "inherited": return "Inherited property — heirs may want fast liquidation";
      case "tired_landlord": return "Long-term landlord showing signs of fatigue — may want to exit their rental portfolio";
      case "underwater": return "Negative equity means the owner owes more than the home is worth — potential short sale candidate";
      default: return "Distress signal — may be motivated to sell";
    }
  };

  // â"€â"€ Actual event date extraction from raw_data â"€â"€
  const getEventDate = (evt: { created_at: string; raw_data?: Record<string, unknown> }): { date: string; isActual: boolean } => {
    const rd = evt.raw_data ?? {};
    const dateVal = rd.ForeclosureRecDate ?? rd.event_date ?? rd.filing_date ?? rd.recording_date ?? rd.delinquent_date ?? null;
    if (dateVal && typeof dateVal === "string") {
      try { return { date: new Date(dateVal).toLocaleDateString(), isActual: true }; } catch { /* fall through */ }
    }
    return { date: new Date(evt.created_at).toLocaleDateString(), isActual: false };
  };

  // â"€â"€ Humanize source name â"€â"€
  const sourceName = (s?: string): string => {
    switch (s) {
      case "propertyradar": return "PropertyRadar";
      case "attom": return "ATTOM";
      case "manual": return "Manual entry";
      case "bulk_seed": return "Bulk import";
      default: return s || "Unknown";
    }
  };

  const pipelineDays = cf.promotedAt
    ? Math.floor((Date.now() - new Date(cf.promotedAt).getTime()) / 86400000)
    : null;

  const [timelinesOpen, setTimelinesOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const hasDeepIntel = deepCrawling || hasSavedReport || Boolean(deepCrawlResult);
  const { defaultCards: callAssistDefaultCards, allCards: callAssistAllCards } = useMemo(
    () => selectCallAssistCards(cf),
    [cf],
  );
  const callAssistVisibleCards = showAllCallAssist ? callAssistAllCards : callAssistDefaultCards;
  const hasQualificationData =
    qualification.motivationLevel != null
    || qualification.sellerTimeline != null
    || qualification.conditionLevel != null
    || qualification.occupancyScore != null
    || qualification.equityFlexibilityScore != null
    || qualification.decisionMakerConfirmed
    || qualification.priceExpectation != null
    || qualification.qualificationRoute != null;
  const showQualificationBlock = qualificationEditable || hasQualificationData;
  const qualificationCompletenessItems = [
    { label: "Motivation", complete: qualification.motivationLevel != null },
    { label: "Timeline", complete: qualification.sellerTimeline != null },
    { label: "Condition", complete: qualification.conditionLevel != null },
    { label: "Occupancy", complete: qualification.occupancyScore != null },
    { label: "Equity Flex", complete: qualification.equityFlexibilityScore != null },
    { label: "Decision Maker", complete: qualification.decisionMakerConfirmed === true },
    { label: "Asking Price", complete: qualification.priceExpectation != null },
  ];
  const qualificationCompleteCount = qualificationCompletenessItems.filter((item) => item.complete).length;
  const qualificationCompletenessTotal = qualificationCompletenessItems.length;
  const qualificationCompletenessRatio = qualificationCompletenessTotal > 0
    ? qualificationCompleteCount / qualificationCompletenessTotal
    : 0;
  const qualificationCompletenessPct = Math.round(qualificationCompletenessRatio * 100);
  const qualificationMissingLabels = qualificationCompletenessItems
    .filter((item) => !item.complete)
    .map((item) => item.label);
  const offerReadySuggested =
    (qualification.motivationLevel ?? 0) >= 4
    && (qualification.sellerTimeline === "immediate" || qualification.sellerTimeline === "30_days")
    && cf.compositeScore >= 65;
  const offerStatusLabel = offerVisibilityLabel(cf.offerStatus);
  const offerStatusToneClass =
    cf.offerStatus === "preparing_offer"
      ? "border-white/15 bg-white/[0.06] text-foreground"
      : cf.offerStatus === "offer_made"
        ? "border-white/18 bg-white/[0.08] text-foreground"
        : cf.offerStatus === "seller_reviewing"
          ? "border-white/12 bg-white/[0.05] text-muted-foreground"
          : cf.offerStatus === "declined"
            ? "border-white/10 bg-white/[0.04] text-muted-foreground"
            : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";
  const offerStatusHint =
    cf.offerStatus === "preparing_offer"
      ? "Derived from stage + qualification route: qualified and queued for offer prep."
      : cf.offerStatus === "offer_made"
        ? "Derived from stage + qualification route: active offer conversation signal."
        : cf.offerStatus === "seller_reviewing"
          ? "Derived from stage + qualification route: waiting on seller decision/disposition."
        : cf.offerStatus === "declined"
          ? "Derived from stage + qualification route: offer path appears closed for now."
          : "Derived from stage + qualification route: no offer progress signal yet.";
  const offerStatusSnapshot = extractOfferStatusSnapshot((cf.ownerFlags ?? null) as Record<string, unknown> | null);
  const offerStatusTruthLabelText = offerStatusTruthLabel(offerStatusSnapshot.status);
  const offerStatusTruthToneClass =
    offerStatusSnapshot.status === "accepted"
      ? "border-white/18 bg-white/[0.09] text-foreground"
      : offerStatusSnapshot.status === "passed_not_moving_forward"
        ? "border-white/10 bg-white/[0.04] text-muted-foreground"
        : offerStatusSnapshot.status === "counter_needs_revision"
          ? "border-white/14 bg-white/[0.06] text-muted-foreground"
          : offerStatusSnapshot.status
            ? "border-white/15 bg-white/[0.06] text-foreground"
            : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";
  const offerStatusAmountLabel =
    offerStatusSnapshot.amount != null
      ? formatCurrency(offerStatusSnapshot.amount)
      : offerStatusSnapshot.amountLow != null || offerStatusSnapshot.amountHigh != null
        ? `${offerStatusSnapshot.amountLow != null ? formatCurrency(offerStatusSnapshot.amountLow) : "?"} - ${offerStatusSnapshot.amountHigh != null ? formatCurrency(offerStatusSnapshot.amountHigh) : "?"}`
        : "Not set";
  const offerStatusUpdatedLabel = offerStatusSnapshot.updatedAt ? formatDateTimeShort(offerStatusSnapshot.updatedAt) : "Not set";
  const canEditOfferStatus = cf.status !== "dead" && cf.status !== "closed";
  const offerPrepSnapshot = extractOfferPrepSnapshot((cf.ownerFlags ?? null) as Record<string, unknown> | null);
  const offerPrepActive = cf.qualificationRoute === "offer_ready" || cf.offerStatus === "preparing_offer";
  const offerPrepDueIso = cf.nextCallScheduledAt ?? cf.followUpDate;
  const offerPrepDueMs = offerPrepDueIso ? new Date(offerPrepDueIso).getTime() : NaN;
  const offerPrepMissingNextAction = !offerPrepDueIso || Number.isNaN(offerPrepDueMs);
  const offerPrepHealth = deriveOfferPrepHealth({
    status: cf.status,
    qualificationRoute: cf.qualificationRoute,
    snapshot: offerPrepSnapshot,
    nextCallScheduledAt: cf.nextCallScheduledAt,
    nextFollowUpAt: cf.followUpDate,
  });
  const offerPrepStale = offerPrepHealth.state === "stale";
  const offerPrepMissing = offerPrepHealth.state === "missing";
  const offerPrepDueLabel = offerPrepDueIso ? formatDateTimeShort(offerPrepDueIso) : "Not set";
  const offerPrepUpdatedLabel = offerPrepSnapshot.updatedAt ? formatDateTimeShort(offerPrepSnapshot.updatedAt) : "Not set";
  const canEditOfferPrep = cf.status !== "dead" && cf.status !== "closed";
  const buyerDispo = deriveBuyerDispoVisibility({
    status: cf.status,
    qualificationRoute: cf.qualificationRoute,
    offerStatus: cf.offerStatus,
    conditionLevel: cf.conditionLevel,
    priceExpectation: cf.priceExpectation,
    estimatedValue: cf.estimatedValue,
  });
  const buyerFitLabel = buyerFitVisibilityLabel(buyerDispo.buyerFit);
  const dispoReadinessLabel = dispoReadinessVisibilityLabel(buyerDispo.dispoReadiness);
  const buyerDispoNextActionIso = cf.nextCallScheduledAt ?? cf.followUpDate;
  const buyerDispoNextActionMs = buyerDispoNextActionIso ? new Date(buyerDispoNextActionIso).getTime() : NaN;
  const buyerDispoNextActionMissing = !buyerDispoNextActionIso || Number.isNaN(buyerDispoNextActionMs);
  const buyerDispoReadinessHigh = buyerDispo.dispoReadiness === "ready" || buyerDispo.dispoReadiness === "needs_review";
  const buyerDispoActionMissing = buyerDispoReadinessHigh && buyerDispoNextActionMissing;
  const buyerDispoActionStale = buyerDispoReadinessHigh && !buyerDispoNextActionMissing && buyerDispoNextActionMs < Date.now();
  const buyerDispoNextActionLabel = buyerDispoNextActionIso ? formatDateTimeShort(buyerDispoNextActionIso) : "Not set";
  const buyerDispoTruthSnapshot = extractBuyerDispoTruthSnapshot((cf.ownerFlags ?? null) as Record<string, unknown> | null);
  const buyerDispoTruthBuyerFitLabel = buyerDispoTruthSnapshot.buyerFit ? buyerFitVisibilityLabel(buyerDispoTruthSnapshot.buyerFit) : "Not set";
  const buyerDispoTruthStatusLabel = buyerDispoTruthSnapshot.dispoStatus ? dispoReadinessVisibilityLabel(buyerDispoTruthSnapshot.dispoStatus) : "Not set";
  const buyerDispoReadyLabel = buyerDispoTruthSnapshot.dispoStatus === "ready" ? "Ready for Dispo" : "Not Ready for Dispo";
  const buyerDispoTruthUpdatedLabel = buyerDispoTruthSnapshot.updatedAt ? formatDateTimeShort(buyerDispoTruthSnapshot.updatedAt) : "Not set";
  const buyerDispoTruthFitToneClass =
    buyerDispoTruthSnapshot.buyerFit === "broad"
      ? "border-white/18 bg-white/[0.08] text-foreground"
      : buyerDispoTruthSnapshot.buyerFit === "narrow"
        ? "border-white/12 bg-white/[0.05] text-muted-foreground"
        : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";
  const buyerDispoTruthStatusToneClass =
    buyerDispoTruthSnapshot.dispoStatus === "ready"
      ? "border-white/16 bg-white/[0.07] text-foreground"
      : buyerDispoTruthSnapshot.dispoStatus === "needs_review"
        ? "border-white/12 bg-white/[0.05] text-muted-foreground"
        : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";
  const canEditBuyerDispoTruth = cf.status !== "dead" && cf.status !== "closed";
  const buyerFitToneClass =
    buyerDispo.buyerFit === "broad"
      ? "border-white/18 bg-white/[0.07] text-foreground"
      : buyerDispo.buyerFit === "narrow"
        ? "border-white/12 bg-white/[0.04] text-muted-foreground"
        : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";
  const dispoReadinessToneClass =
    buyerDispo.dispoReadiness === "ready"
      ? "border-white/18 bg-white/[0.07] text-foreground"
      : buyerDispo.dispoReadiness === "needs_review"
        ? "border-white/12 bg-white/[0.05] text-muted-foreground"
        : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";

  useEffect(() => {
    setShowAllCallAssist(false);
  }, [cf.id]);

  return (
    <div className="space-y-4">
      {/* -- NEXT ACTION -- */}
      <NextActionCard cf={cf} onEditNextAction={onEditNextAction} />

      {/* -- SELLER SNAPSHOT -- */}
      <SellerSnapshot cf={cf} phoneConfidence={phoneConfidence} />

      {/* -- QUALIFICATION GAPS -- */}
      <QualificationGaps cf={cf} />

      {/* â•â•â• 1. CALL CARD — WHO + NUMBER (hero section) â•â•â• */}
      <div ref={sectionOwner} className="rounded-[12px] border border-white/[0.08] bg-white/[0.02] p-3.5 relative overflow-hidden">

        <div className="relative z-10">
          {/* Mailing Address for absentee owners */}
          {mailingAddr && (
            <div className="rounded-[10px] border border-white/12 bg-white/[0.04] p-2.5 mb-3">
              <div className="flex items-start gap-2">
                <MapPinned className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Mailing Address (Absentee)</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-foreground truncate">{typeof mailingAddr === "string" ? mailingAddr : JSON.stringify(mailingAddr)}</p>
                    <CopyBtn text={typeof mailingAddr === "string" ? mailingAddr : JSON.stringify(mailingAddr)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Litigator Warning */}
          {isLitigator && (
            <div className="rounded-[10px] border-2 border-foreground/25 bg-foreground/[0.08] p-3 mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-foreground shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground uppercase">Known TCPA Litigator</p>
                  <p className="text-sm text-muted-foreground">Do NOT call or text this owner. High litigation risk.</p>
                </div>
              </div>
            </div>
          )}


          {/* Heir Contacts (probate situations) */}
          {heirContacts.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-foreground/90 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />Heir / Decision-Maker Contacts
              </p>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {heirContacts.map((heir: any, i: number) => (
                <div key={i} className="rounded-md border border-white/12 bg-white/[0.03] p-2.5 text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{heir.name ?? "Unknown Heir"}</span>
                    {heir.role && <span className="text-muted-foreground">({heir.role})</span>}
                  </div>
                  {heir.phone && (
                    <div className="pl-5 flex items-center gap-1.5">
                      <Phone className="h-2.5 w-2.5 text-muted-foreground" />
                      <button onClick={() => onDial(heir.phone)} className="text-foreground hover:underline font-mono text-xs">{heir.phone}</button>
                    </div>
                  )}
                  {heir.email && (
                    <div className="pl-5 flex items-center gap-1.5">
                      <Mail className="h-2.5 w-2.5 text-muted-foreground" />
                      <a href={`mailto:${heir.email}`} className="text-foreground hover:underline">{heir.email}</a>
                    </div>
                  )}
                  {heir.mailing && <div className="pl-5 text-muted-foreground">{heir.mailing}</div>}
                </div>
              ))}
            </div>
          )}

          {skipTraceResult && !skipTraceError && (
            <div className={cn("mt-2 text-xs px-3 py-2 rounded-md border", skipTraceResult.startsWith("Found") ? "text-foreground bg-white/[0.05] border-white/12" : "text-foreground bg-white/[0.04] border-white/15")}>
              <div className="flex items-center justify-between gap-2">
                <span>{skipTraceResult}</span>
                {skipTraceMs != null && (
                  <span className={cn("font-mono text-sm shrink-0 px-1.5 py-0.5 rounded", skipTraceMs <= 2000 ? "text-foreground bg-white/[0.08]" : "text-muted-foreground bg-white/[0.05]")}>
                    {(skipTraceMs / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
            </div>
          )}

          {skipTraceError && (
            <div className="mt-2 rounded-[10px] border border-white/15 bg-white/[0.04] p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-semibold text-foreground">{skipTraceError.error}</p>
                  {skipTraceError.reason && <p className="text-sm text-muted-foreground">{skipTraceError.reason}</p>}
                  {skipTraceError.address_issues && skipTraceError.address_issues.length > 0 && (
                    <div className="space-y-0.5">
                      {skipTraceError.address_issues.map((issue, i) => (
                        <p key={i} className="text-sm text-muted-foreground flex items-center gap-1">
                          <span className="text-foreground">&#9679;</span>{issue}
                        </p>
                      ))}
                    </div>
                  )}
                  {skipTraceError.suggestion && <p className="text-sm text-muted-foreground italic">{skipTraceError.suggestion}</p>}
                  {skipTraceError.tier_reached && <p className="text-sm text-muted-foreground/50 font-mono">Lookup stopped at: {skipTraceError.tier_reached}</p>}
                </div>
                {skipTraceMs != null && (
                  <span className="font-mono text-sm shrink-0 px-1.5 py-0.5 rounded text-muted-foreground bg-white/[0.06]">
                    {(skipTraceMs / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
              <Button
                size="sm"
                onClick={onManualSkipTrace}
                disabled={skipTracing}
                className="w-full gap-2 bg-primary text-primary-foreground border-0 shadow-[var(--shadow-badge-glow-tight)] hover:opacity-95 transition-all"
              >
                {skipTracing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Manual Skip Trace — Force Partial Lookup
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* â•â•â• 2. COMPLIANCE GATE — DNC / Litigator â•â•â• */}
      {(isLitigator || hasDncNumbers) && (
        <div className="rounded-[10px] border-2 border-foreground/30 bg-foreground/[0.08] p-3 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-foreground shrink-0" />
          <div>
            <p className="text-xs font-bold text-foreground uppercase tracking-wide">
              {isLitigator ? "TCPA Litigator — DO NOT CONTACT" : "DNC Numbers Detected"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLitigator ? "High litigation risk. No calls, texts, or mailers to this owner." : "One or more phone numbers are on the DNC list. Check before dialing."}
            </p>
          </div>
        </div>
      )}

      {/* â•â•â• 3. DISTRESS SIGNALS + EXTERNAL LINKS — side by side â•â•â• */}
      <SellerMemoryPreview leadId={cf.id} />

      {/* â•â•â• 4. PROPERTY SNAPSHOT — Photo Carousel + Address + Badges â•â•â• */}
      <div ref={sectionProperty} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        {(allPhotos.length > 0 || imageUrl) && (
          <div className="relative block h-32 group">
            {allPhotos.length > 0 ? (
              <>
                <img
                  src={allPhotos[zPhotoIdx]}
                  alt={`Property photo ${zPhotoIdx + 1}`}
                  className="w-full h-full object-cover"
                />
                {allPhotos.length > 1 && (
                  <>
                    <button
                      onClick={() => setZPhotoIdx((i) => (i - 1 + allPhotos.length) % allPhotos.length)}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setZPhotoIdx((i) => (i + 1) % allPhotos.length)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 z-10">
                  <ImageIcon className="h-2.5 w-2.5" />{zPhotoIdx + 1} / {allPhotos.length}
                </div>
              </>
            ) : (
              <a
                href={streetViewLink ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full cursor-pointer"
                onClick={(e) => { if (!streetViewLink) e.preventDefault(); }}
              >
                <img
                  src={imageUrl!}
                  alt="Property"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                {streetViewLink && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    <span className="bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <ExternalLink className="h-3 w-3" />{streetViewUrl ? "Open Street View" : "Open in Google Maps"}
                    </span>
                  </div>
                )}
              </a>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,7,13,0.85)] via-[rgba(7,7,13,0.2)] to-transparent pointer-events-none" />
            {zPhotosLoading && allPhotos.length === 0 && (
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 z-10">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />Loading photos...
              </div>
            )}
            <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between pointer-events-none">
              <div className="flex items-center gap-2.5 text-white">
                {cf.bedrooms != null && (
                  <span className="text-xs font-bold bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">{cf.bedrooms}bd / {cf.bathrooms ?? "?"}ba</span>
                )}
                {cf.sqft != null && (
                  <span className="text-xs font-bold bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">{cf.sqft.toLocaleString()} sqft</span>
                )}
                {cf.yearBuilt && (
                  <span className="text-xs font-bold bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">Built {cf.yearBuilt}</span>
                )}
                {cf.lotSize && (
                  <span className="text-xs font-bold bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">{cf.lotSize.toLocaleString()} lot</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-white/50">
                <ImageIcon className="h-2.5 w-2.5" />{allPhotos.length > 0 ? `${allPhotos.length} photos \u00B7 Zillow` : streetViewLink ? `Click to explore \u00B7 ${imageLabel}` : imageLabel}
              </div>
            </div>
          </div>
        )}
        <div className="p-4 space-y-3">
          {/* Address + County + APN — with satellite thumbnail on the right */}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground truncate">{cf.fullAddress || "—"}</p>
                    {cf.fullAddress && <CopyBtn text={cf.fullAddress} />}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {cf.county && <span className="text-sm text-muted-foreground">{cf.county} County</span>}
                    {cf.apn && (
                      <span className="text-sm text-muted-foreground/60 font-mono flex items-center gap-1">
                        APN: {cf.apn} <CopyBtn text={cf.apn} />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Property type + stats */}
              {(cf.propertyType || cf.bedrooms != null || cf.sqft != null) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {cf.propertyType && (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      <Building className="h-2.5 w-2.5" />{cf.propertyType}
                    </span>
                  )}
                  {!imageUrl && cf.bedrooms != null && (
                    <span className="text-sm font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      {cf.bedrooms}bd / {cf.bathrooms ?? "?"}ba
                    </span>
                  )}
                  {!imageUrl && cf.sqft != null && (
                    <span className="text-sm font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      {cf.sqft.toLocaleString()} sqft
                    </span>
                  )}
                  {!imageUrl && cf.yearBuilt && (
                    <span className="text-sm font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      Built {cf.yearBuilt}
                    </span>
                  )}
                  {!imageUrl && cf.lotSize && (
                    <span className="text-sm font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      {cf.lotSize.toLocaleString()} lot
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Satellite / Street View thumbnail on the right */}
            {(thumbUrl || streetViewUrl) && (
              <a
                href={streetViewLink ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cf.fullAddress ?? "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 relative group rounded-lg overflow-hidden border border-white/[0.08] hover:border-white/30 transition-colors"
              >
                <img
                  src={streetViewUrl ?? thumbUrl ?? ""}
                  alt="Property"
                  className="w-[120px] h-[90px] object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center gap-1 text-xs text-white/70 pointer-events-none">
                  <ImageIcon className="h-2 w-2" />{streetViewUrl ? "Street View" : "Satellite"}
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <ExternalLink className="h-3.5 w-3.5 text-white drop-shadow-md" />
                </div>
              </a>
            )}
          </div>

          {/* Distress type pill badges */}
          {(cf.tags.length > 0 || warningFlags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {cf.tags.filter((t) => !t.startsWith("score-")).map((tag) => {
                const cfg = DISTRESS_CFG[tag];
                return (
                  <span key={tag} className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                    cfg?.color ?? "text-muted-foreground bg-white/[0.06] border-white/20"
                  )}>
                    {cfg?.label ?? tag.replace(/_/g, " ")}
                  </span>
                );
              })}
              {warningFlags.map((f) => (
                <span key={f.label} className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider", f.color)}>
                  <AlertTriangle className="h-2.5 w-2.5" />{f.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>



      {/* Phase 2.5 — Valuation Summary Card */}
      {(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const snap = (cf.ownerFlags as any)?.offer_prep_snapshot;
        if (!snap?.formula_version && !mao) return null;

        const snapArvUsed = snap?.arv_used as number | undefined;
        const snapMao = snap?.mao_result as number | undefined;
        const snapConf = snap?.confidence as string | undefined;
        const snapCompCount = snap?.comp_count as number | undefined;
        const snapCondAdj = snap?.condition_adj_pct as number | undefined;
        const snapUpdatedAt = snap?.updated_at as string | undefined;
        const snapVersion = snap?.formula_version as string | undefined;
        const snapWarnings = (snap?.warnings ?? []) as Array<{ code: string; severity: string; message: string }>;

        // Staleness: >7 days since last save
        const daysSinceUpdate = snapUpdatedAt
          ? Math.floor((Date.now() - new Date(snapUpdatedAt).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const isStale = daysSinceUpdate != null && daysSinceUpdate > 7;

        // Use persisted snapshot values, or live computation as fallback
        const displayArv = snapArvUsed ?? bestArv;
        const displayMao = snapMao ?? mao ?? 0;
        const displayConf = snapConf ?? (compCount >= 3 ? "high" : compCount >= 2 ? "medium" : "low");
        const confColor = displayConf === "high" ? "text-foreground" : displayConf === "medium" ? "text-muted-foreground" : "text-foreground";
        const confBorder = displayConf === "high" ? "border-white/15" : displayConf === "medium" ? "border-white/12" : "border-white/15";
        const confBg = displayConf === "high" ? "bg-white/[0.06]" : displayConf === "medium" ? "bg-white/[0.05]" : "bg-white/[0.05]";

        const dangerWarnings = snapWarnings.filter((w) => w.severity === "danger");

        return (
          <div className={cn("rounded-[12px] border p-3 space-y-2", confBorder, confBg)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 text-foreground" />
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Valuation Summary</p>
              </div>
              <div className="flex items-center gap-1.5">
                {isStale && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {daysSinceUpdate}d ago
                  </span>
                )}
                {snapVersion && (
                  <span className="text-xs text-muted-foreground/50 font-mono">v{snapVersion}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase">ARV</p>
                <p className="text-sm font-bold text-foreground font-mono">
                  {displayArv > 0 ? `$${(displayArv / 1000).toFixed(0)}k` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">MAO</p>
                <p className="text-sm font-bold text-foreground font-mono">
                  {displayMao > 0 ? `$${(displayMao / 1000).toFixed(0)}k` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Confidence</p>
                <p className={cn("text-sm font-bold capitalize", confColor)}>{displayConf}</p>
              </div>
            </div>

            {(snapCompCount != null || snapCondAdj != null) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                {snapCompCount != null && <span>{snapCompCount} comp{snapCompCount !== 1 ? "s" : ""}</span>}
                {snapCondAdj != null && snapCondAdj !== 0 && <span>Condition adj: {snapCondAdj > 0 ? "+" : ""}{snapCondAdj}%</span>}
              </div>
            )}

            {/* Bricked AI supplemental data */}
            {(brickedRepairCost > 0 || (brickedCmv > 0 && brickedCmv !== bestArv) || brickedShareLink) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70">
                {brickedRepairCost > 0 && (
                  <span>Est. Repairs: {formatCurrency(brickedRepairCost)}</span>
                )}
                {brickedCmv > 0 && brickedCmv !== bestArv && (
                  <span>CMV: {formatCurrency(brickedCmv)}</span>
                )}
                {brickedShareLink && (
                  <a
                    href={brickedShareLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    View Bricked Report
                  </a>
                )}
              </div>
            )}

            {dangerWarnings.length > 0 && (
              <div className="space-y-1">
                {dangerWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-foreground flex items-center gap-1">
                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                    {w.message}
                  </p>
                ))}
              </div>
            )}

            {isStale && (
              <p className="text-xs text-muted-foreground">
                Valuation is {daysSinceUpdate} days old — consider re-running comps.
              </p>
            )}
          </div>
        );
      })()}

      {/* â•â•â• 5. MAO BREAKDOWN — Full formula so agents trust the math â•â•â• */}
      {mao != null && mao > 0 && (
        <div className="rounded-[12px] border border-white/20 bg-white/[0.03] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-foreground" />
              <p className="text-sm text-foreground/80 uppercase tracking-wider font-semibold">MAO Breakdown</p>
            </div>
            <span className="text-xs text-muted-foreground/50 italic">
              {arvSource === "comps" ? `Based on ${compCount || "selected"} comps` : "Based on AVM estimate"}
            </span>
          </div>

          <div className="space-y-1 font-mono text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>ARV ({arvSource === "comps" ? "comps" : "AVM"})</span>
              <span className="text-foreground font-semibold">{formatCurrency(bestArv)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>&times; 75% wholesale</span>
              <span className="text-foreground">{formatCurrency(wholesaleValue)}</span>
            </div>
            <div className="flex items-center justify-between text-foreground">
              <span>&minus; Repairs (est. 10%)</span>
              <span>&minus;{formatCurrency(repairEstimate)}</span>
            </div>
            <div className="flex items-center justify-between text-foreground">
              <span>&minus; Assignment fee</span>
              <span>&minus;{formatCurrency(assignmentFee)}</span>
            </div>
            <div className="border-t border-white/[0.08] pt-1.5 mt-1 flex items-center justify-between">
              <span className="text-foreground font-bold text-sm">MAO</span>
              <span className="text-foreground font-bold text-lg" style={{ textShadow: "0 0 12px rgba(255,255,255,0.08)" }}>{formatCurrency(mao)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {/* Distress Signals — left half */}
        <div ref={sectionSignals} className="flex-1 min-w-0 rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-foreground" />
              <p className="text-sm text-foreground/90 uppercase tracking-wider font-semibold">Distress Signals</p>
            </div>
          </div>
          {distressEvents.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {distressEvents.slice(0, 6).map((evt) => {
                const cfg = DISTRESS_CFG[evt.event_type];
                const EvtIcon = cfg?.icon ?? AlertTriangle;
                const evtDate = getEventDate(evt);
                const daysAgo = Math.floor((Date.now() - new Date(evt.created_at).getTime()) / 86400000);
                const isRecent = daysAgo <= 30;
                const motivation = getSignalMotivation(evt.event_type, evt.raw_data ?? undefined);
                return (
                  <span
                    key={evt.id}
                    title={`${motivation}\nPer ${sourceName(evt.source)} \u00B7 ${evtDate.isActual ? "filed" : "detected"} ${evtDate.date}`}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-semibold border cursor-default transition-colors",
                      cfg?.color ?? "text-muted-foreground bg-white/[0.06] border-white/20",
                      isRecent && "ring-1 ring-white/20"
                    )}
                  >
                    <EvtIcon className="h-2.5 w-2.5 shrink-0" />
                    {cfg?.label ?? evt.event_type.replace(/_/g, " ")}
                    <span className="text-xs opacity-60">{"\u00B7"} {evtDate.date.replace(/\/\d{4}$/, "")}</span>
                    {isRecent && <Flame className="h-2.5 w-2.5 text-foreground shrink-0" />}
                  </span>
                );
              })}
              {distressEvents.length > 6 && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-semibold border border-white/10 text-muted-foreground bg-white/[0.03]">
                  +{distressEvents.length - 6} more
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/50">No distress signals found (checked: tax liens, foreclosure, probate, code violations)</p>
          )}
        </div>

        {/* External Links + County Records — right half */}
        <div className="flex-1 min-w-0 rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-3 w-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">External Links</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cf.radarId && (
              <a href={`https://app.propertyradar.com/properties/${cf.radarId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Radar className="h-2.5 w-2.5" />PropertyRadar
              </a>
            )}
            {(() => {
              const listingUrl = String(cf.ownerFlags?.listing_url ?? cf.ownerFlags?.link ?? "");
              return listingUrl ? (
                <a href={listingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-muted-foreground transition-colors">
                  <ExternalLink className="h-2.5 w-2.5" />Listing
                </a>
              ) : null;
            })()}
            {cf.fullAddress && (
              <>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cf.fullAddress)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Map className="h-2.5 w-2.5" />Maps
                </a>
                <a href={`https://www.zillow.com/homes/${encodeURIComponent(cf.fullAddress)}_rb/`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ExternalLink className="h-2.5 w-2.5" />Zillow
                </a>
                <a href={`https://www.redfin.com/search#query=${encodeURIComponent(cf.fullAddress)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ExternalLink className="h-2.5 w-2.5" />Redfin
                </a>
              </>
            )}
          </div>
          {/* County Records */}
          {(() => {
            const countyKey = cf.county?.toLowerCase().replace(/\s+county$/i, "").trim() ?? "";
            const countyInfo = COUNTY_LINKS[countyKey];
            if (countyInfo) {
              return (
                <div className="space-y-1.5 pt-2 mt-2 border-t border-white/[0.06]">
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">{countyInfo.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <a href={countyInfo.gis(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-6 px-2">
                        <Map className="h-2.5 w-2.5 text-muted-foreground" />GIS
                      </Button>
                    </a>
                    <a href={countyInfo.assessor(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-6 px-2">
                        <Building className="h-2.5 w-2.5 text-muted-foreground" />Assessor
                      </Button>
                    </a>
                    {countyInfo.treasurer && (
                      <a href={countyInfo.treasurer(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-6 px-2">
                          <DollarSign className="h-2.5 w-2.5 text-muted-foreground" />Tax
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              );
            }
            if (cf.apn && cf.county) {
              const searchQ = encodeURIComponent(`${cf.apn} ${cf.county} county ${cf.state} property records`);
              return (
                <div className="pt-2 mt-2 border-t border-white/[0.06]">
                  <a href={`https://www.google.com/search?q=${searchQ}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-6 px-2">
                      <Search className="h-2.5 w-2.5 text-muted-foreground" />{cf.county} Records
                    </Button>
                  </a>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>

      {/* Prospecting Intake — compact inline summary */}
      {(prospectingSnapshot.sourceChannel || prospectingSnapshot.nicheTag || prospectingSnapshot.outboundStatus) && (
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            Source: <span className="text-foreground font-medium">{sourceChannelLabel(prospectingSnapshot.sourceChannel ?? cf.source)}</span>
          </span>
          {prospectingSnapshot.nicheTag && (
            <span className="text-muted-foreground">
              Niche: <span className="text-foreground font-medium">{tagLabel(prospectingSnapshot.nicheTag)}</span>
            </span>
          )}
          <span className="text-muted-foreground">
            Attempts: <span className="text-foreground font-medium">{prospectingSnapshot.attemptCount ?? cf.totalCalls ?? 0}</span>
          </span>
          {(prospectingSnapshot.callOutcome || cf.dispositionCode) && (
            <span className="text-muted-foreground">
              Last: <span className="text-foreground font-medium">{tagLabel(prospectingSnapshot.callOutcome ?? cf.dispositionCode ?? "")}</span>
            </span>
          )}
          {(prospectingSnapshot.doNotCall || prospectingSnapshot.badRecord || prospectingSnapshot.wrongNumber) && (
            <span className="text-foreground font-semibold">
              {[prospectingSnapshot.doNotCall ? "DNC" : null, prospectingSnapshot.badRecord ? "Bad record" : null, prospectingSnapshot.wrongNumber ? "Wrong number" : null].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      )}

      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-foreground" />
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Recent Communication</p>
          {activityLog.length > 0 && (
            <Badge variant="outline" className="text-xs ml-1">{Math.min(activityLog.length, 4)}</Badge>
          )}
          <button
            className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setTimelinesOpen(true)}
          >
            Open full timeline
          </button>
        </div>
        {activityLog.length > 0 ? (
          <div className="space-y-1.5">
            {activityLog.slice(0, 4).map((entry) => {
              const dispositionLabel = entry.disposition?.replace(/_/g, " ") ?? entry.type;
              const isSystemEvent = !entry.duration_sec && !entry.phone && (
                entry.type === "qualification" || entry.type === "stage_change" || entry.type === "assignment" ||
                entry.type === "status_change" || entry.type === "system" || entry.type === "import" ||
                (entry.notes?.startsWith("{") ?? false)
              );
              const noteText = entry.notes?.replace(/\s+/g, " ").trim() ?? "";
              const notePreview = noteText.length > 0
                ? noteText.startsWith("{")
                  ? "Event details logged"
                  : noteText.length > 80
                    ? `${noteText.slice(0, 80)}...`
                    : noteText
                : null;
              return (
                <div key={entry.id} className="flex items-start justify-between gap-2 rounded-[8px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground capitalize">
                      {dispositionLabel}
                      {isSystemEvent && <span className="ml-1.5 text-xs font-normal text-muted-foreground/40">System event</span>}
                    </p>
                    {notePreview && <p className="text-sm text-muted-foreground/65 truncate max-w-[430px]">{notePreview}</p>}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground/50">{formatRelativeFromNow(entry.created_at)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/55">No calls, texts, or notes logged yet.</p>
        )}
      </div>

      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-foreground" />
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Call Assist</p>
          <Badge variant="outline" className="text-xs ml-1 border-white/[0.14] text-muted-foreground">
            Talking points
          </Badge>
          {callAssistAllCards.length > callAssistDefaultCards.length && (
            <button
              type="button"
              onClick={() => setShowAllCallAssist((prev) => !prev)}
              className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAllCallAssist ? "Show less" : `Show all (${callAssistAllCards.length})`}
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground/60">
          Compact scaffolding for live calls. Adapt naturally to seller context.
        </p>
        <div className="space-y-2">
          {callAssistVisibleCards.map((card) => (
            <div key={card.id} className="rounded-[8px] border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
              <p className="text-sm font-semibold text-foreground">{card.title}</p>
              <p className="text-sm text-muted-foreground/65 mt-0.5">{card.summary}</p>
              <div className="mt-1.5 space-y-1">
                {card.talkingPoints.slice(0, 2).map((point, idx) => (
                  <p key={idx} className="text-sm text-foreground/85">
                    <span className="text-muted-foreground mr-1">&#8226;</span>{point}
                  </p>
                ))}
              </div>
              <p className="text-xs text-foreground/80 mt-1.5">{card.actionHint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ DEAL PROGRESS — collapsible for early-stage leads ═══ */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.015]">
        <button
          onClick={() => setDealProgressOpen(!dealProgressOpen)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        >
          <Briefcase className="h-3.5 w-3.5 text-foreground" />
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Deal Progress</p>
          {!isDealStage && cf.offerStatus === "none" && (
            <span className="text-xs text-muted-foreground/50">No offer activity yet</span>
          )}
          {cf.offerStatus !== "none" && !dealProgressOpen && (
            <span className="text-xs text-muted-foreground">{offerStatusLabel}</span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 ml-auto transition-transform", dealProgressOpen && "rotate-180")} />
        </button>
        <AnimatePresence>
          {dealProgressOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-3">

      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-foreground" />
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Offer Progress</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-sm px-2 py-0.5 rounded border font-medium", offerStatusToneClass)}>
            {offerStatusLabel}
          </span>
          <span className="text-sm text-muted-foreground/70">
            {offerStatusHint}
          </span>
        </div>
        {offerPrepActive && (
          <div className={cn(
            "rounded-[8px] border px-2.5 py-2 space-y-1.5",
            offerPrepStale || offerPrepMissing ? "border-white/12 bg-white/[0.05]" : "border-white/20 bg-white/[0.06]",
          )}>
            <p className="text-sm text-foreground/90">
              Workload: <span className="font-semibold">Run comps + prepare offer range</span>
            </p>
            <p className="text-sm text-muted-foreground/80">
              Next offer-prep follow-up: <span className="text-foreground font-medium">{offerPrepDueLabel}</span>
            </p>
            <p className={cn("text-sm", offerPrepStale || offerPrepMissing ? "text-foreground" : "text-foreground/80")}>
              {offerPrepStale || offerPrepMissing
                ? offerPrepHealth.hint
                : "Offer-prep path is active and on track."}
            </p>
          </div>
        )}
      </div>

      <OfferStatusTruthCard
        canEdit={canEditOfferStatus}
        editing={offerStatusEditing}
        saving={offerStatusSaving}
        draft={offerStatusDraft}
        statusLabel={offerStatusTruthLabelText}
        statusToneClass={offerStatusTruthToneClass}
        amountLabel={offerStatusAmountLabel}
        sellerResponseNote={offerStatusSnapshot.sellerResponseNote}
        updatedLabel={offerStatusUpdatedLabel}
        options={OFFER_STATUS_OPTIONS}
        onEditToggle={onOfferStatusEditToggle}
        onDraftChange={onOfferStatusDraftChange}
        onSave={onOfferStatusSave}
      />

      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-foreground" />
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Offer Prep Snapshot</p>
          <Badge variant="outline" className="text-xs border-white/[0.14] text-muted-foreground">Operator entered</Badge>
          {offerPrepHealth.state !== "not_applicable" && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                offerPrepHealth.state === "ready"
                  ? "border-white/15 text-foreground"
                  : "border-white/12 text-foreground",
              )}
            >
              {offerPrepHealth.label}
            </Badge>
          )}
          {canEditOfferPrep && (
            <button
              type="button"
              onClick={() => onOfferPrepEditToggle(!offerPrepEditing)}
              className="ml-auto text-sm text-foreground/75 hover:text-foreground transition-colors"
              disabled={offerPrepSaving}
            >
              {offerPrepEditing ? "Cancel" : "Edit"}
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground/70">
          Offer progress is derived. Offer prep snapshot is operator-entered and should reflect your current comping assumptions.
        </p>

        {offerPrepEditing ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">ARV Used</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offerPrepDraft.arvUsed}
                  onChange={(e) => onOfferPrepDraftChange({ arvUsed: e.target.value })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-white/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Rehab Estimate</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offerPrepDraft.rehabEstimate}
                  onChange={(e) => onOfferPrepDraftChange({ rehabEstimate: e.target.value })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-white/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">MAO Low</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offerPrepDraft.maoLow}
                  onChange={(e) => onOfferPrepDraftChange({ maoLow: e.target.value })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-white/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">MAO High</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offerPrepDraft.maoHigh}
                  onChange={(e) => onOfferPrepDraftChange({ maoHigh: e.target.value })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-white/30"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Confidence</span>
                <select
                  value={offerPrepDraft.confidence}
                  onChange={(e) => onOfferPrepDraftChange({ confidence: (e.target.value as OfferPrepConfidence | "") })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-white/30"
                >
                  <option value="">Select confidence</option>
                  {OFFER_PREP_CONFIDENCE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Sheet / Calculator Link (optional)</span>
                <input
                  type="url"
                  value={offerPrepDraft.sheetUrl}
                  onChange={(e) => onOfferPrepDraftChange({ sheetUrl: e.target.value })}
                  placeholder="https://docs.google.com/..."
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus:border-white/30"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground/65">
                Last updated: <span className="text-foreground/85">{offerPrepUpdatedLabel}</span>
              </p>
              <Button size="sm" className="h-7 text-sm" disabled={offerPrepSaving} onClick={onOfferPrepSave}>
                {offerPrepSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save Snapshot
              </Button>
            </div>
          </div>
        ) : (() => {
          const allEmpty = offerPrepSnapshot.arvUsed == null && offerPrepSnapshot.rehabEstimate == null && offerPrepSnapshot.maoLow == null && offerPrepSnapshot.maoHigh == null && !offerPrepSnapshot.confidence && !offerPrepSnapshot.updatedAt;
          if (allEmpty && !offerPrepExpanded) {
            return (
              <div className="flex items-center gap-2 text-sm">
                <p className="text-muted-foreground">Offer details: Not started yet</p>
                <button type="button" onClick={() => setOfferPrepExpanded(true)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">[Show details]</button>
              </div>
            );
          }
          return (
            <div className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <p className="text-muted-foreground">ARV Used: <span className="text-foreground font-medium">{offerPrepSnapshot.arvUsed != null ? formatCurrency(offerPrepSnapshot.arvUsed) : "Not set"}</span></p>
                <p className="text-muted-foreground">Rehab: <span className="text-foreground font-medium">{offerPrepSnapshot.rehabEstimate != null ? formatCurrency(offerPrepSnapshot.rehabEstimate) : "Not set"}</span></p>
                <p className="text-muted-foreground">MAO Low: <span className="text-foreground font-medium">{offerPrepSnapshot.maoLow != null ? formatCurrency(offerPrepSnapshot.maoLow) : "Not set"}</span></p>
                <p className="text-muted-foreground">MAO High: <span className="text-foreground font-medium">{offerPrepSnapshot.maoHigh != null ? formatCurrency(offerPrepSnapshot.maoHigh) : "Not set"}</span></p>
                <p className="text-muted-foreground">Confidence: <span className="text-foreground font-medium">{offerPrepSnapshot.confidence ? offerPrepSnapshot.confidence[0].toUpperCase() + offerPrepSnapshot.confidence.slice(1) : "Not set"}</span></p>
                <p className="text-muted-foreground">Last updated: <span className="text-foreground font-medium">{offerPrepUpdatedLabel}</span></p>
              </div>
              {offerPrepSnapshot.sheetUrl && (
                <a
                  href={offerPrepSnapshot.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-foreground/80 hover:text-foreground"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  Open comp/calculator sheet
                </a>
              )}
            </div>
          );
        })()}
      </div>

      <BuyerDispoVisibilityCard
        actionMissing={buyerDispoActionMissing}
        actionStale={buyerDispoActionStale}
        buyerFitLabel={buyerFitLabel}
        buyerFitToneClass={buyerFitToneClass}
        dispoReadinessLabel={dispoReadinessLabel}
        dispoReadinessToneClass={dispoReadinessToneClass}
        hint={buyerDispo.hint}
        nextStep={buyerDispo.nextStep}
        readinessHigh={buyerDispoReadinessHigh}
        nextActionLabel={buyerDispoNextActionLabel}
      />

      <BuyerDispoTruthCard
        canEdit={canEditBuyerDispoTruth}
        editing={buyerDispoTruthEditing}
        saving={buyerDispoTruthSaving}
        draft={buyerDispoTruthDraft}
        buyerFitLabel={buyerDispoTruthBuyerFitLabel}
        buyerFitToneClass={buyerDispoTruthFitToneClass}
        dispoStatusLabel={buyerDispoTruthStatusLabel}
        dispoStatusToneClass={buyerDispoTruthStatusToneClass}
        readyLabel={buyerDispoReadyLabel}
        nextStep={buyerDispoTruthSnapshot.nextStep}
        dispoNote={buyerDispoTruthSnapshot.dispoNote}
        updatedLabel={buyerDispoTruthUpdatedLabel}
        onEditToggle={onBuyerDispoTruthEditToggle}
        onDraftChange={onBuyerDispoTruthDraftChange}
        onSave={onBuyerDispoTruthSave}
      />

      <AcquisitionsMilestoneCard
        editing={milestoneEditing}
        saving={milestoneSaving}
        draft={milestoneDraft}
        appointmentAt={cf.appointmentAt}
        offerAmount={cf.offerAmount}
        contractAt={cf.contractAt}
        assignmentFeeProjected={cf.assignmentFeeProjected}
        onEditToggle={onMilestoneEditToggle}
        onDraftChange={onMilestoneDraftChange}
        onSave={onSaveMilestones}
      />

      {/* Linked Buyers Summary — visible when lead has a deal with linked buyers */}
      <LinkedBuyersSummary leadId={cf.id} />

      {/* Buyer Radar — ranked buyer match panel; opens on demand */}
      <BuyerRadarPanel leadId={cf.id} isAdminView={isAdam} />

      {/* Monetizability Editor — Adam-only: manually set score + friction level */}
      {isAdam && (
        <MonetizabilityEditor
          leadId={cf.id}
          initialScore={cf.monetizabilityScore ?? null}
          initialFriction={cf.dispoFrictionLevel ?? null}
        />
      )}

                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

      {/* Dossier Block — renders only when a reviewed dossier exists for this lead */}
      {/* leadType: absentee_landlord detected from isAbsentee flag or tag; drives renderer + source types */}
      <DossierBlock
        leadId={cf.id}
        propertyId={cf.propertyId ?? null}
        isAdminView={isAdam}
        leadType={(cf.isAbsentee || cf.tags?.includes("absentee") || cf.tags?.includes("absentee_landlord")) ? "absentee_landlord" as LeadDossierType : undefined}
      />

      {/* Negative Intelligence — "signals worth checking"; only renders when ≥1 signal present */}
      <NegativeIntelligenceBlock cf={cf} />

      {/* Intake Guide — visible for early-stage leads (prospect/lead with 0-1 calls) */}
      <IntakeGuideSection cf={cf} />

      {showQualificationBlock && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Qualification</p>
            {!qualificationEditable && (
              <Badge variant="outline" className="text-xs ml-1 border-white/[0.14] text-muted-foreground">Read-only</Badge>
            )}
          </div>

          {qualificationEditable ? (
            <div className="space-y-3">
              <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.015] px-2.5 py-2 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="uppercase tracking-wider text-muted-foreground font-semibold">Qualification Completeness</span>
                  <span className={cn(
                    "font-semibold",
                    qualificationCompletenessRatio >= 0.8
                      ? "text-emerald-400"
                      : qualificationCompletenessRatio >= 0.4
                        ? "text-amber-400"
                        : "text-red-400"
                  )}>
                    {qualificationCompleteCount}/{qualificationCompletenessTotal}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      qualificationCompletenessRatio >= 0.8
                        ? "bg-emerald-500/80"
                        : qualificationCompletenessRatio >= 0.4
                          ? "bg-amber-500/80"
                          : "bg-red-500/80",
                    )}
                    style={{ width: `${qualificationCompletenessPct}%` }}
                  />
                </div>
                {qualificationMissingLabels.length > 0 ? (
                  <p className="text-sm text-muted-foreground/75">
                    Missing before routing: <span className="text-foreground/85">{qualificationMissingLabels.join(", ")}</span>
                  </p>
                ) : (
                  <p className="text-sm text-foreground">Core qualification inputs are complete.</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Motivation</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onQualificationChange({ motivationLevel: level })}
                        className={cn(
                          "h-7 w-7 rounded-[8px] border text-sm font-semibold transition-colors",
                          qualification.motivationLevel === level
                            ? "border-white/40 bg-white/[0.12] text-foreground"
                            : "border-white/[0.12] bg-white/[0.04] text-muted-foreground hover:border-white/[0.2]"
                        )}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Condition</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onQualificationChange({ conditionLevel: level })}
                        className={cn(
                          "h-7 w-7 rounded-[8px] border text-sm font-semibold transition-colors",
                          qualification.conditionLevel === level
                            ? "border-white/40 bg-white/[0.12] text-foreground"
                            : "border-white/[0.12] bg-white/[0.04] text-muted-foreground hover:border-white/[0.2]"
                        )}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Occupancy</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onQualificationChange({ occupancyScore: level })}
                        className={cn(
                          "h-7 w-7 rounded-[8px] border text-sm font-semibold transition-colors",
                          qualification.occupancyScore === level
                            ? "border-white/40 bg-white/[0.12] text-foreground"
                            : "border-white/[0.12] bg-white/[0.04] text-muted-foreground hover:border-white/[0.2]"
                        )}
                      >
                        {level}
                      </button>
                    ))}
                    <span className="text-xs text-muted-foreground/60 ml-1">1=occupied · 5=vacant</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Equity / Flexibility</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onQualificationChange({ equityFlexibilityScore: level })}
                        className={cn(
                          "h-7 w-7 rounded-[8px] border text-sm font-semibold transition-colors",
                          qualification.equityFlexibilityScore === level
                            ? "border-white/40 bg-white/[0.12] text-foreground"
                            : "border-white/[0.12] bg-white/[0.04] text-muted-foreground hover:border-white/[0.2]"
                        )}
                      >
                        {level}
                      </button>
                    ))}
                    <span className="text-xs text-muted-foreground/60 ml-1">1=rigid · 5=flexible</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Timeline</p>
                  <select
                    value={qualification.sellerTimeline ?? ""}
                    onChange={(e) => onQualificationChange({ sellerTimeline: (e.target.value || null) as SellerTimeline | null })}
                    className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-white/30"
                  >
                    <option value="">Not set</option>
                    {SELLER_TIMELINE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Asking Price</p>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={qualification.priceExpectation ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      onQualificationChange({
                        priceExpectation: value === "" ? null : Math.max(0, Number.parseInt(value, 10) || 0),
                      });
                    }}
                    placeholder="Optional"
                    className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-white/30"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={qualification.decisionMakerConfirmed}
                  onChange={(e) => onQualificationChange({ decisionMakerConfirmed: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-white/[0.2] bg-white/[0.04]"
                />
                Decision maker confirmed
              </label>

              {/* Qualification Score Badge */}
              {cf.qualificationScoreTotal != null && (
                <div className={cn(
                  "rounded-[8px] border px-2.5 py-2 text-sm flex items-center justify-between",
                  cf.qualificationScoreTotal >= 25
                    ? "border-white/15 bg-white/[0.06] text-foreground"
                    : cf.qualificationScoreTotal >= 18
                      ? "border-white/20 bg-white/[0.06] text-foreground"
                      : cf.qualificationScoreTotal >= 12
                        ? "border-white/12 bg-white/[0.05] text-foreground"
                        : "border-border/20 bg-muted/[0.06] text-foreground"
                )}>
                  <span>
                    Score: <span className="font-semibold">{cf.qualificationScoreTotal}/35</span>
                    {cf.qualificationScoreTotal >= 25 && " — Offer Ready"}
                    {cf.qualificationScoreTotal >= 18 && cf.qualificationScoreTotal < 25 && " — Follow Up"}
                    {cf.qualificationScoreTotal >= 12 && cf.qualificationScoreTotal < 18 && " — Nurture"}
                    {cf.qualificationScoreTotal < 12 && " — Likely Dead"}
                  </span>
                </div>
              )}
              {offerReadySuggested && cf.qualificationScoreTotal == null && (
                <div className="rounded-[8px] border border-white/15 bg-white/[0.06] px-2.5 py-2 text-sm text-foreground">
                  Suggestion: this lead looks <span className="font-semibold">Offer Ready</span> based on motivation, timeline, and lead score.
                </div>
              )}
              {qualificationSuggestedRoute && qualificationSuggestedRoute !== qualification.qualificationRoute && (
                <div className="rounded-[8px] border border-white/20 bg-white/[0.06] px-2.5 py-2 text-sm text-foreground flex items-center justify-between gap-2">
                  <span>
                    Server suggestion: <span className="font-semibold">{qualificationRouteLabel(qualificationSuggestedRoute)}</span>
                  </span>
                  <Button
                    size="sm"
                    className="h-6 text-sm"
                    disabled={qualificationSaving}
                    onClick={() => onQualificationRouteSelect(qualificationSuggestedRoute)}
                  >
                    Accept suggestion
                  </Button>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Route</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {QUALIFICATION_ROUTE_OPTIONS.map((route) => (
                    <button
                      key={route.id}
                      type="button"
                      disabled={qualificationSaving}
                      onClick={() => onQualificationRouteSelect(route.id)}
                      className={cn(
                        "h-7 px-2.5 rounded-[8px] border text-sm font-medium transition-colors",
                        qualification.qualificationRoute === route.id
                          ? "border-white/40 bg-white/[0.12] text-foreground"
                          : "border-white/[0.12] bg-white/[0.04] text-muted-foreground hover:border-white/[0.2]",
                        qualificationSaving && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {route.label}
                    </button>
                  ))}
                  <Button
                    size="sm"
                    className="h-7 text-sm ml-auto"
                    disabled={qualificationSaving || !qualificationDirty}
                    onClick={onQualificationSave}
                  >
                    {qualificationSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </Button>
                </div>
                {qualification.qualificationRoute === "escalate" && (
                  <p className={cn("text-sm", cf.assignedTo ? "text-foreground/85" : "text-foreground")}>
                    {cf.assignedTo
                      ? "Escalation creates an Adam review task. Ownership stays with the current assignee until manually reassigned."
                      : "Escalation requires an assigned owner first. Claim or assign this lead before saving."}
                  </p>
                )}
                {qualification.qualificationRoute === "offer_ready" && (
                  <p className="text-sm text-foreground/85">
                    Offer Ready creates an offer-prep task and keeps this lead on an active offer-prep follow-up path.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {qualification.motivationLevel != null && <p className="text-muted-foreground">Motivation: <span className="text-foreground font-medium">{qualification.motivationLevel}/5</span></p>}
              {qualification.conditionLevel != null && <p className="text-muted-foreground">Condition: <span className="text-foreground font-medium">{qualification.conditionLevel}/5</span></p>}
              {qualification.occupancyScore != null && <p className="text-muted-foreground">Occupancy: <span className="text-foreground font-medium">{qualification.occupancyScore}/5</span></p>}
              {qualification.equityFlexibilityScore != null && <p className="text-muted-foreground">Equity/Flex: <span className="text-foreground font-medium">{qualification.equityFlexibilityScore}/5</span></p>}
              {qualification.sellerTimeline && <p className="text-muted-foreground">Timeline: <span className="text-foreground font-medium">{qualification.sellerTimeline.replace("_", " ")}</span></p>}
              {qualification.priceExpectation != null && <p className="text-muted-foreground">Asking Price: <span className="text-foreground font-medium">{formatCurrency(qualification.priceExpectation)}</span></p>}
              {qualification.qualificationRoute && <p className="text-muted-foreground">Route: <span className="text-foreground font-medium">{qualificationRouteLabel(qualification.qualificationRoute)}</span></p>}
              {qualification.qualificationRoute === "escalate" && (
                <p className="text-foreground/85">
                  Escalated for Adam review. Ownership remains with {cf.assignedTo ? "the assigned operator" : "the current claimant once assigned"}.
                </p>
              )}
              {qualification.qualificationRoute === "offer_ready" && (
                <p className={cn(offerPrepStale ? "text-foreground/85" : "text-foreground/85")}>
                  Offer-prep follow-up: {offerPrepDueLabel}{offerPrepStale ? " (stale)" : ""}
                </p>
              )}
              <p className="text-muted-foreground">Decision Maker: <span className="text-foreground font-medium">{qualification.decisionMakerConfirmed ? "Confirmed" : "Not confirmed"}</span></p>
              {cf.qualificationScoreTotal != null && (
                <p className={cn(
                  "font-medium",
                  cf.qualificationScoreTotal >= 25 ? "text-emerald-400" : cf.qualificationScoreTotal >= 18 ? "text-blue-400" : cf.qualificationScoreTotal >= 12 ? "text-amber-400" : "text-red-400"
                )}>
                  Score: {cf.qualificationScoreTotal}/35
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Advanced intelligence + metadata (collapsed by default) */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.015]">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="w-full flex items-center gap-2 p-4 text-left"
        >
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Advanced</p>
          <span className="text-xs text-muted-foreground/50">
            {hasDeepIntel ? "Deep Crawl + Metadata" : "Intelligence tools"}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 ml-auto transition-transform", advancedOpen && "rotate-180")} />
        </button>

        <AnimatePresence>
          {advancedOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Deep Crawl Intelligence</p>
                    {deepCrawlResult ? (
                      <button
                        onClick={() => setDeepCrawlExpanded(!deepCrawlExpanded)}
                        className="h-6 px-2.5 rounded-md text-xs font-semibold border flex items-center gap-1 transition-colors border-white/15 bg-white/[0.06] text-foreground hover:bg-white/[0.06]"
                      >
                        <FileText className="h-3 w-3" />
                        {deepCrawlExpanded ? "Hide Report" : "Deep Crawl Report"}
                      </button>
                    ) : hasSavedReport ? (
                      <button
                        onClick={loadSavedReport}
                        disabled={loadingReport}
                        className="h-6 px-2.5 rounded-md text-xs font-semibold border flex items-center gap-1 transition-colors border-white/15 bg-white/[0.06] text-foreground hover:bg-white/[0.06]"
                      >
                        {loadingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                        {loadingReport ? "Loading Report..." : "View Saved Report"}
                      </button>
                    ) : (
                      <button
                        onClick={executeDeepCrawl}
                        disabled={deepCrawling}
                        className="h-6 px-2.5 rounded-md text-xs font-semibold border flex items-center gap-1 transition-colors border-white/12 bg-white/[0.05] text-muted-foreground hover:bg-white/[0.05]"
                      >
                        {deepCrawling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        {deepCrawling ? "Deep Crawling..." : "~120s Deep Crawl"}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground/60">
                    Detailed intelligence and metadata are hidden by default to keep the operator workflow focused.
                  </p>
                </div>

                {/* SSE Progress Indicator (during active crawl) */}
                {deepCrawling && crawlSteps.length > 0 && !deepCrawlResult && (
                  <CrawlProgressIndicator steps={crawlSteps} />
                )}

                {/* Deep Crawl Report */}
                {deepCrawlResult && deepCrawlExpanded && (
                  <DeepCrawlPanel result={deepCrawlResult} onRecrawl={executeDeepCrawl} isRecrawling={deepCrawling} />
                )}

                {/* Deep Skip Report (people intelligence) */}
                {deepCrawlExpanded && (deepSkipResult || deepCrawlResult?.deepSkip) && (
                  <DeepSkipPanel result={deepSkipResult ?? deepCrawlResult?.deepSkip} />
                )}

                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-2">Metadata</p>
                  <div className="grid grid-cols-2 gap-x-6">
                    <InfoRow icon={Zap} label="Source" value={cf.source} />
                    <InfoRow icon={Clock} label="Promoted" value={cf.promotedAt ? new Date(cf.promotedAt).toLocaleDateString() : null} />
                    <InfoRow icon={Clock} label="Last Contact" value={cf.lastContactAt ? new Date(cf.lastContactAt).toLocaleDateString() : null} />
                    <InfoRow icon={Calendar} label="Follow-Up" value={cf.followUpDate ? new Date(cf.followUpDate).toLocaleDateString() : null} />
                    <InfoRow icon={Copy} label="Model Version" value={cf.modelVersion} />
                    <InfoRow icon={ExternalLink} label="Radar ID" value={cf.radarId} mono />
                    <InfoRow icon={Clock} label="Last Enriched" value={cf.ownerFlags?.last_enriched ? new Date(cf.ownerFlags.last_enriched as string).toLocaleString() : (cf.enriched ? "Enriched (time unknown)" : null)} highlight={!!cf.ownerFlags?.last_enriched} />
                  </div>
                  {cf.notes && (
                    <div className="mt-2">
                      <p className="text-sm text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
                      <p className="text-xs text-foreground/80">{cf.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* â•â•â• 6. LEAD INTELLIGENCE — 4 Tiles â•â•â• */}
      <div className="rounded-[12px] border border-white/15 bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-foreground" />
          <p className="text-sm text-foreground/80 uppercase tracking-wider font-semibold">Lead Intelligence</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Composite Score */}
          <button
            type="button"
            onClick={() => setScoreBreakdown("composite")}
            className={cn("rounded-[10px] border p-3 text-left transition-all cursor-pointer hover:bg-white/[0.04] group relative overflow-hidden", tc.border, tc.hoverBorder)}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between mb-1 relative z-10">
              <p className="text-xs text-muted-foreground/60 uppercase tracking-widest">Match Score</p>
              <span className="text-xs text-foreground/40 group-hover:text-muted-foreground transition-colors">drill &rarr;</span>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <p className="text-3xl font-black tabular-nums" style={{ textShadow: `0 0 12px ${tc.glow}` }}>{cf.compositeScore}</p>
              <div>
                <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wider", tc.text, `${tc.bar}/20`)}>{{ platinum: "Top priority", gold: "High priority", silver: "Medium", bronze: "Low priority" }[tier]}</span>
                <p className="text-xs text-muted-foreground/50 mt-0.5">{cf.tags.length} signal{cf.tags.length !== 1 ? "s" : ""} stacked</p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden relative z-10">
              <div className={cn("h-full rounded-full transition-all", tc.bar)} style={{ width: `${Math.min(cf.compositeScore, 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground/40 mt-1 relative z-10">Score ranges: 0-30 Low, 31-50 Medium, 51-75 High, 76-100 Top</p>
          </button>

          {/* Equity & Spread */}
          <button
            type="button"
            onClick={() => scrollTo(sectionEquity)}
            className={cn("rounded-[10px] border p-3 relative overflow-hidden text-left transition-all cursor-pointer hover:bg-white/[0.04] group",
              equityIsGreen ? "border-white/15 bg-white/[0.06] hover:border-white/15" : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12]"
            )}
          >
            {equityIsGreen && <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />}
            <div className="flex items-center justify-between mb-1 relative z-10">
              <p className="text-xs text-muted-foreground/60 uppercase tracking-widest">Equity &amp; Spread</p>
              <span className="text-xs text-foreground group-hover:text-foreground transition-colors">details &rarr;</span>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <p className={cn("text-3xl font-black tabular-nums", equityIsGreen ? "text-foreground" : "text-foreground")}
                style={{ textShadow: equityIsGreen ? "0 0 16px rgba(52,211,153,0.35)" : undefined }}>
                {cf.equityPercent != null ? `${cf.equityPercent}%` : "N/A"}
              </p>
              <div className="text-sm text-muted-foreground space-y-0.5">
                {cf.estimatedValue != null && <p>AVM {formatCurrency(cf.estimatedValue)}</p>}
                {cf.availableEquity != null && <p>{formatCurrency(cf.availableEquity)} avail.</p>}
                {estimatedOwed != null && <p>Owed ~{formatCurrency(estimatedOwed)}</p>}
              </div>
            </div>
            {roomLabel && (
              <p className={cn("text-xs mt-1.5 relative z-10 font-semibold", roomColor.split(" ")[0])}>
                {roomLabel === "HIGH SPREAD" ? "Room to negotiate — strong equity" : roomLabel === "MODERATE" ? "Some room — watch margins" : "Tight spread — proceed with caution"}
              </p>
            )}
          </button>

          {/* Signal Freshness */}
          <button
            type="button"
            onClick={() => scrollTo(sectionSignals)}
            className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3 text-left transition-all cursor-pointer hover:bg-white/[0.04] hover:border-white/[0.12] group"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground/60 uppercase tracking-widest">Signal Freshness</p>
              <span className="text-xs text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors">timeline &rarr;</span>
            </div>
            {freshestEvent ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-black text-muted-foreground" style={{ textShadow: "0 0 12px rgba(251,146,60,0.3)" }}>
                    {freshestDays != null && freshestDays <= 0 ? "Today" : `${freshestDays}d`}
                  </p>
                  <p className="text-xs text-muted-foreground/50">since newest</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-semibold">
                  {freshestDays != null && freshestDays <= 7 ? "Very fresh — call ASAP before competitors" :
                   freshestDays != null && freshestDays <= 30 ? "Recent signal — still a warm window" :
                   "Aging signal — may need re-verification"}
                </p>
              </>
            ) : cf.tags.length > 0 ? (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground/60">{cf.tags.length} signal{cf.tags.length !== 1 ? "s" : ""} detected</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/40 italic">No active signals</p>
            )}
          </button>

          {/* Owner Situation */}
          <button
            type="button"
            onClick={() => scrollTo(sectionOwner)}
            className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3 text-left transition-all cursor-pointer hover:bg-white/[0.04] hover:border-white/[0.12] group"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground/60 uppercase tracking-widest">Owner Situation</p>
              <span className="text-xs text-foreground/40 group-hover:text-muted-foreground transition-colors">contact &rarr;</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {cf.isAbsentee ? (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white/[0.06]/10 text-foreground border border-white/12">ABSENTEE</span>
                ) : (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white/[0.06]/10 text-foreground border border-white/15">Owner-Occupied</span>
                )}
                {cf.isFreeClear && <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white/[0.05]/10 text-muted-foreground border border-white/12">FREE &amp; CLEAR</span>}
                {cf.isVacant && <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white/[0.05]/10 text-muted-foreground border border-white/12">Vacant Property</span>}
              </div>
              <p className="text-xs text-muted-foreground/70 font-semibold">
                {cf.isAbsentee && ownerAge && ownerAge >= 65 ? "Elderly absentee — likely estate/caretaker situation" :
                 cf.isAbsentee ? "Absentee owner — may be motivated to offload" :
                 cf.isFreeClear ? "Free & clear — no mortgage pressure, but no urgency either" :
                 yearsOwned != null && yearsOwned >= 20 ? `${yearsOwned}yr owner — long tenure, may be ready to move` :
                 ownerAge ? `Owner ~${ownerAge} — ${ownerAge >= 65 ? "senior, life transition likely" : "younger owner"}` :
                 "Standard owner situation"}
              </p>
            </div>
          </button>
        </div>
      </div>

      {scoreBreakdown && (
        <ScoreBreakdownModal cf={cf} scoreType={scoreBreakdown} onClose={() => setScoreBreakdown(null)} />
      )}

      {/* â"€â"€ Quick Call Summary (compact inline) â"€â"€ */}
      {(cf.totalCalls > 0 || cf.lastContactAt) && (
        <div className="flex items-center gap-3 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <Phone className="h-3.5 w-3.5 text-foreground shrink-0" />
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold shrink-0">Call Summary</p>
          <div className="flex items-center gap-2 ml-2 text-sm text-foreground/80 flex-wrap">
            {cf.lastContactAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground/50" />
                Last called: <span className="font-medium text-foreground">{(() => {
                  const diff = Date.now() - new Date(cf.lastContactAt).getTime();
                  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                  if (days === 0) return "Today";
                  if (days === 1) return "1d ago";
                  return `${days}d ago`;
                })()}</span>
              </span>
            )}
            {cf.lastContactAt && cf.totalCalls > 0 && <span className="text-muted-foreground/30">|</span>}
            {cf.totalCalls > 0 && (
              <span>Total: <span className="font-medium text-foreground">{cf.totalCalls}</span></span>
            )}
            {cf.liveAnswers > 0 && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>Live: <span className="font-medium text-foreground">{cf.liveAnswers}</span></span>
              </>
            )}
            {cf.voicemailsLeft > 0 && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>VM: <span className="font-medium text-foreground">{cf.voicemailsLeft}</span></span>
              </>
            )}
            {callHistory.length > 0 && callHistory[0].disposition && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>Last: <span className="font-medium text-muted-foreground">{callHistory[0].disposition}</span></span>
              </>
            )}
          </div>
          {cf.nextCallScheduledAt && (
            <span className="ml-auto text-sm text-muted-foreground flex items-center gap-1 shrink-0">
              <Calendar className="h-3 w-3" />
              Next: {new Date(cf.nextCallScheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      )}

      {/* â"€â"€ Call Playbook — Grok AI (upgraded pre-call brief) â"€â"€ */}
      {brief || briefLoading ? (
        <div className="rounded-[12px] border border-white/12 bg-white/[0.05] p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-white/[0.03] pointer-events-none" />
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div className="flex items-center gap-2 mb-3 relative z-10">
            <div className="h-7 w-7 rounded-[8px] bg-white/[0.05]/15 flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Call Playbook</p>
            <Badge variant="outline" className="text-xs border-white/12 text-muted-foreground ml-1">GROK AI</Badge>
            {briefLoading && <Loader2 className="h-3 w-3 text-muted-foreground animate-spin ml-auto" />}
            {!briefLoading && (
              <button
                onClick={regenerateBrief}
                className="ml-auto p-1 rounded-md hover:bg-white/[0.05]/10 transition-colors text-muted-foreground hover:text-muted-foreground"
                title="Regenerate playbook"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="relative z-10 space-y-3">
            {brief ? (
              <>
                {/* Key Bullets */}
                <div className="space-y-1.5">
                  {brief.bullets.map((bullet, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground mt-0.5 shrink-0">&#9670;</span>
                      <p className="text-foreground/90 leading-relaxed">{bullet}</p>
                    </div>
                  ))}
                </div>

                {/* Suggested Opener */}
                {brief.suggestedOpener && (
                  <div className="pt-2 border-t border-white/12">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Suggested Opener</p>
                    <p className="text-xs text-foreground/80 italic leading-relaxed">&ldquo;{brief.suggestedOpener}&rdquo;</p>
                  </div>
                )}

                {/* Talking Points */}
                {brief.talkingPoints.length > 0 && (
                  <div className="pt-2 border-t border-white/12">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Talking Points</p>
                    <div className="space-y-1">
                      {brief.talkingPoints.map((tp, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground mt-0.5 shrink-0 text-sm">{i + 1}.</span>
                          <p className="text-foreground/80 leading-relaxed">{tp}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Objections & Rebuttals */}
                {brief.objections.length > 0 && (
                  <div className="pt-2 border-t border-white/12">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Likely Objections</p>
                    <div className="space-y-2">
                      {brief.objections.map((obj, i) => (
                        <div key={i} className="rounded-[8px] border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                          <p className="text-xs text-foreground font-medium">&ldquo;{obj.objection}&rdquo;</p>
                          <p className="text-xs text-foreground mt-1 pl-3 border-l-2 border-white/15">{obj.rebuttal}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Negotiation Anchor */}
                {brief.negotiationAnchor && (
                  <div className="pt-2 border-t border-white/12">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Negotiation Anchor</p>
                    <p className="text-xs text-foreground/90 font-semibold">{brief.negotiationAnchor}</p>
                  </div>
                )}

                {/* Watch-Outs */}
                {brief.watchOuts.length > 0 && (
                  <div className="pt-2 border-t border-white/12">
                    <p className="text-xs text-foreground uppercase tracking-widest mb-1">Watch-Outs</p>
                    <div className="space-y-1">
                      {brief.watchOuts.map((wo, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <p>{wo}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risk Flags / Contradictions */}
                {brief.riskFlags.length > 0 && (
                  <div className="pt-2 border-t border-white/12">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Risk Flags / Things That May Not Line Up</p>
                    <div className="space-y-1">
                      {brief.riskFlags.map((rf, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-foreground/85">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <p>{rf}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-4 gap-2">
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                <span className="text-xs text-muted-foreground">Generating playbook&hellip;</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Compact empty-state: single line instead of full card */
        <div className="flex items-center gap-2 rounded-[10px] border border-white/12 bg-white/[0.05] px-3 py-2">
          <Brain className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground/40 italic">Call script not generated yet</p>
            <p className="text-xs text-muted-foreground/30 mt-0.5">AI will create a script based on property data and owner situation</p>
          </div>
          <button
            onClick={regenerateBrief}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md text-sm text-muted-foreground hover:text-muted-foreground hover:bg-white/[0.05]/10 transition-colors"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Generate Call Script
          </button>
        </div>
      )}

      {/* â•â•â• 8. CALL HISTORY + AI NOTES (merged) â•â•â• */}
      {(cf.totalCalls > 0 || cf.nextCallScheduledAt || summaryNotes.length > 0) && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <PhoneForwarded className="h-3.5 w-3.5 text-foreground" />
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Call History &amp; Notes</p>
            {cf.totalCalls > 0 && (
              <span className="text-sm text-muted-foreground ml-auto font-medium">
                {getCadencePosition(cf.totalCalls).label}
              </span>
            )}
          </div>

          {cf.totalCalls > 0 && (
            <>
              <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: `${(getCadencePosition(cf.totalCalls).touchNumber / getCadencePosition(cf.totalCalls).totalTouches) * 100}%`,
                    background: "linear-gradient(90deg, rgba(255,255,255,0.6), rgba(255,255,255,0.6))",
                    boxShadow: "0 0 8px rgba(255,255,255,0.3)",
                  }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
                  <Phone className="h-3 w-3 text-foreground mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{cf.totalCalls}</p>
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">Total Calls</p>
                </div>
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
                  <PhoneForwarded className="h-3 w-3 text-foreground mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{cf.liveAnswers}</p>
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">Live Answers</p>
                </div>
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
                  <Voicemail className="h-3 w-3 text-foreground mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{cf.voicemailsLeft}</p>
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">Voicemails</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {cf.lastContactAt && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground/60">
                    <Clock className="h-3 w-3" />
                    <span>Last: {new Date(cf.lastContactAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(cf.lastContactAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                )}
                {cf.nextCallScheduledAt && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground ml-auto">
                    <Calendar className="h-3 w-3" />
                    <span>Next: {new Date(cf.nextCallScheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(cf.nextCallScheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* AI Call Notes inline */}
          {summaryNotes.length > 0 && (
            <>
              {cf.totalCalls > 0 && <div className="border-t border-white/[0.06]" />}
              <button
                onClick={() => setNotesExpanded(!notesExpanded)}
                className="w-full flex items-center gap-2 text-left"
              >
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">AI Call Notes</p>
                <Badge variant="outline" className="text-xs ml-1 border-white/12 text-muted-foreground">{summaryNotes.length}</Badge>
                <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 ml-auto transition-transform", notesExpanded && "rotate-90")} />
              </button>

              <AnimatePresence>
                {notesExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-2"
                  >
                    {summaryNotes.map((note) => (
                      <div key={note.id} className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">{note.disposition}</span>
                          <span className="text-xs text-muted-foreground/40">
                            {new Date(note.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {" "}
                            {new Date(note.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                          {note.duration_sec > 0 && (
                            <span className="text-xs text-muted-foreground/40 ml-auto">{Math.floor(note.duration_sec / 60)}:{(note.duration_sec % 60).toString().padStart(2, "0")}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground/80 leading-relaxed whitespace-pre-line">{note.ai_summary}</p>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {!notesExpanded && summaryNotes[0] && (
                <p className="text-sm text-muted-foreground/60 leading-relaxed line-clamp-3 whitespace-pre-line">{summaryNotes[0].ai_summary}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* â•â•â• 9. PROPERTY DETAILS — Tax/Transfer + Predictive (no address — moved to Snapshot) â•â•â• */}
      <div ref={sectionEquity} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Home className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Property Details</p>
          {(cf.bedrooms == null || cf.sqft == null || cf.yearBuilt == null) && (
            <Button
              size="sm"
              variant="outline"
              className="text-sm h-6 gap-1 ml-auto text-foreground border-white/20 hover:bg-white/10"
              onClick={onAutofill}
              disabled={autofilling}
            >
              {autofilling ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
              {autofilling ? "Looking up..." : "Autofill Details"}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Tax & Transfer Details */}
          {(prRaw.AssessedValue || lastTransferType || cf.lastSalePrice) && (
            <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 col-span-2">
              <div className="flex items-start gap-2">
                <Banknote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-1">Tax &amp; Transfer</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    {prRaw.AssessedValue && (
                      <p className="text-muted-foreground">Tax Assessed: <span className="text-foreground font-medium">{formatCurrency(Number(prRaw.AssessedValue))}</span></p>
                    )}
                    {cf.lastSalePrice != null && (
                      <p className="text-muted-foreground">Last Sale: <span className="text-foreground font-medium">{formatCurrency(cf.lastSalePrice)}</span>{cf.lastSaleDate ? ` (${new Date(cf.lastSaleDate).toLocaleDateString()})` : ""}</p>
                    )}
                    {lastTransferType && (
                      <p className="text-muted-foreground">Transfer: <span className="text-foreground font-medium">{lastTransferType}</span>{lastTransferValue ? ` — ${formatCurrency(lastTransferValue)}` : ""}</p>
                    )}
                    {prRaw.DelinquentYear && (
                      <p className="text-muted-foreground">Delinquent: <span className="font-medium">Year {prRaw.DelinquentYear}</span>{prRaw.NumberDelinquentInstallments ? ` (${prRaw.NumberDelinquentInstallments} installments)` : ""}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Predictive Intelligence */}
          {cf.prediction ? (
            <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 col-span-2">
              <div className="flex items-start gap-2">
                <Zap className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-1">Predictive Intelligence</p>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground/50 uppercase tracking-widest">Distress In</p>
                      <p className="text-lg font-bold text-muted-foreground" style={{ textShadow: "0 0 10px rgba(251,146,60,0.3)" }}>~{cf.prediction.daysUntilDistress}d</p>
                    </div>
                    <div className="h-8 w-px bg-white/[0.06]" />
                    <div>
                      <p className="text-xs text-muted-foreground/50 uppercase tracking-widest">Confidence</p>
                      <p className="text-lg font-bold text-foreground" style={{ textShadow: "0 0 10px rgba(255,255,255,0.08)" }}>{cf.prediction.confidence}%</p>
                    </div>
                    <div className="h-8 w-px bg-white/[0.06]" />
                    <div>
                      <p className="text-xs text-muted-foreground/50 uppercase tracking-widest">Pred Score</p>
                      <p className="text-lg font-bold text-foreground">{cf.prediction.predictiveScore}</p>
                    </div>
                    {cf.prediction.lifeEventProbability != null && cf.prediction.lifeEventProbability > 0.10 && (
                      <>
                        <div className="h-8 w-px bg-white/[0.06]" />
                        <div>
                          <p className="text-xs text-muted-foreground/50 uppercase tracking-widest">Life Event</p>
                          <p className="text-lg font-bold text-foreground" style={{ textShadow: "0 1px 0 rgba(255,255,255,0.05)" }}>{Math.round(cf.prediction.lifeEventProbability * 100)}%</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.04] bg-white/[0.015] px-2.5 py-1.5 col-span-2">
              <Zap className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <p className="text-sm text-muted-foreground/35 italic">No predictive data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* â•â•â• 10. EDIT DETAILS â•â•â• */}
      {canEdit && (
        <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-sm font-semibold text-foreground bg-white/[0.06] border border-white/15 hover:bg-white/[0.1] hover:border-white/20 shadow-[var(--shadow-badge-glow-tight)] transition-all active:scale-[0.97]">
          <Pencil className="h-3 w-3" />Edit Details
        </button>
      )}

      {/* 12. Full Activity Timeline */}
      {activityLog.length > 0 && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02]">
          <button
            onClick={() => setTimelinesOpen(!timelinesOpen)}
            className="w-full flex items-center gap-2 p-4 text-left"
          >
            <Clock className="h-3.5 w-3.5 text-foreground" />
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Full Activity Timeline</p>
            <Badge variant="outline" className="text-xs ml-1">{activityLog.length}</Badge>
            <span className="text-xs text-muted-foreground/45">calls, texts, updates</span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 ml-auto transition-transform", timelinesOpen && "rotate-180")} />
          </button>
          <AnimatePresence>
            {timelinesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-2 max-h-56 overflow-y-auto scrollbar-thin">
                  {activityLog.map((entry) => {
                    const isCall = entry.type === "call";
                    const isSms = entry.type === "sms";
                    const EntryIcon = isCall ? Phone : isSms ? MessageSquare : Zap;
                    const iconColor = isCall ? "text-foreground" : isSms ? "text-foreground" : "text-muted-foreground";
                    const dispositionLabel = entry.disposition?.replace(/_/g, " ") ?? entry.type;
                    const noteText = entry.notes?.replace(/\s+/g, " ").trim() ?? "";
                    const notePreview = noteText.length === 0
                      ? null
                      : noteText.startsWith("{")
                        ? "Event details logged"
                        : (noteText.length > 96 ? `${noteText.slice(0, 96)}...` : noteText);
                    return (
                      <div key={entry.id} className="flex items-start justify-between gap-2.5 px-3 py-2.5 rounded-[8px] border border-white/[0.04] bg-white/[0.02] text-xs">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <EntryIcon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", iconColor)} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-foreground capitalize">{dispositionLabel}</span>
                              {entry.phone && <span className="text-muted-foreground/50 font-mono">***{entry.phone.slice(-4)}</span>}
                              {entry.duration_sec != null && entry.duration_sec > 0 && (
                                <span className="text-muted-foreground/50">{Math.floor(entry.duration_sec / 60)}:{(entry.duration_sec % 60).toString().padStart(2, "0")}</span>
                              )}
                            </div>
                            {notePreview && (
                              <p className="text-sm text-muted-foreground/60 mt-0.5 truncate max-w-[420px]">{notePreview}</p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-muted-foreground/45">
                            {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                            {new Date(entry.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </p>
                          <p className="text-xs text-muted-foreground/35">{formatRelativeFromNow(entry.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* External links moved to section 3 (side-by-side with distress signals) */}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: PropertyRadar Data
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
          <span>Enriched from PropertyRadar{cf.radarId ? ` — RadarID: ${cf.radarId}` : ""}</span>
        </div>
      )}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: County Records
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
          <InfoRow icon={User} label="Owner" value={cf.ownerName} />
        </div>

        {countyInfo ? (
          <div className="space-y-2">
            <a href={countyInfo.gis(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                <Map className="h-3.5 w-3.5 text-foreground" />GIS / Parcel Map — {countyInfo.name}
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
            <a href={countyInfo.assessor(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                <Building className="h-3.5 w-3.5 text-foreground" />Assessor&apos;s Office — {countyInfo.name}
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
            {countyInfo.treasurer && (
              <a href={countyInfo.treasurer(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                  <DollarSign className="h-3.5 w-3.5 text-foreground" />Treasurer / Tax Records — {countyInfo.name}
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: Comps & ARV — Interactive Leaflet Map + PropertyRadar Search
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function SubjectPhotoCarousel({ photos, onSkipTrace }: { photos: string[]; onSkipTrace?: () => void }) {
  const [idx, setIdx] = useState(0);

  if (photos.length === 0) {
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
        src={photos[idx]}
        alt={`Property photo ${idx + 1}`}
        className="h-full w-full object-cover"
      />
      {photos.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
            className="absolute left-1 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % photos.length)}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
            {photos.map((_, i) => (
              <div key={i} className={cn("h-1 w-1 rounded-full transition-colors", i === idx ? "bg-primary" : "bg-white/40")} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// â"€â"€ Comp detail panel with auto-fetching Zillow photo carousel â"€â"€â"€â"€â"€â"€â"€â"€

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
      } catch { /* ignore — fallback to street view / satellite */ }
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
    <div className="rounded-[10px] border border-white/20 bg-[rgba(12,12,22,0.6)] backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-white/[0.04]">
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
        <div className="w-64 h-44 shrink-0 border-r border-white/[0.06] bg-black/30 relative group">
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
                  <span className="absolute bottom-1.5 right-2 text-xs bg-black/60 text-white/80 px-1.5 py-0.5 rounded-full">
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
            <div><span className="text-muted-foreground">Beds:</span> <span className="font-medium">{comp.beds ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Baths:</span> <span className="font-medium">{comp.baths ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Sqft:</span> <span className="font-medium">{comp.sqft?.toLocaleString() ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Year:</span> <span className="font-medium">{comp.yearBuilt ?? "—"}</span></div>
            <div><span className="text-muted-foreground">AVM:</span> <span className="font-medium text-foreground">{comp.avm ? formatCurrency(comp.avm) : "—"}</span></div>
            <div><span className="text-muted-foreground">Last Sale:</span> <span className="font-medium">{comp.lastSalePrice ? formatCurrency(comp.lastSalePrice) : "—"}</span></div>
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
            {comp.isVacant && <span className="px-1.5 py-0.5 rounded text-xs bg-white/[0.05]/10 text-muted-foreground border border-white/12">Vacant</span>}
            {comp.isAbsentee && <span className="px-1.5 py-0.5 rounded text-xs bg-white/[0.06]/10 text-foreground border border-white/12">Absentee</span>}
            {comp.isFreeAndClear && <span className="px-1.5 py-0.5 rounded text-xs bg-white/[0.06]/10 text-foreground border border-white/15">Free & Clear</span>}
            {comp.isForeclosure && <span className="px-1.5 py-0.5 rounded text-xs bg-white/[0.05]/10 text-foreground border border-white/15">Foreclosure</span>}
            {comp.isListedForSale && <span className="px-1.5 py-0.5 rounded text-xs bg-white/[0.05]/10 text-muted-foreground border border-white/12">Listed</span>}
            {comp.isRecentSale && <span className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-foreground border border-white/20">Recent Sale</span>}
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

// â"€â"€ Lat/Lng extraction with fallbacks â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// [EXTRACTED] extractLatLng -- see extracted module files
// â"€â"€ ARV adjustment helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  // â"€â"€ Lat/lng with multi-source fallback + geocoding â"€â"€
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

  // ARV adjustment state — conditionAdj lifted to parent for persistence
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

  const photos = cachedPhotos.length > 0 ? cachedPhotos : fetchedPhotos;

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
        setGeocodeError("Could not geocode — try enriching from PropertyRadar");
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
      {/* No-coords banner — graceful degradation */}
      {!hasCoords && (
        <div className="rounded-[10px] border border-dashed border-white/12 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
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
      <div className="rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] backdrop-blur-xl p-0 flex overflow-hidden">
        <div className="w-44 h-28 shrink-0 border-r border-white/[0.06] bg-white/[0.04]">
          <SubjectPhotoCarousel photos={photos} onSkipTrace={onSkipTrace} />
        </div>
        <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
          <p className="text-sm font-bold truncate" style={{ textShadow: "0 0 8px rgba(255,255,255,0.12)" }}>
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
        isScreeningMode ? "border-dashed border-white/12 bg-white/[0.05]" :
        arvConfidence === "high" ? "border-white/15 bg-white/[0.06]" :
        arvConfidence === "medium" ? "border-white/12 bg-white/[0.05]" :
        "border-white/15 bg-white/[0.05]",
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-3.5 w-3.5 text-foreground" />
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Decision Summary</span>
          </div>
          <div className="flex items-center gap-2">
            {isScreeningMode ? (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-white/12 bg-white/[0.05]/10 text-muted-foreground font-bold">
                Screening Only
              </span>
            ) : modeLabel ? (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-muted-foreground">
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
          </div>
        </div>

        {arv > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase mb-0.5">{isScreeningMode ? "Screening Estimate" : "ARV"}</p>
                <p className={cn("text-2xl font-black font-mono tracking-tight", isScreeningMode ? "text-muted-foreground" : "text-foreground")} style={isScreeningMode ? {} : { textShadow: "0 0 10px rgba(255,255,255,0.08)" }}>
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
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded border border-white/12 bg-white/[0.05]/5 text-muted-foreground">{r}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <span className={cn(
                  "text-sm px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0",
                  arvConfidence === "high" ? "bg-white/[0.06]/20 text-foreground" :
                  arvConfidence === "medium" ? "bg-white/[0.05]/20 text-muted-foreground" :
                  "bg-white/[0.05]/20 text-foreground",
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
                className="w-full mt-1 py-1.5 rounded-[6px] border border-white/30 bg-white/10 text-foreground text-sm font-semibold hover:bg-white/20 transition-colors"
              >
                Underwrite with comps
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Add comps or enrich to generate valuation</p>
        )}
      </div>


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
          <div className="rounded-[8px] border border-white/12 bg-white/[0.05] px-3 py-2 flex items-start gap-2">
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

        if (compsToShow.length === 0 && arv > 0) {
          return (
            <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 text-center">
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
                  className="rounded-[8px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 cursor-pointer hover:bg-white/[0.04] transition-colors"
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
                    if (comp.isForeclosure) flags.push({ label: "Foreclosure", color: "text-foreground border-white/15 bg-white/[0.05]/10" });
                    if (comp.isTaxDelinquent) flags.push({ label: "Tax Delinquent", color: "text-foreground border-white/15 bg-white/[0.05]/10" });
                    if (comp.isVacant) flags.push({ label: "Vacant", color: "text-muted-foreground border-white/12 bg-white/[0.05]/10" });
                    if (comp.isListedForSale) flags.push({ label: "Listed", color: "text-muted-foreground border-white/12 bg-white/[0.05]/10" });
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
        className="w-full flex items-center justify-center gap-2 py-2 rounded-[8px] border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-sm text-muted-foreground"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", researchMode && "rotate-180")} />
        {researchMode ? "Hide Research Mode" : "Research Mode \u2014 Map, all comps, score details"}
      </button>

      {/* === RESEARCH MODE CONTENT === */}
      {researchMode && (
        <>
          {/* Interactive map — requires coordinates */}
          {hasCoords ? (
            <CompsMap
              subject={subject}
              selectedComps={selectedComps}
              onAddComp={onAddComp}
              onRemoveComp={onRemoveComp}
              focusedComp={focusedComp}
            />
          ) : (
            <div className="rounded-[10px] border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
              <MapPinned className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground/60">Map requires coordinates. Retry geocode or enrich from PropertyRadar.</p>
            </div>
          )}

          {/* Selected comps table */}
          {selectedComps.length > 0 && (
            <div className="rounded-[10px] border border-white/[0.06] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-[rgba(12,12,22,0.5)] border-b border-white/[0.06]">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-foreground" />
                  Selected Comps ({selectedComps.length})
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.04]">
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
                      <tr key={comp.apn} className="border-b border-white/[0.06]/50 hover:bg-white/[0.04] cursor-pointer" onClick={() => setFocusedComp(prev => prev?.apn === comp.apn ? null : comp)}>
                        <td className="px-2 py-1.5">
                          {thumbSrc ? (
                            <div className="w-10 h-8 rounded overflow-hidden bg-black/30 border border-white/[0.06]">
                              <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-8 rounded bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
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
                        <td className="px-3 py-2 text-right">{comp.beds ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{comp.baths ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{comp.sqft?.toLocaleString() ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{comp.yearBuilt ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">{comp.avm ? formatCurrency(comp.avm) : "—"}</td>
                        <td className="px-3 py-2 text-right">{comp.lastSalePrice ? formatCurrency(comp.lastSalePrice) : "—"}</td>
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
          <div className="rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] p-3">
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
            <div className="rounded-lg border border-white/15 bg-white/4 p-4">
              <p className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Live ARV
                {selectedComps.length > 0 && (
                  <span className={cn("ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium",
                    arvConfidence === "high" ? "bg-white/[0.06]/20 text-foreground" :
                    arvConfidence === "medium" ? "bg-white/[0.05]/20 text-muted-foreground" :
                    "bg-white/[0.05]/20 text-foreground"
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
                  <div className="pt-2 mt-2 border-t border-white/15 flex justify-between">
                    <span className="font-medium">Estimated ARV</span>
                    <span className="font-bold text-foreground text-xl" style={{ textShadow: "0 0 10px rgba(255,255,255,0.1)" }}>
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
                  <div className="pt-2 mt-2 border-t border-white/15 flex justify-between">
                    <span className="font-medium">Est. ARV</span>
                    <span className="font-bold text-foreground text-xl" style={{ textShadow: "0 0 10px rgba(255,255,255,0.1)" }}>
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
                    <input type="number" value={rehabEst} onChange={(e) => setRehabEst(Number(e.target.value) || 0)} className="w-16 h-5 text-sm text-right bg-white/[0.06] border border-white/[0.1] rounded px-1 font-mono" />
                  </span>
                  <span className="font-medium text-foreground">-{formatCurrency(rehabEst)}</span>
                </div>
                <div className="pt-1.5 mt-1.5 border-t border-white/[0.06] flex justify-between">
                  <span className="font-semibold">Est. Assignment Fee</span>
                  <span className={cn("font-bold text-lg", profit >= 0 ? "text-foreground" : "text-foreground")} style={profit >= 0 ? { textShadow: "0 0 10px rgba(255,255,255,0.08)" } : {}}>
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: Offer Calculator
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function OfferCalcTab({ cf, computedArv, initialRepairs }: { cf: ClientFile; computedArv: number; initialRepairs?: number }) {
  const bestArv = computedArv > 0 ? computedArv : cf.estimatedValue ?? 0;
  const [arv, setArv] = useState(bestArv > 0 ? bestArv.toString() : "");

  // Auto-fill ARV when Comps tab computes one
  useEffect(() => { if (computedArv > 0) setArv(computedArv.toString()); }, [computedArv]);
  // Default purchase price via canonical kernel
  const defaultUnderwrite = bestArv > 0 ? calculateWholesaleUnderwrite({ arv: bestArv }) : null;
  const defaultMao = defaultUnderwrite ? defaultUnderwrite.mao.toString() : "";
  const [purchase, setPurchase] = useState(defaultMao);
  const [rehab, setRehab] = useState((initialRepairs ?? VALUATION_DEFAULTS.rehabEstimate).toString());
  const [holdMonths, setHoldMonths] = useState(VALUATION_DEFAULTS.holdMonths.toString());
  const [monthlyHold, setMonthlyHold] = useState(VALUATION_DEFAULTS.monthlyHoldCost.toString());
  const [closing, setClosing] = useState(VALUATION_DEFAULTS.closingCosts.toString());
  const [assignmentFee, setAssignmentFee] = useState(VALUATION_DEFAULTS.assignmentFeeTarget.toString());

  const arvNum = parseFloat(arv) || 0;
  const purchaseNum = parseFloat(purchase) || 0;
  const rehabNum = parseFloat(rehab) || 0;
  const holdNum = (parseFloat(holdMonths) || 0) * (parseFloat(monthlyHold) || 0);
  const closingNum = parseFloat(closing) || 0;
  const feeNum = parseFloat(assignmentFee) || 0;

  // All deal math via canonical kernel
  const dealUnderwrite = calculateWholesaleUnderwrite({
    arv: arvNum,
    arvSource: computedArv > 0 ? "comps" : "avm",
    rehabEstimate: rehabNum,
    assignmentFeeTarget: feeNum,
    holdingCosts: holdNum,
    closingCosts: closingNum,
    purchasePriceOverride: purchaseNum > 0 ? purchaseNum : undefined,
  });
  const mao = dealUnderwrite.mao;
  const totalCosts = dealUnderwrite.totalCosts;
  const grossProfit = dealUnderwrite.grossProfit;
  const netProfit = dealUnderwrite.netProfit;
  const roi = dealUnderwrite.roi != null ? dealUnderwrite.roi.toFixed(1) : null;

  return (
    <div className="space-y-4">
      <Section title="Deal Inputs" icon={Calculator}>
        {computedArv > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
            <CheckCircle2 className="h-3 w-3" />
            ARV auto-filled from Comps &amp; ARV tab
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <NumericInput label="ARV (After Repair Value)" value={arv} onChange={setArv} prefix="$" min={0} />
          <NumericInput label="Purchase Price" value={purchase} onChange={setPurchase} prefix="$" min={0} />
          <NumericInput label="Rehab Estimate" value={rehab} onChange={setRehab} prefix="$" min={0} />
          <NumericInput label="Closing Costs" value={closing} onChange={setClosing} prefix="$" min={0} />
          <NumericInput label="Holding Period (months)" value={holdMonths} onChange={setHoldMonths} min={0} max={60} allowDecimals={false} />
          <NumericInput label="Monthly Holding Cost" value={monthlyHold} onChange={setMonthlyHold} prefix="$" min={0} />
          <NumericInput label="Assignment Fee Target" value={assignmentFee} onChange={setAssignmentFee} prefix="$" min={0} />
        </div>
      </Section>

      <Section title="Profit Projection" icon={TrendingUp}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/20 bg-white/4 p-3 text-center">
            <p className="text-sm text-muted-foreground uppercase">MAO (75% Rule)</p>
            <p className="text-xl font-bold text-foreground" style={{ textShadow: "0 0 10px rgba(255,255,255,0.08)" }}>
              {mao > 0 ? formatCurrency(mao) : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">ARV &times; 0.75 &minus; Rehab</p>
          </div>
          <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.04] p-3 text-center">
            <p className="text-sm text-muted-foreground uppercase">Total Costs</p>
            <p className="text-xl font-bold">{totalCosts > 0 ? formatCurrency(totalCosts) : "—"}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Purchase + Rehab + Hold + Close</p>
          </div>
          <div className={cn("rounded-[10px] border p-3 text-center", grossProfit > 0 ? "border-white/15 bg-white/[0.06]/5" : "border-white/15 bg-white/[0.05]/5")}>
            <p className="text-sm text-muted-foreground uppercase">Gross Profit</p>
            <p className={cn("text-xl font-bold", grossProfit > 0 ? "text-foreground" : "text-foreground")}>
              {arvNum > 0 && purchaseNum > 0 ? formatCurrency(grossProfit) : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">ROI: {roi != null ? `${roi}%` : "—"}</p>
          </div>
          <div className={cn("rounded-lg border p-3 text-center", netProfit > 0 ? "border-white/20 bg-white/4" : "border-white/15 bg-white/[0.05]/5")}>
            <p className="text-sm text-muted-foreground uppercase">Net After Assignment</p>
            <p className={cn("text-xl font-bold", netProfit > 0 ? "text-foreground" : "text-foreground")} style={netProfit > 0 ? { textShadow: "0 0 10px rgba(255,255,255,0.08)" } : undefined}>
              {arvNum > 0 && purchaseNum > 0 ? formatCurrency(netProfit) : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">Gross &minus; Assignment Fee</p>
          </div>
        </div>
      </Section>

      {purchaseNum > mao && mao > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-white/[0.05]/5 border border-white/12 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Purchase price exceeds MAO by {formatCurrency(purchaseNum - mao)} — negotiate lower or increase ARV.
        </div>
      )}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: Documents / PSA
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/** Title-case a string: "dez smith" → "Dez Smith" */
function titleCase(str: string): string {
  return str.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** Display APN — hide synthetic MANUAL- prefixed values */
function displayApn(apn: string | null | undefined): string {
  if (!apn || apn.startsWith("MANUAL-")) return "Per county records";
  return apn;
}

function DocumentsTab({ cf, computedArv }: { cf: ClientFile; computedArv: number }) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const bestArv = computedArv > 0 ? computedArv : cf.estimatedValue ?? 0;
  // PSA prefill via canonical kernel
  const psaUnderwrite = bestArv > 0 ? calculateWholesaleUnderwrite({ arv: bestArv }) : null;
  const autoMao = psaUnderwrite ? formatCurrency(psaUnderwrite.mao) : "____________";

  const sellerName = titleCase(cf.ownerName ?? "");
  const countyName = titleCase(cf.county ?? "");
  const apnDisplay = displayApn(cf.apn);

  const psaBody = useMemo(() => [
    `REAL ESTATE PURCHASE AND SALE AGREEMENT`,
    ``,
    `Date: ${today}`,
    ``,
    `BUYER: Dominion Homes LLC and/or assigns`,
    `SELLER: ${sellerName}`,
    ``,
    `PROPERTY:`,
    `  Address: ${cf.fullAddress}`,
    `  APN: ${apnDisplay}`,
    `  County: ${countyName}`,
    `  Legal Description: Per county records`,
    ``,
    `PURCHASE PRICE: ${autoMao}`,
    `EARNEST MONEY: $____________`,
    `CLOSING DATE: ____________`,
    ``,
    `TERMS AND CONDITIONS:`,
    `1. This agreement is subject to buyer's inspection within 10 business days.`,
    `2. Seller shall deliver clear and marketable title at closing.`,
    `3. Buyer reserves the right to assign this contract per RCW 61.40.010.`,
    `4. All required disclosures per Washington State law shall be provided.`,
    `5. Closing shall occur at a mutually agreed title company.`,
    ``,
    `DISCLOSURE: Buyer is a licensed real estate wholesaler operating under`,
    `RCW 61.40.010 (Washington Wholesaling Act). Buyer intends to assign this`,
    `contract to a third party for a fee. Seller acknowledges this disclosure.`,
    ``,
    `SELLER: ______________________________  Date: ____________`,
    `         ${sellerName}`,
    ``,
    `BUYER:  ______________________________  Date: ____________`,
    `         Dominion Homes LLC`,
  ].join("\n"), [cf, today, autoMao, sellerName, countyName, apnDisplay]);

  const handlePrint = useCallback(() => {
    const w = window.open("", "_blank", "width=800,height=1100");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>PSA — ${cf.fullAddress}</title>
      <style>body{font-family:Courier,monospace;padding:40px;font-size:12px;line-height:1.6;white-space:pre-wrap;color:#000;}</style>
      </head><body>${psaBody}</body></html>`);
    w.document.close();
    w.print();
  }, [cf.fullAddress, psaBody]);

  const gmailUrl = useMemo(() => {
    const firstName = titleCase((cf.ownerName ?? "").split(" ")[0]);
    const subject = encodeURIComponent(`PSA — ${cf.fullAddress} — ${sellerName}`);
    const body = encodeURIComponent(`Hi ${firstName},\n\nPlease find the Purchase and Sale Agreement for the property at:\n${cf.fullAddress}\nAPN: ${apnDisplay}\n\nI'll follow up shortly to discuss terms.\n\nBest,\nAdam DesJardin\nDominion Homes LLC`);
    return `https://mail.google.com/mail/?view=cm&su=${subject}&body=${body}`;
  }, [cf, sellerName, apnDisplay]);

  return (
    <div className="space-y-4">
      {/* PSA Preview */}
      <Section title="Purchase & Sale Agreement (RCW 61.40.010)" icon={FileText}>
        <pre className="text-sm leading-relaxed text-foreground/80 bg-white/[0.02] rounded-[10px] p-4 border border-white/[0.06] overflow-auto max-h-64 whitespace-pre-wrap font-mono">
          {psaBody}
        </pre>
      </Section>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={handlePrint} className="gap-2 h-14 text-base font-bold" style={{ boxShadow: "0 0 30px rgba(0,0,0,0.35)" }}>
          <Printer className="h-5 w-5" />
          CREATE PSA
        </Button>
        <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="gap-2 h-14 text-base font-bold w-full">
            <Send className="h-5 w-5" />
            Email via Gmail
          </Button>
        </a>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-white/4 border border-white/15 rounded-md px-3 py-2">
        <Shield className="h-3.5 w-3.5 shrink-0" />
        RCW 61.40.010 compliant — wholesaler disclosure included in all documents.
      </div>

      {/* Auto-filled data summary */}
      <div className="text-sm text-muted-foreground/50 space-y-0.5">
        <p>Auto-filled from client file: {cf.ownerName} {"\u2022"} {cf.fullAddress} {"\u2022"} APN {cf.apn}</p>
        <p>Heat Score: {cf.compositeScore} ({cf.scoreLabel.toUpperCase()}) — Equity: {cf.equityPercent ?? "N/A"}% — ARV: {cf.estimatedValue ? formatCurrency(cf.estimatedValue) : "N/A"}</p>
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Main Modal
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
  // Phase 2.5 — condition adjustment lifted from CompsTab for persistence
  const [conditionAdj, setConditionAdj] = useState(
    () => typeof (incomingClientFile?.ownerFlags as any)?.offer_prep_snapshot?.condition_adj_pct === "number"
      ? ((incomingClientFile?.ownerFlags as any).offer_prep_snapshot.condition_adj_pct as number)
      : 0
  );
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [calling, setCalling] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [consentPending, setConsentPending] = useState(false);
  const [pendingPhone, setPendingPhone] = useState<string | undefined>(undefined);
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

  // â"€â"€ Deep Crawl state â"€â"€
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

  // ── Coach context: push lead state into the coach engine ──
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
        next_action_at: clientFile.followUpDate ?? clientFile.nextCallScheduledAt ?? undefined,
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

  // ── WI-7: Auto-run contradiction scan on modal open ──
  useEffect(() => {
    if (!clientFile?.id) return;

    // Fire-and-forget — don't block modal rendering
    fetch(`/api/leads/${clientFile.id}/contradiction-scan`, { method: 'POST' })
      .catch(() => {}); // Silent fail — contradictions are informational
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

  // Fetch dial history for this lead — groups calls_log by phone_dialed
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
      toast.error("Not logged in — cannot move stage");
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

      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-lock-version": String(current.lock_version ?? 0),
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          lead_id: clientFile.id,
          status: selectedStage,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          toast.error("Stage update conflict: Refresh and try again.");
        } else if (res.status === 422) {
          toast.error(`Invalid stage transition: ${data.detail ?? data.error ?? "not allowed"}`);
        } else {
          toast.error(`Stage update failed: ${data.error ?? `HTTP ${res.status}`}`);
        }
        return;
      }

      applyLeadPatchFromResponse(data);
      toast.success(`Moved to ${workflowStageLabel(selectedStage)}`);
      onRefresh?.();
    } catch (err) {
      console.error("[MCF] Move stage error:", err);
      toast.error("Stage update failed: Network error");
    } finally {
      setStageUpdating(false);
    }
  }, [applyLeadPatchFromResponse, clientFile, onRefresh, selectedStage]);

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

      // Phase 2.5 — Build full valuation snapshot via kernel + freeze comps
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
              // Phase 2.5 — full valuation packet
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
    if (!session?.access_token) {
      toast.error("Session expired - cannot save note");
      return;
    }

    setSavingNote(true);
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
          note_append: note,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`Could not save note: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }

      applyLeadPatchFromResponse(data);
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
  }, [applyLeadPatchFromResponse, clientFile, noteDraft, onRefresh]);

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
    const existingNextIso = clientFile.nextCallScheduledAt ?? clientFile.followUpDate ?? null;
    const explicitDueIntent = closeoutPresetTouched || closeoutDateTouched;
    const normalizedOutcome = closeoutOutcome.trim() || null;
    const outcomeChanged = normalizedOutcome !== (clientFile.dispositionCode ?? null);
    const nextChanged = nextIso !== existingNextIso;
    const noteText = closeoutNote.trim();
    const routeChanged = routeToApply != null && routeToApply !== (clientFile.qualificationRoute ?? null);
    const shouldSendDueDates = explicitDueIntent && nextChanged;

    if (!outcomeChanged && !shouldSendDueDates && noteText.length === 0 && !routeChanged) {
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
      toast.success("Call closeout saved");
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
    closeoutPresetTouched,
    onRefresh,
  ]);

  const handleDial = useCallback((phoneNumber?: string) => {
    const numberToDial = phoneNumber || displayPhone;
    if (!numberToDial) return;
    const digits = numberToDial.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
    router.push(`/dialer?phone=${digits}`);
  }, [displayPhone, router]);

  const grantConsentAndDial = useCallback(async () => {
    if (!clientFile) return;
    setConsentPending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/dialer/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ leadId: clientFile.id }),
      });
      if (!res.ok) {
        toast.error("Could not save consent — try again");
        return;
      }
    } catch {
      toast.error("Network error saving consent");
      return;
    } finally {
      setConsentPending(false);
    }
    setNeedsConsent(false);
    handleDial(pendingPhone);
  }, [clientFile, handleDial, pendingPhone]);

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
      toast.error("Network error — SMS failed");
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
        setSkipTraceResult(parts.length > 0 ? `Found ${parts.join(", ")}` : "Complete — no contact info found");
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

  // â"€â"€ Deep Crawl handler â"€â"€
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
        // SSE streaming mode — read events as they arrive
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
                // Final event — the full result
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
                toast.success(`Deep Crawl complete — ${event.result.sources?.join(", ") ?? "done"}`);
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
          toast.success(`Deep Crawl complete — ${data.sources?.join(", ") ?? "done"}`);
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
        // ATTOM failed — offer Zillow link
        const zUrl = data.zillow_url;
        toast.error(
          `${data.error ?? "Autofill failed"}${zUrl ? " — opening Zillow for manual lookup" : ""}`,
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

  if (!clientFile) return null;

  const overviewClientFile = clientFile;

  const lbl = SCORE_LABEL_CFG[clientFile.scoreLabel];
  const currentStage = normalizeWorkflowStage(clientFile.status);
  const currentStageLabel = workflowStageLabel(clientFile.status);
  const marketLabel = marketDisplayLabel(clientFile.county);
  const sourceLabel = sourceDisplayLabel(clientFile.source);
  const nextActionUrgency = getNextActionUrgency(clientFile);
  const urgencyToneClass =
    nextActionUrgency.tone === "danger"
      ? "text-foreground bg-white/[0.05] border-white/15"
      : nextActionUrgency.tone === "warn"
        ? "text-foreground bg-white/[0.05] border-white/12"
        : "text-foreground/80 bg-white/[0.06] border-white/20";
  const UrgencyIcon = nextActionUrgency.tone === "danger" ? AlertTriangle : Clock;
  const currentSequenceLabel =
    clientFile.totalCalls > 0
      ? getCadencePosition(clientFile.totalCalls).label
      : "No sequence activity";
  const nextActionIso = clientFile.nextCallScheduledAt ?? clientFile.followUpDate;
  const missingNextAction = !nextActionIso;
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
  const nextActionView = deriveNextActionVisibility({
    status: clientFile.status,
    qualificationRoute: clientFile.qualificationRoute,
    nextCallScheduledAt: clientFile.nextCallScheduledAt,
    nextFollowUpAt: clientFile.followUpDate,
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
              "fixed inset-x-4 top-[2%] bottom-[2%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-50 flex flex-col transition-all duration-300",
              activeTab === "comps" ? "md:w-[1325px]" : activeTab === "dossier" ? "md:w-[1200px]" : "md:w-[1075px]",
            )}
          >
            <div
              className="flex-1 overflow-hidden rounded-[16px] border border-white/[0.08] modal-glass flex flex-row"
              data-operator-safe
            >
            <div className="flex-1 overflow-hidden flex flex-col min-w-0">
              {/* Header — compact */}
              <div className="shrink-0 border-b border-white/[0.06] bg-[rgba(4,4,12,0.88)] backdrop-blur-2xl rounded-t-[16px]">
                <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-lg font-bold truncate" style={{ textShadow: "0 1px 0 rgba(255,255,255,0.06)" }}>
                        {clientFile.ownerName || "Unknown Seller"}
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
                      <Badge variant="outline" className="text-xs gap-1 border-white/20 text-foreground shrink-0">
                        <Target className="h-2.5 w-2.5" />{currentStageLabel}
                      </Badge>
                      <span className="shrink-0 text-xs">Owner: {assigneeLabel}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {clientFile.qualificationRoute === "escalate" && (
                        <Badge variant="outline" className="text-xs gap-1 border-red-500/20 text-red-400">
                          <AlertTriangle className="h-2.5 w-2.5" />Escalated
                        </Badge>
                      )}
                      {clientFile.status === "nurture" && (() => {
                        const fuIso = clientFile.followUpDate ?? clientFile.nextCallScheduledAt;
                        const fuMs = fuIso ? new Date(fuIso).getTime() : NaN;
                        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                        const isStale = !Number.isNaN(fuMs) ? fuMs < sevenDaysAgo : true;
                        return isStale ? (
                          <Badge variant="outline" className="text-xs gap-1 border-amber-500/20 text-amber-400">
                            <AlertTriangle className="h-2.5 w-2.5" />Stale Nurture
                          </Badge>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 shrink-0">
                    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold", lbl.bg, lbl.color)}>
                      <Zap className="h-3 w-3" />{clientFile.compositeScore} {lbl.text}
                    </div>
                    {clientFile.prediction && (
                      <PredictiveDistressBadge data={clientFile.prediction as PredictiveDistressData} size="sm" />
                    )}
                    <CoachToggle className="ml-1" />
                    <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.04] transition-colors text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Primary operator actions — single compact row */}
              <div className="shrink-0 px-4 py-2 border-b border-white/[0.06] bg-[rgba(12,12,22,0.6)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  {needsConsent ? (
                    <div className="flex items-center gap-2 rounded-md border border-white/20 bg-white/[0.06] px-3 py-1.5">
                      <span className="text-xs text-foreground">Confirm to dial</span>
                      <Button
                        size="sm"
                        className="h-6 gap-1.5 bg-primary hover:opacity-95 text-primary-foreground border border-white/15 text-xs"
                        disabled={consentPending}
                        onClick={grantConsentAndDial}
                      >
                        {consentPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />}
                        {consentPending ? "Saving..." : "Confirm & Call"}
                      </Button>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setNeedsConsent(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                  <Button
                    size="sm"
                    className="gap-1.5 h-7 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 shadow-sm"
                    disabled={!displayPhone || calling}
                    onClick={() => handleDial()}
                  >
                    {calling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                    {calling ? "Dialing..." : "Call Now"}
                  </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 border-white/15 hover:border-white/15 hover:bg-white/[0.06]"
                    disabled={!displayPhone}
                    onClick={() => setSmsOpen((v) => !v)}
                  >
                    <MessageSquare className="h-3 w-3 text-foreground" />Text
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 border-white/25 hover:border-white/45 hover:bg-white/[0.08]"
                    onClick={() => {
                      setCloseoutOpen((v) => {
                        const next = !v;
                        if (next) {
                          setCloseoutOutcome(clientFile.dispositionCode ?? "");
                          setCloseoutNote("");
                          setCloseoutAction("follow_up_call");
                          setCloseoutPreset("call_3_days");
                          setCloseoutAt(
                            toLocalDateTimeInput(clientFile.nextCallScheduledAt ?? clientFile.followUpDate) || presetDateTimeLocal(3),
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
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "gap-1.5 h-7",
                      missingNextAction
                        ? "border-amber-500/30 bg-amber-500/[0.08] text-amber-300 hover:bg-amber-500/[0.12]"
                        : "border-white/12 hover:border-white/12 hover:bg-white/[0.05]"
                    )}
                    onClick={() => {
                      setNextActionEditorOpen((v) => !v);
                      setCloseoutOpen(false);
                    }}
                  >
                    <Calendar className="h-3 w-3" />{missingNextAction ? "Set Next Action" : "Edit Next Action"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 border-white/[0.14] hover:border-white/[0.25] hover:bg-white/[0.06]"
                    onClick={() => {
                      setNoteEditorOpen((v) => !v);
                      setCloseoutOpen(false);
                    }}
                  >
                    <FileText className="h-3 w-3" />Note
                  </Button>
                  {clientFile && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 border-white/15 hover:border-white/35 hover:bg-white/[0.05] text-foreground/80"
                      onClick={async () => {
                        const { data: { session } } = await supabase.auth.getSession();
                        const res = await fetch(`/api/leads/${clientFile.id}/queue`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                          },
                        });
                        if (res.ok) toast.success("Added to call queue");
                        else toast.error("Could not add to queue");
                      }}
                    >
                      <ListPlus className="h-3 w-3" />Queue
                    </Button>
                  )}

                  {/* Secondary: owner + stage — pushed right */}
                  <div className="ml-auto flex items-center gap-1.5">
                    {!(isAssignedToCurrentUser && assignmentOptions.length > 0) && !isAssignedToCurrentUser && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-7 text-sm"
                        disabled={claiming || isAssignedToCurrentUser}
                        onClick={handleClaimLead}
                      >
                        {claiming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
                        {claiming ? "..." : claimButtonLabel}
                      </Button>
                    )}
                    {assignmentOptions.length > 0 && (
                      <div className="flex items-center gap-1 rounded-[6px] border border-white/[0.1] bg-white/[0.02] px-1 py-0.5">
                        <select
                          value={reassignTargetId}
                          onChange={(e) => setReassignTargetId(e.target.value)}
                          className="h-6 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 text-sm text-foreground focus:outline-none focus:border-white/30"
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
                          className="h-6 text-sm px-1.5 border-white/[0.15]"
                          disabled={reassigning || !reassignTargetId || reassignTargetId === (clientFile.assignedTo ?? "")}
                          onClick={handleReassignLead}
                        >
                          {reassigning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Go"}
                        </Button>
                      </div>
                    )}
                    <select
                      value={selectedStage}
                      onChange={(e) => setSelectedStage(e.target.value as WorkflowStageId)}
                      disabled={stageUpdating}
                      className="h-7 rounded-[6px] border border-white/[0.1] bg-white/[0.04] px-2 text-sm text-foreground focus:outline-none focus:border-white/30"
                      aria-label="Move lead stage"
                    >
                      {WORKFLOW_STAGE_OPTIONS.map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.label}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-7 text-sm border-white/20 hover:border-white/40 hover:bg-white/[0.06]"
                      disabled={stageUpdating || !stageChanged || !stagePrecheck.ok}
                      onClick={handleMoveStage}
                    >
                      {stageUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                      Move
                    </Button>
                  </div>
                </div>
                {stageChanged && !stagePrecheck.ok && (
                  <p className="mt-2 text-sm text-foreground">
                    Before moving to {workflowStageLabel(selectedStage)}:{" "}
                    <span className="font-medium">{stagePrecheck.requiredActions[0]}</span>
                  </p>
                )}
                {(closeoutOpen || nextActionEditorOpen || noteEditorOpen) && (
                  <div className="mt-2 grid grid-cols-1 lg:grid-cols-3 gap-2">
                    {closeoutOpen && (
                      <div className="rounded-[10px] border border-white/20 bg-white/[0.06] p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm uppercase tracking-wider font-semibold text-foreground">Log Call Result</p>
                          <span className="text-xs text-foreground/80">{closeoutActionLabel(closeoutAction)}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <label className="space-y-1">
                            <span className="text-xs uppercase tracking-wider text-muted-foreground">Call Outcome</span>
                            <select
                              value={closeoutOutcome}
                              onChange={(e) => setCloseoutOutcome(e.target.value)}
                              className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2 text-xs text-foreground focus:outline-none focus:border-white/30"
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
                          <label className="space-y-1">
                            <span className="text-xs uppercase tracking-wider text-muted-foreground">Next Action</span>
                            <select
                              value={closeoutAction}
                              onChange={(e) => {
                                const action = e.target.value as CloseoutNextAction;
                                setCloseoutAction(action);
                                setCloseoutPresetTouched(true);
                                setCloseoutDateTouched(false);
                                if (action === "nurture_check_in") {
                                  setCloseoutPreset("nurture_14_days");
                                  setCloseoutAt(presetDateTimeLocal(14));
                                } else if (action === "escalation_review") {
                                  setCloseoutPreset("escalate_review");
                                } else {
                                  setCloseoutPreset("call_3_days");
                                  setCloseoutAt(presetDateTimeLocal(3));
                                }
                              }}
                              className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2 text-xs text-foreground focus:outline-none focus:border-white/30"
                            >
                              <option value="follow_up_call">Follow-Up Call</option>
                              <option value="nurture_check_in">Nurture Check-In</option>
                              <option value="escalation_review">Escalate Review</option>
                            </select>
                          </label>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">Follow-Up Preset</p>
                          <div className="flex flex-wrap gap-1.5">
                            {CLOSEOUT_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleCloseoutPresetSelect(preset.id)}
                                className={cn(
                                  "h-6 px-2 rounded-[7px] border text-sm transition-colors",
                                  closeoutPreset === preset.id
                                    ? "border-white/40 text-foreground bg-white/[0.12]"
                                    : "border-white/[0.12] text-muted-foreground hover:text-foreground hover:border-white/[0.24]",
                                )}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground/75">
                            Call presets schedule lead follow-up dates; only route actions create workflow tasks.
                          </p>
                        </div>
                        <label className="space-y-1 block">
                          <span className="text-xs uppercase tracking-wider text-muted-foreground">Follow-Up Date</span>
                          <input
                            type="datetime-local"
                            value={closeoutAt}
                            onChange={(e) => {
                              setCloseoutDateTouched(true);
                              setCloseoutAt(e.target.value);
                            }}
                            className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-white/30"
                          />
                        </label>
                        <textarea
                          value={closeoutNote}
                          onChange={(e) => setCloseoutNote(e.target.value)}
                          placeholder="Quick call summary note..."
                          className="w-full h-16 rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-white/30"
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
                                toLocalDateTimeInput(clientFile.nextCallScheduledAt ?? clientFile.followUpDate) || presetDateTimeLocal(3),
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
                    {nextActionEditorOpen && (
                      <div className="rounded-[10px] border border-white/12 bg-white/[0.05] p-2.5 space-y-2">
                        <p className="text-sm uppercase tracking-wider font-semibold text-foreground">Next Action</p>
                        <input
                          type="datetime-local"
                          value={nextActionAt}
                          onChange={(e) => setNextActionAt(e.target.value)}
                          className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-white/30"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-sm"
                            disabled={settingNextAction}
                            onClick={handleSetNextAction}
                          >
                            {settingNextAction ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            {nextActionAt ? "Save Next Action" : "Clear Next Action"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-sm text-muted-foreground"
                            onClick={() => {
                              setNextActionAt(toLocalDateTimeInput(clientFile.nextCallScheduledAt ?? clientFile.followUpDate));
                              setNextActionEditorOpen(false);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                    {noteEditorOpen && (
                      <div className="rounded-[10px] border border-white/[0.12] bg-white/[0.03] p-2.5 space-y-2">
                        <p className="text-sm uppercase tracking-wider font-semibold text-muted-foreground">Lead Note</p>
                        <textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Add operator note, outcome, or seller update..."
                          className="w-full h-20 rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-white/30"
                          maxLength={1000}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-sm"
                            disabled={savingNote || !noteDraft.trim()}
                            onClick={handleAppendNote}
                          >
                            {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Save Note
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-sm text-muted-foreground"
                            onClick={() => {
                              setNoteDraft("");
                              setNoteEditorOpen(false);
                            }}
                          >
                            Cancel
                          </Button>
                          <span className="ml-auto text-xs text-muted-foreground/50">{noteDraft.length}/1000</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Compact status strip */}
              <div className="shrink-0 px-4 py-1.5 border-b border-white/[0.06] bg-[rgba(8,10,18,0.55)]">
                {(clientFile.status === "prospect" || clientFile.status === "staging") ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Prospect — not in pipeline yet.</span>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-semibold text-foreground hover:bg-white/10 border border-white/25 transition-colors"
                      onClick={() => { setSelectedStage("lead"); }}
                    >
                      Move to Pipeline <ArrowRight className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md border font-semibold text-xs", urgencyToneClass)}>
                      <UrgencyIcon className="h-3 w-3 shrink-0" />
                      <span>{nextActionUrgency.label}</span>
                    </div>
                    <span className="text-muted-foreground">
                      Last: <span className="text-foreground">{formatDateTimeShort(clientFile.lastContactAt)}</span>
                    </span>
                    <span className={cn(missingNextAction ? "text-foreground font-semibold" : "text-muted-foreground")}>
                      Next: <span className={cn(missingNextAction ? "" : "text-foreground")}>
                        {missingNextAction ? "Not set — needs action" : `${nextActionView.label} · ${formatDateTimeShort(nextActionIso)}`}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      Seq: <span className="text-foreground">{currentSequenceLabel}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] bg-[rgba(12,12,22,0.5)] overflow-x-auto scrollbar-none">
                {TABS.filter((tab) => PRIMARY_TAB_IDS.has(tab.id)).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-all whitespace-nowrap",
                      activeTab === tab.id
                        ? "text-foreground bg-white/[0.08] border border-white/15 shadow-[var(--shadow-badge-glow-tight)]"
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
                      <OverviewTab
                        cf={overviewClientFile}
                        computedArv={computedArv}
                        skipTracing={skipTracing}
                        skipTraceResult={skipTraceResult}
                        skipTraceMs={skipTraceMs}
                        overlay={overlay}
                        skipTraceError={skipTraceError}
                        onSkipTrace={handleSkipTrace}
                        onManualSkipTrace={handleManualSkipTrace}
                        onEdit={() => setEditOpen(true)}
                        onDial={handleDial}
                        onSms={handleSendSms}
                        calling={calling}
                        dialHistory={dialHistoryMap}
                        autofilling={autofilling}
                        onAutofill={handleAutofill}
                        deepCrawling={deepCrawling}
                        deepCrawlResult={deepCrawlResult}
                        deepCrawlExpanded={deepCrawlExpanded}
                        setDeepCrawlExpanded={setDeepCrawlExpanded}
                        executeDeepCrawl={executeDeepCrawl}
                        hasSavedReport={hasSavedReport}
                        loadingReport={loadingReport}
                        loadSavedReport={loadSavedReport}
                        crawlSteps={crawlSteps}
                        deepSkipResult={deepSkipResult}
                        activityRefreshToken={activityRefreshToken}
                        qualification={qualificationDraft}
                        qualificationDirty={qualificationDirty}
                        qualificationSaving={qualificationSaving}
                        qualificationEditable={qualificationEditable}
                        qualificationSuggestedRoute={qualificationSuggestedRoute}
                        onQualificationChange={handleQualificationChange}
                        onQualificationRouteSelect={handleQualificationRouteSelect}
                        onQualificationSave={() => void persistQualification()}
                        offerPrepDraft={offerPrepDraft}
                        offerPrepEditing={offerPrepEditing}
                        offerPrepSaving={offerPrepSaving}
                        onOfferPrepDraftChange={handleOfferPrepDraftChange}
                        onOfferPrepEditToggle={setOfferPrepEditing}
                        onOfferPrepSave={() => void handleSaveOfferPrepSnapshot()}
                        offerStatusDraft={offerStatusDraft}
                        offerStatusEditing={offerStatusEditing}
                        offerStatusSaving={offerStatusSaving}
                        onOfferStatusDraftChange={handleOfferStatusDraftChange}
                        onOfferStatusEditToggle={setOfferStatusEditing}
                        onOfferStatusSave={() => void handleSaveOfferStatusSnapshot()}
                        buyerDispoTruthDraft={buyerDispoTruthDraft}
                        buyerDispoTruthEditing={buyerDispoTruthEditing}
                        buyerDispoTruthSaving={buyerDispoTruthSaving}
                        onBuyerDispoTruthDraftChange={handleBuyerDispoTruthDraftChange}
                        onBuyerDispoTruthEditToggle={setBuyerDispoTruthEditing}
                        onBuyerDispoTruthSave={() => void handleSaveBuyerDispoTruthSnapshot()}
                        milestoneDraft={milestoneDraft}
                        milestoneEditing={milestoneEditing}
                        milestoneSaving={milestoneSaving}
                        onMilestoneDraftChange={handleMilestoneDraftChange}
                        onMilestoneEditToggle={setMilestoneEditing}
                        onSaveMilestones={handleSaveMilestones}
                        isAdam={currentUserName?.toLowerCase().includes("adam") ?? false}
                        onEditNextAction={() => { setNextActionEditorOpen(true); setCloseoutOpen(false); }}
                      />
                    )}
                    {activeTab === "contact" && (
                      <ContactTab cf={clientFile} overlay={overlay} onSkipTrace={handleSkipTrace} skipTracing={skipTracing} onDial={handleDial} onSms={handleSendSms} calling={calling} onRefresh={onRefresh} />
                    )}
                    {activeTab === "dossier" && (
                      <div className="space-y-6">
                        <IntelligenceSummaryBlock cf={clientFile} />
                        <LeadDossierPanel leadId={clientFile.id} />
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
                        />
                      ) : (
                        <CompsTab cf={clientFile} selectedComps={selectedComps} onAddComp={handleAddComp} onRemoveComp={handleRemoveComp} onSkipTrace={handleSkipTrace} computedArv={computedArv} onArvChange={handleArvChange} conditionAdj={conditionAdj} onConditionAdjChange={setConditionAdj} />
                      )
                    )}
                    {activeTab === "calculator" && <OfferCalcTab cf={clientFile} computedArv={computedArv} initialRepairs={((clientFile?.ownerFlags?.bricked_repair_cost as number) ?? 0) > 0 ? (clientFile?.ownerFlags?.bricked_repair_cost as number) : undefined} />}
                    {activeTab === "documents" && <DocumentsTab cf={clientFile} computedArv={computedArv} />}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="shrink-0 flex flex-col border-t border-white/[0.06] bg-[rgba(4,4,12,0.88)] backdrop-blur-2xl rounded-b-[16px]">
                {/* Call status banner */}
                {callStatus && (
                  <div className="flex items-center gap-2 px-6 py-2 bg-white/[0.08] border-b border-white/15 text-xs text-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="font-semibold capitalize">{callStatus}</span>
                    <span className="text-muted-foreground/50 ml-1">via Twilio</span>
                    <button onClick={() => { setCallStatus(null); setCalling(false); }} className="ml-auto text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {/* SMS Compose */}
                {smsOpen && displayPhone && (
                  <div className="px-6 py-3 border-b border-white/[0.06] space-y-2">
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
                      className="w-full h-16 rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-white/30"
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

