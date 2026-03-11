"use client";

import { Fragment, useState, useCallback, useMemo, useEffect, useRef } from "react";
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
  Users, Briefcase, CheckCircle, XCircle,
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
import { getSequenceLabel, getSequenceProgress, getCadencePosition, suggestNextCadenceDate } from "@/lib/call-scheduler";
import { useCallNotes, type CallNote } from "@/hooks/use-call-notes";
import { CompsMap, getSatelliteTileUrl, getGoogleStreetViewLink, type CompProperty, type SubjectProperty } from "@/components/sentinel/comps/comps-map";
import { PredictiveDistressBadge, type PredictiveDistressData } from "@/components/sentinel/predictive-distress-badge";
import { RelationshipBadge } from "@/components/sentinel/relationship-badge";
import {
  BuyerDispoTruthCard,
  BuyerDispoVisibilityCard,
  OfferStatusTruthCard,
} from "@/components/sentinel/master-client-file/workflow-truth-cards";
import { NumericInput } from "@/components/sentinel/numeric-input";
import { usePreCallBrief } from "@/hooks/use-pre-call-brief";
import { supabase } from "@/lib/supabase";
import { precheckWorkflowStageChange } from "@/lib/workflow-stage-precheck";
import { getAllowedTransitions } from "@/lib/lead-guardrails";
import { IntakeGuideSection } from "@/components/sentinel/intake-guide-section";
import { formatDueDateLabel } from "@/lib/due-date-label";
import { toast } from "sonner";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ClientFile â€” single unified shape for every funnel stage
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export interface ClientFile {
  id: string;
  propertyId: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  ownerName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  status: string;
  assignedTo: string | null;
  source: string;
  tags: string[];
  notes: string | null;
  promotedAt: string | null;
  lastContactAt: string | null;
  followUpDate: string | null;
  motivationLevel: number | null;
  sellerTimeline: SellerTimeline | null;
  conditionLevel: number | null;
  decisionMakerConfirmed: boolean;
  priceExpectation: number | null;
  qualificationRoute: QualificationRoute | null;
  occupancyScore: number | null;
  equityFlexibilityScore: number | null;
  qualificationScoreTotal: number | null;
  offerStatus: OfferVisibilityStatus;
  complianceClean: boolean;
  compositeScore: number;
  motivationScore: number;
  dealScore: number;
  scoreLabel: AIScore["label"];
  aiBoost: number;
  factors: unknown[];
  modelVersion: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotSize: number | null;
  estimatedValue: number | null;
  equityPercent: number | null;
  availableEquity: number | null;
  totalLoanBalance: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  foreclosureStage: string | null;
  defaultAmount: number | null;
  delinquentAmount: number | null;
  isVacant: boolean;
  isAbsentee: boolean;
  isFreeClear: boolean;
  isHighEquity: boolean;
  isCashBuyer: boolean;
  ownerFlags: Record<string, unknown>;
  radarId: string | null;
  enriched: boolean;
  lockVersion?: number;
  nextCallScheduledAt: string | null;
  callSequenceStep: number;
  totalCalls: number;
  liveAnswers: number;
  voicemailsLeft: number;
  dispositionCode: string | null;
  prediction?: {
    predictiveScore: number;
    daysUntilDistress: number;
    confidence: number;
    label: "imminent" | "likely" | "possible" | "unlikely";
    ownerAgeInference: number | null;
    equityBurnRate: number | null;
    lifeEventProbability: number | null;
  } | null;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Adapters
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function buildAddress(...parts: (string | null | undefined)[]) {
  const filtered = parts.filter((p): p is string => !!p);
  if (filtered.length <= 1) return filtered[0] ?? "";
  const [street, ...rest] = filtered;
  const sl = street.toLowerCase();
  const unique = rest.filter((p) => !sl.includes(p.toLowerCase()));
  return [street, ...unique].join(", ");
}

export function clientFileFromProspect(p: ProspectRow): ClientFile {
  return {
    id: p.id, propertyId: p.property_id, apn: p.apn,
    county: (p.owner_flags?.inferred_county as string) || p.county,
    address: p.address, city: p.city, state: p.state, zip: p.zip,
    fullAddress: buildAddress(p.address, p.city, p.state, p.zip),
    ownerName: p.owner_name, ownerPhone: p.owner_phone, ownerEmail: p.owner_email,
    status: p.status, assignedTo: p.assigned_to, source: p.source,
    tags: p.tags, notes: p.notes, promotedAt: p.promoted_at,
    lastContactAt: null, followUpDate: null,
    motivationLevel: p.motivation_level ?? null,
    sellerTimeline: p.seller_timeline ?? null,
    conditionLevel: p.condition_level ?? null,
    decisionMakerConfirmed: p.decision_maker_confirmed ?? false,
    priceExpectation: p.price_expectation ?? null,
    qualificationRoute: p.qualification_route ?? null,
    occupancyScore: p.occupancy_score ?? null,
    equityFlexibilityScore: p.equity_flexibility_score ?? null,
    qualificationScoreTotal: p.qualification_score_total ?? null,
    offerStatus: deriveOfferVisibilityStatus({
      status: p.status,
      qualificationRoute: p.qualification_route ?? null,
    }),
    complianceClean: true,
    compositeScore: p.composite_score, motivationScore: p.motivation_score,
    dealScore: p.deal_score, scoreLabel: p.score_label,
    aiBoost: p.ai_boost, factors: p.factors, modelVersion: p.model_version,
    propertyType: p.property_type, bedrooms: p.bedrooms, bathrooms: p.bathrooms,
    sqft: p.sqft, yearBuilt: p.year_built, lotSize: p.lot_size,
    estimatedValue: p.estimated_value, equityPercent: p.equity_percent,
    availableEquity: p.available_equity, totalLoanBalance: p.total_loan_balance,
    lastSalePrice: p.last_sale_price, lastSaleDate: p.last_sale_date,
    foreclosureStage: p.foreclosure_stage, defaultAmount: p.default_amount,
    delinquentAmount: p.delinquent_amount, isVacant: p.is_vacant,
    isAbsentee: p.is_absentee, isFreeClear: p.is_free_clear,
    isHighEquity: p.is_high_equity, isCashBuyer: p.is_cash_buyer,
    ownerFlags: p.owner_flags, radarId: p.radar_id, enriched: p.enriched,
    nextCallScheduledAt: null, callSequenceStep: 1, totalCalls: 0, liveAnswers: 0, voicemailsLeft: 0, dispositionCode: null,
    prediction: p._prediction ?? null,
  };
}

export function clientFileFromLead(l: LeadRow): ClientFile {
  return {
    id: l.id, propertyId: l.propertyId, apn: l.apn, county: l.county,
    address: l.address, city: l.city, state: l.state, zip: l.zip,
    fullAddress: buildAddress(l.address, l.city, l.state, l.zip),
    ownerName: l.ownerName, ownerPhone: l.ownerPhone, ownerEmail: l.ownerEmail,
    status: l.status, assignedTo: l.assignedTo, source: l.source,
    tags: l.tags, notes: l.notes, promotedAt: l.promotedAt,
    lastContactAt: l.lastContactAt, followUpDate: l.followUpDate,
    motivationLevel: l.motivationLevel,
    sellerTimeline: l.sellerTimeline,
    conditionLevel: l.conditionLevel,
    decisionMakerConfirmed: l.decisionMakerConfirmed,
    priceExpectation: l.priceExpectation,
    qualificationRoute: l.qualificationRoute,
    occupancyScore: l.occupancyScore ?? null,
    equityFlexibilityScore: l.equityFlexibilityScore ?? null,
    qualificationScoreTotal: l.qualificationScoreTotal ?? null,
    offerStatus: l.offerStatus,
    complianceClean: l.complianceClean,
    compositeScore: l.score.composite, motivationScore: l.score.motivation,
    dealScore: Math.round(l.score.composite * 0.75), scoreLabel: l.score.label,
    aiBoost: l.score.aiBoost, factors: [], modelVersion: null,
    propertyType: null, bedrooms: null, bathrooms: null,
    sqft: null, yearBuilt: null, lotSize: null,
    estimatedValue: l.estimatedValue, equityPercent: l.equityPercent,
    availableEquity: null, totalLoanBalance: null,
    lastSalePrice: null, lastSaleDate: null,
    foreclosureStage: null, defaultAmount: null, delinquentAmount: null,
    isVacant: false, isAbsentee: l.ownerBadge === "absentee",
    isFreeClear: false, isHighEquity: false, isCashBuyer: false,
    ownerFlags: {}, radarId: null, enriched: false,
    nextCallScheduledAt: l.nextCallScheduledAt, callSequenceStep: l.callSequenceStep, totalCalls: l.totalCalls, liveAnswers: l.liveAnswers, voicemailsLeft: l.voicemailsLeft, dispositionCode: l.dispositionCode ?? null,
    prediction: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clientFileFromRaw(lead: Record<string, any>, prop: Record<string, any>): ClientFile {
  const flags = prop.owner_flags ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (flags.pr_raw ?? {}) as Record<string, any>;
  const composite = lead.priority ?? 0;
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, ""));
    return isNaN(n) ? null : n;
  };
  const toBool = (v: unknown) => v === true || v === 1 || v === "1" || v === "Yes" || v === "True" || v === "true";
  const sl = (n: number): AIScore["label"] => n >= 85 ? "platinum" : n >= 65 ? "gold" : n >= 40 ? "silver" : "bronze";

  return {
    id: lead.id, propertyId: lead.property_id ?? "", apn: prop.apn ?? "",
    // Prefer inferred county from crawler rawData over the default market county (upsert key)
    county: (prop.owner_flags?.inferred_county as string) || prop.county || "",
    address: prop.address ?? "", city: prop.city ?? "", state: prop.state ?? "", zip: prop.zip ?? "",
    fullAddress: buildAddress(prop.address, prop.city, prop.state, prop.zip),
    ownerName: prop.owner_name ?? "Unknown", ownerPhone: prop.owner_phone ?? null, ownerEmail: prop.owner_email ?? null,
    status: lead.status ?? "prospect", assignedTo: lead.assigned_to ?? null,
    source: lead.source ?? "unknown", tags: lead.tags ?? [], notes: lead.notes ?? null,
    promotedAt: lead.promoted_at ?? null, lastContactAt: lead.last_contact_at ?? null,
    followUpDate: lead.follow_up_date ?? null,
    motivationLevel: lead.motivation_level != null ? Number(lead.motivation_level) : null,
    sellerTimeline: (lead.seller_timeline as SellerTimeline | null) ?? null,
    conditionLevel: lead.condition_level != null ? Number(lead.condition_level) : null,
    decisionMakerConfirmed: lead.decision_maker_confirmed === true,
    priceExpectation: lead.price_expectation != null ? Number(lead.price_expectation) : null,
    qualificationRoute: (lead.qualification_route as QualificationRoute | null) ?? null,
    occupancyScore: lead.occupancy_score != null ? Number(lead.occupancy_score) : null,
    equityFlexibilityScore: lead.equity_flexibility_score != null ? Number(lead.equity_flexibility_score) : null,
    qualificationScoreTotal: lead.qualification_score_total != null ? Number(lead.qualification_score_total) : null,
    offerStatus: deriveOfferVisibilityStatus({
      status: lead.status ?? "prospect",
      qualificationRoute: (lead.qualification_route as QualificationRoute | null) ?? null,
    }),
    complianceClean: true,
    compositeScore: composite, motivationScore: Math.round(composite * 0.85),
    dealScore: Math.round(composite * 0.75), scoreLabel: sl(composite),
    aiBoost: 0, factors: [], modelVersion: null,
    propertyType: prop.property_type ?? null, bedrooms: prop.bedrooms ?? null,
    bathrooms: prop.bathrooms != null ? Number(prop.bathrooms) : null,
    sqft: prop.sqft ?? null, yearBuilt: prop.year_built ?? null, lotSize: prop.lot_size ?? null,
    estimatedValue: prop.estimated_value ?? null,
    equityPercent: prop.equity_percent != null ? Number(prop.equity_percent) : null,
    availableEquity: toNum(prRaw.AvailableEquity) ?? toNum(flags.available_equity),
    totalLoanBalance: toNum(prRaw.TotalLoanBalance) ?? toNum(flags.total_loan_balance),
    lastSalePrice: toNum(prRaw.LastTransferValue) ?? toNum(flags.last_sale_price),
    lastSaleDate: (prRaw.LastTransferRecDate as string) ?? (flags.last_sale_date as string) ?? null,
    foreclosureStage: (prRaw.ForeclosureStage as string) ?? null,
    defaultAmount: toNum(prRaw.DefaultAmount), delinquentAmount: toNum(prRaw.DelinquentAmount),
    isVacant: toBool(flags.vacant) || toBool(prRaw.isSiteVacant),
    isAbsentee: toBool(flags.absentee) || toBool(prRaw.isNotSameMailingOrExempt),
    isFreeClear: toBool(flags.freeAndClear) || toBool(prRaw.isFreeAndClear),
    isHighEquity: toBool(flags.highEquity) || toBool(prRaw.isHighEquity),
    isCashBuyer: toBool(flags.cashBuyer) || toBool(prRaw.isCashBuyer),
    ownerFlags: flags, radarId: (flags.radar_id as string) ?? null,
    enriched: !!flags.skip_traced || (flags.all_phones as unknown[])?.length > 0,
    lockVersion: lead.lock_version ?? 0,
    nextCallScheduledAt: lead.next_call_scheduled_at ?? null,
    callSequenceStep: lead.call_sequence_step ?? 1,
    totalCalls: lead.total_calls ?? 0,
    liveAnswers: lead.live_answers ?? 0,
    voicemailsLeft: lead.voicemails_left ?? 0,
    dispositionCode: lead.disposition_code ?? null,
    prediction: lead._prediction ?? null,
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Constants
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "contact", label: "Contact", icon: Contact2 },
  { id: "comps", label: "Comps & ARV", icon: Map },
  { id: "calculator", label: "Deal Calculator", icon: Calculator },
  { id: "documents", label: "Documents / PSA", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];
type WorkflowStageId = "prospect" | "lead" | "negotiation" | "disposition" | "nurture" | "dead" | "closed";
type QualificationDraft = {
  motivationLevel: number | null;
  sellerTimeline: SellerTimeline | null;
  conditionLevel: number | null;
  decisionMakerConfirmed: boolean;
  priceExpectation: number | null;
  qualificationRoute: QualificationRoute | null;
  occupancyScore: number | null;
  equityFlexibilityScore: number | null;
};
type OfferPrepSnapshotDraft = {
  arvUsed: string;
  rehabEstimate: string;
  maoLow: string;
  maoHigh: string;
  confidence: OfferPrepConfidence | "";
  sheetUrl: string;
};
type OfferStatusSnapshotDraft = {
  status: OfferStatusTruth | "";
  amount: string;
  amountLow: string;
  amountHigh: string;
  sellerResponseNote: string;
};
type BuyerDispoTruthDraft = {
  buyerFit: BuyerFitVisibility | "";
  dispoStatus: DispoReadinessVisibility | "";
  nextStep: string;
  dispoNote: string;
};
type CloseoutNextAction = "follow_up_call" | "nurture_check_in" | "escalation_review";
type CloseoutPresetId =
  | "call_tomorrow"
  | "call_3_days"
  | "call_next_week"
  | "nurture_14_days"
  | "escalate_review";

const CALL_OUTCOME_OPTIONS = [
  { id: "interested", label: "Interested" },
  { id: "callback", label: "Callback" },
  { id: "appointment", label: "Appointment" },
  { id: "appointment_set", label: "Appointment Set" },
  { id: "contract", label: "Contract Discussed" },
  { id: "voicemail", label: "Voicemail" },
  { id: "no_answer", label: "No Answer" },
  { id: "not_interested", label: "Not Interested" },
  { id: "wrong_number", label: "Wrong Number" },
  { id: "disconnected", label: "Disconnected" },
  { id: "do_not_call", label: "Do Not Call" },
] as const;

const CLOSEOUT_PRESETS: Array<{
  id: CloseoutPresetId;
  label: string;
  daysFromNow: number | null;
  action: CloseoutNextAction;
}> = [
  { id: "call_tomorrow", label: "Call tomorrow", daysFromNow: 1, action: "follow_up_call" },
  { id: "call_3_days", label: "Call in 3 days", daysFromNow: 3, action: "follow_up_call" },
  { id: "call_next_week", label: "Call next week", daysFromNow: 7, action: "follow_up_call" },
  { id: "nurture_14_days", label: "Nurture 14 days", daysFromNow: 14, action: "nurture_check_in" },
  { id: "escalate_review", label: "Escalate review", daysFromNow: null, action: "escalation_review" },
];

const SELLER_TIMELINE_OPTIONS: Array<{ id: SellerTimeline; label: string }> = [
  { id: "immediate", label: "Immediate" },
  { id: "30_days", label: "30 Days" },
  { id: "60_days", label: "60 Days" },
  { id: "flexible", label: "Flexible" },
  { id: "unknown", label: "Unknown" },
];

const QUALIFICATION_ROUTE_OPTIONS: Array<{ id: QualificationRoute; label: string }> = [
  { id: "offer_ready", label: "Offer Ready" },
  { id: "follow_up", label: "Follow-Up" },
  { id: "nurture", label: "Nurture" },
  { id: "dead", label: "Dead" },
  { id: "escalate", label: "Escalate Review" },
];
const QUALIFICATION_ROUTE_IDS = new Set<QualificationRoute>(QUALIFICATION_ROUTE_OPTIONS.map((option) => option.id));
const OFFER_PREP_CONFIDENCE_OPTIONS: Array<{ id: OfferPrepConfidence; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];
const OFFER_STATUS_OPTIONS: Array<{ id: OfferStatusTruth; label: string }> = [
  { id: "offer_discussed", label: "Offer Discussed" },
  { id: "offer_sent", label: "Offer Sent" },
  { id: "seller_reviewing", label: "Seller Reviewing" },
  { id: "counter_needs_revision", label: "Counter / Needs Revision" },
  { id: "accepted", label: "Accepted" },
  { id: "passed_not_moving_forward", label: "Passed / Not Moving Forward" },
];

function parseSuggestedRoute(value: unknown): QualificationRoute | null {
  if (typeof value !== "string") return null;
  return QUALIFICATION_ROUTE_IDS.has(value as QualificationRoute) ? (value as QualificationRoute) : null;
}

function qualificationRouteLabel(route: QualificationRoute | null | undefined): string {
  switch (route) {
    case "offer_ready":
      return "Offer Ready";
    case "follow_up":
      return "Follow-Up";
    case "nurture":
      return "Nurture";
    case "dead":
      return "Dead";
    case "escalate":
      return "Escalate Review";
    default:
      return "Unknown";
  }
}

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

const PRIMARY_TAB_IDS = new Set<TabId>(["overview", "contact"]);
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

const WORKFLOW_STAGE_SET = new Set<WorkflowStageId>(WORKFLOW_STAGE_OPTIONS.map((s) => s.id));
const LEGACY_MY_LEADS_ALIASES = new Set(["my_lead", "my_leads", "my_lead_status"]);

function normalizeWorkflowStage(status: string | null | undefined): WorkflowStageId {
  const normalized = (status ?? "").toLowerCase().replace(/\s+/g, "_");
  if (WORKFLOW_STAGE_SET.has(normalized as WorkflowStageId)) {
    return normalized as WorkflowStageId;
  }
  // Legacy compatibility only: "My Leads" is assignment segmentation, not a workflow stage.
  if (LEGACY_MY_LEADS_ALIASES.has(normalized)) {
    return "lead";
  }
  return "prospect";
}

function workflowStageLabel(status: string | null | undefined): string {
  const normalized = normalizeWorkflowStage(status);
  return WORKFLOW_STAGE_OPTIONS.find((s) => s.id === normalized)?.label ?? "Prospect";
}

function sourceDisplayLabel(source: string | null | undefined): string {
  const normalized = (source ?? "unknown").trim().toLowerCase();
  if (normalized === "propertyradar") return "PropertyRadar";
  if (normalized === "ranger_push") return "Ranger";
  if (normalized === "google_ads") return "Google Ads";
  if (normalized === "facebook_ads") return "Facebook Ads";
  return normalized
    .replace(/^csv:/, "CSV ")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function marketDisplayLabel(county: string | null | undefined): string {
  const c = (county ?? "").toLowerCase();
  if (c.includes("spokane")) return "Spokane County, WA";
  if (c.includes("kootenai")) return "Kootenai County, ID";
  if (!county) return "Other Market";
  return county.toLowerCase().includes("county") ? county : `${county} County`;
}

function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(localValue: string): string | null {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function presetDateTimeLocal(daysFromNow: number): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return toLocalDateTimeInput(d.toISOString());
}

function routeForCloseoutAction(action: CloseoutNextAction): QualificationRoute | null {
  if (action === "nurture_check_in") return "nurture";
  if (action === "escalation_review") return "escalate";
  return null;
}

function closeoutActionLabel(action: CloseoutNextAction): string {
  if (action === "nurture_check_in") return "Nurture Check-In";
  if (action === "escalation_review") return "Escalation Review";
  return "Follow-Up Call";
}

function formatRelativeFromNow(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(Math.abs(diffMs) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return diffMs >= 0 ? `${mins}m ago` : `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return diffMs >= 0 ? `${hrs}h ago` : `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return diffMs >= 0 ? `${days}d ago` : `in ${days}d`;
}

function getQualificationDraft(cf: ClientFile | null | undefined): QualificationDraft {
  return {
    motivationLevel: cf?.motivationLevel ?? null,
    sellerTimeline: cf?.sellerTimeline ?? null,
    conditionLevel: cf?.conditionLevel ?? null,
    decisionMakerConfirmed: cf?.decisionMakerConfirmed ?? false,
    priceExpectation: cf?.priceExpectation ?? null,
    qualificationRoute: cf?.qualificationRoute ?? null,
    occupancyScore: cf?.occupancyScore ?? null,
    equityFlexibilityScore: cf?.equityFlexibilityScore ?? null,
  };
}

function toDraftCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value));
}

function parseDraftCurrency(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed.replace(/[$,\s]/g, ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
}

function getOfferPrepDraft(cf: ClientFile | null | undefined): OfferPrepSnapshotDraft {
  const snapshot = extractOfferPrepSnapshot((cf?.ownerFlags ?? null) as Record<string, unknown> | null);
  const fallbackArv = typeof cf?.ownerFlags?.comp_arv === "number" ? (cf?.ownerFlags?.comp_arv as number) : null;

  return {
    arvUsed: toDraftCurrency(snapshot.arvUsed ?? fallbackArv),
    rehabEstimate: toDraftCurrency(snapshot.rehabEstimate),
    maoLow: toDraftCurrency(snapshot.maoLow),
    maoHigh: toDraftCurrency(snapshot.maoHigh),
    confidence: snapshot.confidence ?? "",
    sheetUrl: snapshot.sheetUrl ?? "",
  };
}

function getOfferStatusDraft(cf: ClientFile | null | undefined): OfferStatusSnapshotDraft {
  const snapshot = extractOfferStatusSnapshot((cf?.ownerFlags ?? null) as Record<string, unknown> | null);
  return {
    status: snapshot.status ?? "",
    amount: toDraftCurrency(snapshot.amount),
    amountLow: toDraftCurrency(snapshot.amountLow),
    amountHigh: toDraftCurrency(snapshot.amountHigh),
    sellerResponseNote: snapshot.sellerResponseNote ?? "",
  };
}

function getBuyerDispoTruthDraft(cf: ClientFile | null | undefined): BuyerDispoTruthDraft {
  const snapshot = extractBuyerDispoTruthSnapshot((cf?.ownerFlags ?? null) as Record<string, unknown> | null);
  return {
    buyerFit: snapshot.buyerFit ?? "",
    dispoStatus: snapshot.dispoStatus ?? "",
    nextStep: snapshot.nextStep ?? "",
    dispoNote: snapshot.dispoNote ?? "",
  };
}

function getNextActionUrgency(cf: ClientFile): {
  label: string;
  detail: string;
  tone: "normal" | "warn" | "danger";
} {
  const now = Date.now();
  const nextIso = cf.nextCallScheduledAt ?? cf.followUpDate;
  const nextMs = nextIso ? new Date(nextIso).getTime() : NaN;
  const promotedMs = cf.promotedAt ? new Date(cf.promotedAt).getTime() : NaN;

  if (!Number.isNaN(nextMs)) {
    if (nextMs < now) {
      return { label: "Overdue Follow-up", detail: formatDueDateLabel(nextIso).text, tone: "danger" };
    }
    const hoursUntil = Math.floor((nextMs - now) / 3600000);
    if (hoursUntil <= 24) {
      return { label: "Due Soon", detail: `Follow-up in ${hoursUntil <= 0 ? "<1" : hoursUntil}h`, tone: "warn" };
    }
    return { label: "Scheduled", detail: `Next follow-up ${formatDateTimeShort(nextIso)}`, tone: "normal" };
  }

  if ((cf.totalCalls ?? 0) === 0 && !Number.isNaN(promotedMs)) {
    const ageMs = now - promotedMs;
    if (ageMs > 15 * 60 * 1000) {
      return { label: "Needs First Contact", detail: `No attempt after ${formatRelativeFromNow(cf.promotedAt)}`, tone: "danger" };
    }
    return { label: "New Lead", detail: "Awaiting first contact", tone: "warn" };
  }

  return { label: "No Follow-up Set", detail: "Set next call to keep momentum", tone: "warn" };
}

const DISTRESS_CFG: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  probate:          { label: "Probate",          icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  pre_foreclosure:  { label: "Pre-Foreclosure",  icon: AlertTriangle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  tax_lien:         { label: "Tax Lien",          icon: Banknote,      color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  code_violation:   { label: "Code Violation",    icon: Shield,        color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  vacant:           { label: "Vacant",            icon: Home,          color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  divorce:          { label: "Divorce",           icon: Scale,         color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  bankruptcy:       { label: "Bankruptcy",        icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  fsbo:             { label: "FSBO",              icon: Building,      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  absentee:         { label: "Absentee",          icon: UserX,         color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  inherited:        { label: "Inherited",         icon: User,          color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  water_shutoff:    { label: "Water Shut-Off",   icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  condemned:        { label: "Condemned",        icon: AlertTriangle, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  tired_landlord:   { label: "Tired Landlord",  icon: AlertTriangle, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  underwater:       { label: "Underwater",       icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const SCORE_LABEL_CFG: Record<AIScore["label"], { text: string; color: string; bg: string }> = {
  platinum: { text: "PLATINUM", color: "text-cyan-300",    bg: "bg-cyan-400/10 border-cyan-400/30" },
  gold:     { text: "GOLD",    color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
  silver:   { text: "SILVER",  color: "text-slate-300",   bg: "bg-slate-400/10 border-slate-400/30" },
  bronze:   { text: "BRONZE",  color: "text-orange-500",  bg: "bg-orange-600/10 border-orange-600/30" },
};

const COUNTY_LINKS: Record<string, { name: string; gis: (apn: string) => string; assessor: (apn: string) => string; treasurer?: (apn: string) => string }> = {
  spokane: {
    name: "Spokane County",
    gis: (apn) => `https://cp.spokanecounty.org/SCOUT/Map/?PID=${encodeURIComponent(apn)}`,
    assessor: (apn) => `https://cp.spokanecounty.org/SCOUT/propertyinformation/Summary.aspx?PID=${encodeURIComponent(apn)}`,
    treasurer: (apn) => `https://cp.spokanecounty.org/SCOUT/propertyinformation/Summary.aspx?PID=${encodeURIComponent(apn)}`,
  },
  kootenai: {
    name: "Kootenai County",
    gis: () => `https://gis.kcgov.us/app/kcearth/`,
    assessor: () => `https://ftp.kcgov.us/departments/mapping/mapSearch/`,
    treasurer: () => `https://id-kootenai.publicaccessnow.com/Treasurer/TaxSearch.aspx`,
  },
  ada: {
    name: "Ada County",
    gis: (apn) => `https://www.adacountyassessor.org/adamaps/?run=ZoomToParcel&query=parcel%3D'${encodeURIComponent(apn)}'&LayerTheme=AerialsOn`,
    assessor: () => `https://apps.adacounty.id.gov/PropertyLookup/`,
    treasurer: () => `https://adacounty.id.gov/treasurer/`,
  },
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Shared sub-components
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function InfoRow({ icon: Icon, label, value, mono, highlight }: {
  icon: typeof MapPin; label: string; value: string | number | null | undefined; mono?: boolean; highlight?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", highlight ? "text-cyan" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn("text-sm truncate", mono && "font-mono", highlight ? "text-neon font-semibold" : "text-foreground")}>{value}</p>
      </div>
    </div>
  );
}
function Section({ title, icon: Icon, children }: { title: string; icon: typeof Home; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-glass-border bg-secondary/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="p-0.5 rounded hover:bg-white/[0.06] transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-cyan" /> : <Copy className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground" />}
    </button>
  );
}

type ScoreType = "composite" | "motivation" | "deal";

const TIER_COLORS = {
  platinum: { bar: "bg-cyan-400", border: "border-cyan-400/30", glow: "rgba(0,212,255,0.3)", text: "text-cyan-300", hoverBorder: "hover:border-cyan-400/50" },
  gold:     { bar: "bg-amber-400", border: "border-amber-500/30", glow: "rgba(245,158,11,0.3)", text: "text-amber-400", hoverBorder: "hover:border-amber-400/50" },
  silver:   { bar: "bg-slate-300", border: "border-slate-400/30", glow: "rgba(148,163,184,0.3)", text: "text-slate-300", hoverBorder: "hover:border-slate-300/50" },
  bronze:   { bar: "bg-orange-500", border: "border-orange-600/30", glow: "rgba(249,115,22,0.3)", text: "text-orange-400", hoverBorder: "hover:border-orange-500/50" },
} as const;

function getTier(score: number): keyof typeof TIER_COLORS {
  if (score >= 85) return "platinum";
  if (score >= 65) return "gold";
  if (score >= 40) return "silver";
  return "bronze";
}

function ScoreCard({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const pct = Math.min(value, 100);
  const tier = getTier(value);
  const tc = TIER_COLORS[tier];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[10px] border bg-white/[0.04] p-3 text-center transition-all duration-200 w-full",
        tc.border, tc.hoverBorder,
        "cursor-pointer hover:bg-white/[0.06] hover:shadow-[0_0_20px_var(--glow)] active:scale-[0.97]",
        "group relative overflow-hidden"
      )}
      style={{ "--glow": tc.glow } as React.CSSProperties}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className={cn("text-[10px] uppercase tracking-wider mb-1 transition-colors relative z-10", tc.text)}>{label}</p>
      <p className="text-xl font-bold relative z-10 transition-all" style={{ textShadow: `0 0 10px ${tc.glow}` }}>{value}</p>
      <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden relative z-10">
        <div className={cn("h-full rounded-full transition-all", tc.bar)} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn("text-[8px] mt-1.5 transition-colors relative z-10 uppercase tracking-widest font-semibold", tc.text, "opacity-60 group-hover:opacity-100")}>
        {tier.toUpperCase()} â€” tap to drill
      </p>
    </button>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Score Breakdown Modal â€” full score intelligence overlay
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const SIGNAL_WEIGHT_LABELS: Record<string, string> = {
  probate: "Probate Filing", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant Property", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee Owner",
  inherited: "Inherited Property", water_shutoff: "Water Shut-Off", condemned: "Condemned Property",
  tired_landlord: "Tired Landlord", underwater: "Underwater",
  stacking_bonus: "Signal Stacking Bonus", owner_factors: "Owner Profile Factors",
  equity: "Equity Factor", comp_ratio: "Comp Ratio Factor", ai_boost: "AI Historical Boost",
};

function ScoreBreakdownModal({ cf, scoreType, onClose }: { cf: ClientFile; scoreType: ScoreType; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factors = (cf.factors ?? []) as { name: string; value: number; contribution: number }[];
  const pred = cf.prediction;

  const signalFactors = factors.filter((f) => f.name in SIGNAL_WEIGHTS);
  const bonusFactors = factors.filter((f) => !(f.name in SIGNAL_WEIGHTS));

  const totalSignalPts = signalFactors.reduce((s, f) => s + f.contribution, 0);
  const totalBonusPts = bonusFactors.reduce((s, f) => s + f.contribution, 0);

  const arv = cf.estimatedValue ?? 0;
  const eqPct = cf.equityPercent ?? 0;
  const availableEquity = cf.availableEquity ?? (arv > 0 ? Math.round(arv * eqPct / 100) : 0);
  const rehabEst = 40000;
  const offerPct = 65;
  const offer = Math.round(arv * (offerPct / 100));
  const totalCost = offer + rehabEst;
  const profit = arv - totalCost;
  const roi = totalCost > 0 ? Math.round((profit / totalCost) * 100) : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden rounded-[16px] border border-white/[0.08]
            modal-glass holo-border wet-shine flex flex-col"
        >
          {/* Holographic top accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-cyan/[0.03] to-transparent pointer-events-none" />

          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "h-8 w-8 rounded-[10px] flex items-center justify-center",
                scoreType === "composite" ? "bg-cyan/10 text-cyan" :
                scoreType === "motivation" ? "bg-orange-500/10 text-orange-400" :
                "bg-emerald-500/10 text-emerald-400"
              )}>
                {scoreType === "composite" ? <Zap className="h-4 w-4" /> :
                 scoreType === "motivation" ? <AlertTriangle className="h-4 w-4" /> :
                 <DollarSign className="h-4 w-4" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {scoreType === "composite" ? "Composite Score" : scoreType === "motivation" ? "Motivation Score" : "Deal Score"} Breakdown
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {cf.ownerName} â€” {cf.fullAddress}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {scoreType === "composite" && (
              <>
                {/* Big score hero */}
                <div className="text-center py-3">
                  <p className="text-5xl font-black tabular-nums" style={{ textShadow: "0 0 24px rgba(0,212,255,0.3), 0 0 60px rgba(0,212,255,0.1)" }}>{cf.compositeScore}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                    {cf.scoreLabel.toUpperCase()} â€” Model {cf.modelVersion ?? "v2.0"}
                  </p>
                </div>

                {/* Blend weights */}
                {pred && (
                  <div className="rounded-[10px] border border-purple-500/15 bg-purple-500/[0.04] p-3">
                    <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">Predictive Blend (v2.1)</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deterministic Weight</span>
                        <span className="font-mono font-semibold text-foreground">70%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Predictive Weight</span>
                        <span className="font-mono font-semibold text-purple-400">30%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Predictive Score</span>
                        <span className="font-mono font-semibold">{pred.predictiveScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Confidence</span>
                        <span className="font-mono font-semibold text-cyan">{pred.confidence}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Signal contributions */}
                {signalFactors.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" />Distress Signals â€” {Math.round(totalSignalPts)} pts
                    </p>
                    {signalFactors.map((f, i) => {
                      const maxPts = (SIGNAL_WEIGHTS[f.name as DistressType] ?? 10) * 1.8;
                      const fillPct = Math.min((f.contribution / maxPts) * 100, 100);
                      const cfg = DISTRESS_CFG[f.name];
                      return (
                        <div key={i} className="rounded-[8px] border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={cn("font-medium", cfg?.color?.split(" ")[0] ?? "text-foreground")}>
                              {SIGNAL_WEIGHT_LABELS[f.name] ?? f.name}
                            </span>
                            <span className="font-mono font-bold text-foreground">+{f.contribution}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>Base: {f.value}</span>
                            <span className="text-muted-foreground/40">|</span>
                            <span>w/ severity + recency</span>
                          </div>
                          <div className="h-1 rounded-full bg-secondary/50 mt-1.5 overflow-hidden">
                            <div className={cn("h-full rounded-full", cfg?.color?.split(" ")[0]?.replace("text-", "bg-") ?? "bg-cyan")} style={{ width: `${fillPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Bonus factors */}
                {bonusFactors.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" />Adjustments â€” {Math.round(totalBonusPts)} pts
                    </p>
                    {bonusFactors.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                        <span className="text-muted-foreground">{SIGNAL_WEIGHT_LABELS[f.name] ?? f.name}</span>
                        <span className={cn("font-mono font-bold", f.contribution >= 0 ? "text-cyan" : "text-red-400")}>
                          {f.contribution >= 0 ? "+" : ""}{f.contribution}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {factors.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground/60">
                    No detailed factor breakdown available â€” run enrichment to populate
                  </div>
                )}
              </>
            )}

            {scoreType === "motivation" && (
              <>
                <div className="text-center py-3">
                  <p className="text-5xl font-black tabular-nums text-orange-400" style={{ textShadow: "0 0 24px rgba(249,115,22,0.3)" }}>{cf.motivationScore}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Motivation Score â€” Owner Distress Intensity</p>
                </div>

                <div className="rounded-[10px] border border-orange-500/15 bg-orange-500/[0.03] p-3">
                  <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-2">Formula</p>
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                    BaseSignalScore Ã— RecencyDecay Ã— 1.2 (capped at 100)
                  </p>
                </div>

                {/* Per-signal detailed breakdown */}
                {cf.tags.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Distress Signals</p>
                    {cf.tags.map((tag) => {
                      const cfg = DISTRESS_CFG[tag];
                      const TagIcon = cfg?.icon ?? Tag;
                      const baseWeight = SIGNAL_WEIGHTS[tag as DistressType] ?? 10;
                      const factor = factors.find((f) => f.name === tag);
                      return (
                        <div key={tag} className="rounded-[8px] border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <TagIcon className={cn("h-3.5 w-3.5", cfg?.color?.split(" ")[0] ?? "text-muted-foreground")} />
                            <span className={cn("text-xs font-semibold", cfg?.color?.split(" ")[0] ?? "text-foreground")}>{cfg?.label ?? tag}</span>
                            {factor && <span className="ml-auto font-mono text-xs font-bold text-foreground">+{factor.contribution}</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <span className="text-muted-foreground/60">Base Weight</span>
                              <p className="font-mono font-semibold">{baseWeight}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground/60">Source</span>
                              <p className="font-medium">{cf.source}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground/60">Severity</span>
                              <p className="font-mono font-semibold">{factor ? Math.round(factor.contribution / baseWeight * 10) / 10 : "â€”"}Ã—</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-muted-foreground/60">
                    No active distress signals detected
                  </div>
                )}

                {/* Predictive life-event overlay */}
                {pred && pred.lifeEventProbability != null && pred.lifeEventProbability > 0.05 && (
                  <div className="rounded-[10px] border border-purple-500/15 bg-purple-500/[0.03] p-3">
                    <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">Predictive Life-Event Intelligence</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Life-Event Probability</span>
                        <span className="font-mono font-bold text-purple-400">{Math.round(pred.lifeEventProbability * 100)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Est. Distress In</span>
                        <span className="font-mono font-bold text-orange-400">~{pred.daysUntilDistress}d</span>
                      </div>
                      {pred.ownerAgeInference && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Owner Age (inferred)</span>
                          <span className="font-mono font-semibold">{pred.ownerAgeInference}</span>
                        </div>
                      )}
                      {pred.equityBurnRate != null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Equity Burn Rate</span>
                          <span className="font-mono font-semibold text-red-400">{Math.round(pred.equityBurnRate * 100)}%/yr</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Owner flags impact */}
                {(cf.isAbsentee || cf.isVacant || cf.isFreeClear || cf.isHighEquity) && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Owner Profile Impact</p>
                    {cf.isAbsentee && <BreakdownRow label="Absentee Owner" value="+5 pts" color="text-amber-400" />}
                    {cf.isVacant && <BreakdownRow label="Vacant Property" value="+4 pts" color="text-purple-400" />}
                    {cf.isFreeClear && <BreakdownRow label="Free & Clear (no mortgage pressure)" value="+0 pts" color="text-emerald-400" />}
                    {cf.isHighEquity && <BreakdownRow label="High Equity" value="Equity factor boost" color="text-cyan" />}
                  </div>
                )}
              </>
            )}

            {scoreType === "deal" && (
              <>
                <div className="text-center py-3">
                  <p className="text-5xl font-black tabular-nums text-emerald-400" style={{ textShadow: "0 0 24px rgba(16,185,129,0.3)" }}>{cf.dealScore}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Deal Score â€” Investment Viability Index</p>
                </div>

                <div className="rounded-[10px] border border-emerald-500/15 bg-emerald-500/[0.03] p-3">
                  <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">Formula</p>
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                    EquityFactor Ã— 2 + AIBoost + StackingBonus Ã— 0.5 (capped at 100)
                  </p>
                </div>

                {/* Deal assumptions */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Property Financials</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">ARV / AVM</span>
                      <span className="font-mono font-bold text-neon">{arv > 0 ? formatCurrency(arv) : "â€”"}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Equity %</span>
                      <span className="font-mono font-bold">{eqPct > 0 ? `${eqPct}%` : "â€”"}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Available Equity</span>
                      <span className="font-mono font-semibold">{availableEquity > 0 ? formatCurrency(availableEquity) : "â€”"}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Total Loans</span>
                      <span className="font-mono font-semibold">{cf.totalLoanBalance ? formatCurrency(cf.totalLoanBalance) : "â€”"}</span>
                    </div>
                  </div>
                </div>

                {/* Profit projection */}
                {arv > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Profit Projection</p>
                    <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ARV</span>
                        <span className="font-mono font-medium">{formatCurrency(arv)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Offer @ {offerPct}%</span>
                        <span className="font-mono text-red-400">-{formatCurrency(offer)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rehab Est.</span>
                        <span className="font-mono text-red-400">-{formatCurrency(rehabEst)}</span>
                      </div>
                      <div className="border-t border-white/[0.06] pt-1.5 mt-1.5 flex justify-between">
                        <span className="font-semibold">Net Profit</span>
                        <span className={cn("font-mono font-bold text-lg", profit >= 0 ? "text-neon" : "text-red-400")} style={profit >= 0 ? { textShadow: "0 0 10px rgba(0,212,255,0.25)" } : {}}>
                          {formatCurrency(profit)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">ROI</span>
                        <span className={cn("font-mono font-semibold", roi >= 0 ? "text-neon" : "text-red-400")}>{roi}%</span>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 italic">
                      Assumptions: {offerPct}% MAO, ${(rehabEst / 1000).toFixed(0)}k rehab, 3% holding, 8% selling costs. Adjust in Offer Calculator tab.
                    </p>
                  </div>
                )}

                {/* Deal score components */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Score Components</p>
                  {bonusFactors.filter((f) => f.name === "equity" || f.name === "comp_ratio" || f.name === "ai_boost" || f.name === "stacking_bonus").map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">{SIGNAL_WEIGHT_LABELS[f.name] ?? f.name}</span>
                      <span className="font-mono font-bold text-cyan">+{f.contribution}</span>
                    </div>
                  ))}
                  {cf.aiBoost > 0 && !bonusFactors.some((f) => f.name === "ai_boost") && (
                    <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">AI Historical Boost</span>
                      <span className="font-mono font-bold text-cyan">+{cf.aiBoost}</span>
                    </div>
                  )}
                </div>

                {arv === 0 && (
                  <div className="text-center py-4 text-xs text-muted-foreground/60">
                    No property value data â€” run enrichment to populate ARV and financial details
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
            <p className="text-[9px] text-muted-foreground/40 font-mono">
              Scoring Engine {cf.modelVersion ?? "v2.0"} â€¢ {cf.tags.length} signal(s) â€¢ {cf.source}
            </p>
            <Button size="sm" variant="outline" onClick={onClose} className="text-[10px] h-7 px-3">
              Close
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function BreakdownRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-semibold", color)}>{value}</span>
    </div>
  );
}

function OwnerFlag({ active, label, icon: Icon }: { active: boolean; label: string; icon: typeof Home }) {
  if (!active) return null;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium">
      <Icon className="h-3 w-3" />{label}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Edit Details Modal â€” inline property editing from MCF
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface EditFields {
  address: string;
  city: string;
  state: string;
  zip: string;
  owner_name: string;
  apn: string;
  property_type: string;
  notes: string;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  year_built: string;
  lot_size: string;
}

function EditField({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full px-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground",
          "placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30 focus:ring-1 focus:ring-cyan/20",
          "transition-all hover:border-white/[0.12]",
          mono && "font-mono",
        )}
      />
    </div>
  );
}

function EditDetailsModal({ cf, onClose, onSaved }: { cf: ClientFile; onClose: () => void; onSaved: () => void }) {
  const [fields, setFields] = useState<EditFields>({
    address: cf.address?.split(",")[0]?.trim() ?? "",
    city: cf.city || "",
    state: cf.state || "",
    zip: cf.zip || "",
    owner_name: cf.ownerName || "",
    apn: cf.apn || "",
    property_type: cf.propertyType || "",
    notes: cf.notes || "",
    bedrooms: cf.bedrooms != null ? String(cf.bedrooms) : "",
    bathrooms: cf.bathrooms != null ? String(cf.bathrooms) : "",
    sqft: cf.sqft != null ? String(cf.sqft) : "",
    year_built: cf.yearBuilt != null ? String(cf.yearBuilt) : "",
    lot_size: cf.lotSize != null ? String(cf.lotSize) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof EditFields) => (v: string) => setFields((p) => ({ ...p, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Session expired. Please sign in again.");
        return;
      }

      const fullAddr = [fields.address, fields.city, fields.state, fields.zip].filter(Boolean).join(", ");
      const res = await fetch("/api/properties/update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          property_id: cf.propertyId,
          lead_id: cf.id,
          fields: {
            address: fullAddr,
            city: fields.city,
            state: fields.state,
            zip: fields.zip,
            owner_name: fields.owner_name,
            apn: fields.apn,
            property_type: fields.property_type || null,
            notes: fields.notes || null,
            bedrooms: fields.bedrooms ? parseInt(fields.bedrooms) : null,
            bathrooms: fields.bathrooms ? parseFloat(fields.bathrooms) : null,
            sqft: fields.sqft ? parseInt(fields.sqft) : null,
            year_built: fields.year_built ? parseInt(fields.year_built) : null,
            lot_size: fields.lot_size ? parseInt(fields.lot_size) : null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Update failed");
        return;
      }
      window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden rounded-[16px] border border-white/[0.08]
            modal-glass holo-border wet-shine flex flex-col"
        >
          {/* Holographic accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-cyan/[0.03] to-transparent pointer-events-none" />

          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[10px] bg-cyan/10 flex items-center justify-center">
                <Pencil className="h-4 w-4 text-cyan" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Edit Property Details</h3>
                <p className="text-[10px] text-muted-foreground">{cf.fullAddress}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
            <EditField label="Street Address" value={fields.address} onChange={set("address")} placeholder="123 Main St" />
            <div className="grid grid-cols-3 gap-3">
              <EditField label="City" value={fields.city} onChange={set("city")} placeholder="Spokane" />
              <EditField label="State" value={fields.state} onChange={set("state")} placeholder="WA" />
              <EditField label="ZIP" value={fields.zip} onChange={set("zip")} placeholder="99201" mono />
            </div>
            <EditField label="Owner Name" value={fields.owner_name} onChange={set("owner_name")} placeholder="John Smith" />
            <div className="grid grid-cols-2 gap-3">
              <EditField label="APN" value={fields.apn} onChange={set("apn")} placeholder="12345-678-9" mono />
              <EditField label="Property Type" value={fields.property_type} onChange={set("property_type")} placeholder="SFR" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <EditField label="Beds" value={fields.bedrooms} onChange={set("bedrooms")} placeholder="3" mono />
              <EditField label="Baths" value={fields.bathrooms} onChange={set("bathrooms")} placeholder="2" mono />
              <EditField label="Sqft" value={fields.sqft} onChange={set("sqft")} placeholder="1500" mono />
              <EditField label="Year Built" value={fields.year_built} onChange={set("year_built")} placeholder="1985" mono />
            </div>
            <EditField label="Lot Size (sqft)" value={fields.lot_size} onChange={set("lot_size")} placeholder="7500" mono />
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Notes</label>
              <textarea
                value={fields.notes}
                onChange={(e) => set("notes")(e.target.value)}
                rows={3}
                placeholder="Add notes about this property..."
                className="w-full px-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground
                  placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30 focus:ring-1 focus:ring-cyan/20
                  transition-all hover:border-white/[0.12] resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-[10px] px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[9px] text-muted-foreground/40 font-mono">
              Property: {cf.propertyId.slice(0, 8)}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onClose} className="text-[11px] h-8 px-4">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="text-[11px] h-8 px-4 gap-1.5 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/20
                  shadow-[0_0_14px_rgba(0,212,255,0.15)] hover:shadow-[0_0_22px_rgba(0,212,255,0.25)] transition-all"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Delete Confirmation Modal â€” "type yes" to permanently delete
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function DeleteConfirmationModal({
  cf,
  onClose,
  onDeleted,
}: {
  cf: ClientFile;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toLowerCase() === "yes";

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/prospects", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ lead_id: cf.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.detail ?? data.error ?? "Delete failed");
        return;
      }
      toast.success("Customer file permanently deleted");
      window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-md w-full mx-4 overflow-hidden rounded-[16px] border border-red-500/20
            modal-glass holo-border flex flex-col"
        >
          {/* Red accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-red-500/[0.05] to-transparent pointer-events-none" />

          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[10px] bg-red-500/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Customer File</h3>
                <p className="text-[10px] text-muted-foreground">Permanent action</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Lead details */}
            <div className="rounded-[10px] bg-white/[0.03] border border-white/[0.06] p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-white">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{cf.fullAddress || cf.address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{cf.ownerName || "Unknown Owner"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] border-white/[0.08]">
                  {cf.status}
                </Badge>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-red-500/[0.06] border border-red-500/20">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-red-300/90 leading-relaxed">
                <strong>This action is permanent and cannot be undone.</strong>
                <br />
                The lead, property, distress events, scoring records, predictions, and associated deals will be permanently deleted.
              </div>
            </div>

            {/* Type yes input */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Type <span className="text-red-400 font-semibold">&quot;yes&quot;</span> to confirm deletion
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type yes to confirm..."
                autoFocus
                className="w-full px-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground
                  placeholder:text-muted-foreground/40 focus:outline-none focus:border-red-500/30 focus:ring-1 focus:ring-red-500/20
                  transition-all hover:border-white/[0.12]"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-white/[0.06]">
            <Button size="sm" variant="outline" onClick={onClose} className="text-[11px] h-8 px-4">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              className="text-[11px] h-8 px-4 gap-1.5"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {deleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: Overview
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface PhoneDetail {
  number: string;
  lineType: "mobile" | "landline" | "voip" | "unknown";
  confidence: number;
  dnc: boolean;
  carrier?: string;
  source: "propertyradar" | "batchdata" | `openclaw_${string}` | string;
}

interface EmailDetail {
  email: string;
  deliverable: boolean;
  source: "propertyradar" | "batchdata" | `openclaw_${string}` | string;
}

interface SkipTraceOverlay {
  phones: string[];
  emails: string[];
  persons: Record<string, unknown>[];
  primaryPhone: string | null;
  primaryEmail: string | null;
  phoneDetails: PhoneDetail[];
  emailDetails: EmailDetail[];
  providers: string[];
  isLitigator: boolean;
  hasDncNumbers: boolean;
}

interface SkipTraceError {
  error: string;
  reason?: string;
  suggestion?: string;
  tier_reached?: string;
  address_issues?: string[];
}

function dispositionColor(disp: string): string {
  const d = disp.toLowerCase();
  if (d === "connected" || d === "interested" || d === "appointment_set" || d === "callback") return "text-emerald-400";
  if (d === "no_answer" || d === "voicemail" || d === "busy" || d === "left_message") return "text-amber-400";
  if (d === "wrong_number" || d === "disconnected" || d === "do_not_call") return "text-red-400";
  return "text-muted-foreground";
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DEEP CRAWL RESULTS PANEL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const URGENCY_COLORS: Record<string, string> = {
  CRITICAL: "text-red-400 bg-red-500/[0.12] border-red-500/30",
  HIGH: "text-orange-400 bg-orange-500/[0.12] border-orange-500/30",
  MEDIUM: "text-amber-400 bg-amber-500/[0.12] border-amber-500/30",
  LOW: "text-emerald-400 bg-emerald-500/[0.12] border-emerald-500/30",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DeepCrawlPanel({ result, onRecrawl, isRecrawling }: { result: any; onRecrawl?: () => void; isRecrawling?: boolean }) {
  if (!result) return null;

  const ai = result.aiDossier ?? result.ai_dossier ?? {};
  const crawledAt = result.crawledAt ?? result.crawled_at;
  const crawledAgo = crawledAt
    ? (() => {
        const mins = Math.floor((Date.now() - new Date(crawledAt).getTime()) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
      })()
    : null;

  const urgencyColor = URGENCY_COLORS[ai.urgencyLevel] ?? URGENCY_COLORS.MEDIUM;
  const sources = result.sources ?? [];

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
      {/* Executive Summary */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-3.5 w-3.5 text-cyan" />
          <p className="text-[11px] text-cyan/80 uppercase tracking-wider font-semibold">Executive Summary</p>
          {ai.urgencyLevel && (
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", urgencyColor)}>
              {ai.urgencyLevel}
            </span>
          )}
        </div>
        <p className="text-[13px] text-foreground/90 leading-relaxed">{ai.summary ?? "No summary available"}</p>
        {ai.urgencyReason && (
          <p className="text-[11px] text-muted-foreground mt-1">{ai.urgencyReason}</p>
        )}
      </div>

      {/* Signal Analysis */}
      {ai.signalAnalysis && ai.signalAnalysis.length > 0 && (
        <div>
          <p className="text-[11px] text-orange-400/80 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />Signal Analysis
          </p>
          <div className="space-y-2">
            {ai.signalAnalysis.map((s: { headline: string; detail: string; daysUntilCritical: number | null; actionableInsight: string }, i: number) => (
              <div key={i} className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" />
                  {s.headline}
                  {s.daysUntilCritical != null && s.daysUntilCritical <= 60 && (
                    <span className="text-[11px] text-red-400 font-mono ml-auto">{s.daysUntilCritical}d</span>
                  )}
                </p>
                <p className="text-[12px] text-muted-foreground leading-relaxed pl-5">{s.detail}</p>
                {s.actionableInsight && (
                  <p className="text-[12px] text-cyan/80 pl-5 flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 shrink-0" />{s.actionableInsight}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Owner Profile */}
      {ai.ownerProfile && (
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />Owner Profile
          </p>
          <p className="text-[12px] text-foreground/80 leading-relaxed">{ai.ownerProfile}</p>
        </div>
      )}

      {/* Financial Snapshot */}
      {ai.financialAnalysis && (
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />Financial Snapshot
          </p>
          <p className="text-[12px] text-foreground/80 leading-relaxed">{ai.financialAnalysis}</p>
          {ai.estimatedMAO && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground uppercase">Est. MAO:</span>
              <span className="text-[13px] font-semibold text-emerald-400">
                ${ai.estimatedMAO.low?.toLocaleString()} &ndash; ${ai.estimatedMAO.high?.toLocaleString()}
              </span>
              <span className="text-[11px] text-muted-foreground/60">{ai.estimatedMAO.basis}</span>
            </div>
          )}
        </div>
      )}

      {/* Approach & Talking Points */}
      {ai.suggestedApproach && (
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" />Suggested Approach
          </p>
          <p className="text-[12px] text-foreground/80 leading-relaxed">{ai.suggestedApproach}</p>
          {ai.talkingPoints && ai.talkingPoints.length > 0 && (
            <ul className="mt-2 space-y-1">
              {ai.talkingPoints.map((tp: string, i: number) => (
                <li key={i} className="text-[12px] text-cyan/80 flex items-start gap-1.5">
                  <span className="text-cyan/40 mt-0.5 shrink-0">&#8226;</span>{tp}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Web Findings */}
      {ai.webFindings && ai.webFindings.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />Web Findings
          </p>
          <div className="space-y-1.5">
            {ai.webFindings.map((w: { source: string; finding: string }, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <Search className="h-3 w-3 text-cyan/50 mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold text-foreground/70">{w.source}:</span>{" "}
                  <span className="text-foreground/60">{w.finding}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Red Flags */}
      {ai.redFlags && ai.redFlags.length > 0 && (
        <div>
          <p className="text-[11px] text-red-400/80 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />Red Flags
          </p>
          <ul className="space-y-1">
            {ai.redFlags.map((flag: string, i: number) => (
              <li key={i} className="text-[12px] text-red-300/70 flex items-start gap-1.5">
                <span className="text-red-400 mt-0.5 shrink-0">&#9679;</span>{flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-muted-foreground/50">
        <div className="flex items-center gap-2">
          {crawledAgo && <span>Crawled {crawledAgo}</span>}
          {sources.length > 0 && <span>&#183; Sources: {sources.join(", ")}</span>}
        </div>
        {onRecrawl && (
          <button
            onClick={onRecrawl}
            disabled={isRecrawling}
            className="text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors disabled:opacity-50"
          >
            {isRecrawling ? "Re-crawlingâ€¦" : "â†» Re-crawl"}
          </button>
        )}
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DEEP SKIP PANEL â€” People intelligence from agents
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const ROLE_COLORS: Record<string, string> = {
  owner: "text-cyan bg-cyan/10 border-cyan/30",
  heir: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  executor: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  attorney: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  beneficial_owner: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  spouse: "text-pink-400 bg-pink-500/10 border-pink-500/30",
  family: "text-orange-400 bg-orange-500/10 border-orange-500/30",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DeepSkipPanel({ result }: { result: any }) {
  if (!result || (!result.people?.length && !result.newPhones?.length && !result.newEmails?.length && !result.employmentSignals?.length)) {
    return null;
  }

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-purple-400" />
        <p className="text-[11px] text-purple-400/80 uppercase tracking-wider font-semibold">Deep Skip Report â€” People Intelligence</p>
        {result.agentMeta && (
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {result.agentMeta.agentsSucceeded?.length ?? 0} agents Â· {result.people?.length ?? 0} people found
          </span>
        )}
      </div>

      {/* People Cards */}
      {result.people && result.people.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">People Found</p>
          <div className="grid gap-2">
            {result.people.map((person: { name: string; role: string; phones: string[]; emails: string[]; notes: string; source: string; confidence: number; address?: string }, i: number) => (
              <div key={i} className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <User className="h-3 w-3 text-foreground/60" />
                  <span className="text-[13px] font-semibold text-foreground">{person.name}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[9px] font-bold border uppercase",
                    ROLE_COLORS[person.role] ?? "text-muted-foreground bg-white/5 border-white/10",
                  )}>
                    {person.role.replace(/_/g, " ")}
                  </span>
                  {person.confidence >= 0.8 && <CheckCircle className="h-3 w-3 text-emerald-400" />}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5 pl-5">{person.notes}</p>
                <div className="flex flex-wrap gap-3 pl-5 text-[11px]">
                  {person.phones.map((p: string, j: number) => (
                    <span key={j} className="flex items-center gap-1 text-emerald-400/80">
                      <Phone className="h-2.5 w-2.5" />{p}
                    </span>
                  ))}
                  {person.emails.map((e: string, j: number) => (
                    <span key={j} className="flex items-center gap-1 text-cyan/80">
                      <Mail className="h-2.5 w-2.5" />{e}
                    </span>
                  ))}
                  {person.address && (
                    <span className="flex items-center gap-1 text-muted-foreground/60">
                      <MapPin className="h-2.5 w-2.5" />{person.address}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 pl-5">
                  <span className="text-[9px] text-muted-foreground/40">via {person.source.replace(/_/g, " ")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Contacts Found */}
      {((result.newPhones?.length > 0) || (result.newEmails?.length > 0)) && (
        <div>
          <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Plus className="h-3 w-3" />New Contacts Discovered
          </p>
          <div className="flex flex-wrap gap-2">
            {(result.newPhones ?? []).map((p: { number: string; source: string; personName?: string }, i: number) => (
              <span key={`p${i}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400">
                <Phone className="h-2.5 w-2.5" />
                {p.number}
                {p.personName && <span className="text-emerald-400/50">({p.personName})</span>}
                <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">OC</span>
              </span>
            ))}
            {(result.newEmails ?? []).map((e: { email: string; source: string; personName?: string }, i: number) => (
              <span key={`e${i}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border border-cyan/20 bg-cyan/[0.06] text-cyan">
                <Mail className="h-2.5 w-2.5" />
                {e.email}
                {e.personName && <span className="text-cyan/50">({e.personName})</span>}
                <span className="text-[8px] px-1 py-0.5 rounded bg-cyan/20 text-cyan font-bold">OC</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Employment & Relocation Signals */}
      {result.employmentSignals && result.employmentSignals.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Briefcase className="h-3 w-3" />Employment & Relocation Signals
          </p>
          <div className="space-y-1.5">
            {result.employmentSignals.map((s: { signal: string; source: string; date?: string; url?: string }, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <ArrowRight className="h-3 w-3 text-amber-400/60 mt-0.5 shrink-0" />
                <span className="text-foreground/70">{s.signal}</span>
                {s.date && <span className="text-muted-foreground/40 text-[10px] ml-auto shrink-0">{s.date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-white/[0.06] text-[10px] text-muted-foreground/40">
        {result.crawledAt && <span>Generated {new Date(result.crawledAt).toLocaleString()}</span>}
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DEEP CRAWL PROGRESS INDICATOR â€” SSE streaming steps
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface CrawlStep {
  phase: string;
  status: "started" | "complete" | "error";
  detail: string;
  elapsed?: number;
}

function CrawlProgressIndicator({ steps }: { steps: CrawlStep[] }) {
  if (steps.length === 0) return null;

  const phaseLabels: Record<string, string> = {
    data_gathering: "Data Gathering",
    normalization: "Normalizing Data",
    agents: "Research Agents",
    photos: "Property Photos",
    post_processing: "Contact & People Intel",
    grok_synthesis: "AI Synthesis",
    storage: "Saving Results",
    complete: "Complete",
    error: "Error",
  };

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="h-3.5 w-3.5 text-cyan animate-spin" />
        <p className="text-[11px] text-cyan/80 uppercase tracking-wider font-semibold">Deep Crawl in Progress</p>
      </div>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const icon = step.status === "complete"
          ? <CheckCircle className="h-3 w-3 text-emerald-400 shrink-0" />
          : step.status === "error"
            ? <XCircle className="h-3 w-3 text-red-400 shrink-0" />
            : <Loader2 className="h-3 w-3 text-cyan animate-spin shrink-0" />;

        return (
          <div key={i} className={cn("flex items-center gap-2 text-[11px]", isLast && step.status === "started" ? "text-foreground" : "text-muted-foreground")}>
            {icon}
            <span className="font-medium">{phaseLabels[step.phase] ?? step.phase}</span>
            <span className="text-muted-foreground/50">{step.detail}</span>
            {step.elapsed != null && (
              <span className="text-[9px] text-muted-foreground/30 ml-auto font-mono">{(step.elapsed / 1000).toFixed(1)}s</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CONTACT TAB â€” Editable phones, emails, addresses + street view
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function ContactTab({ cf, overlay, onSkipTrace, skipTracing, onDial, onSms, calling, onRefresh }: {
  cf: ClientFile; overlay: SkipTraceOverlay | null;
  onSkipTrace: () => void; skipTracing: boolean;
  onDial: (phone: string) => void; onSms: (phone: string) => void;
  calling: boolean; onRefresh?: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;

  // â”€â”€ Image (Street View or satellite fallback) â”€â”€
  const { lat: propLat, lng: propLng } = extractLatLng(cf);
  const streetViewUrl = prRaw.StreetViewUrl ?? prRaw.PropertyImageUrl ?? (prRaw.Photos?.[0]) ?? null;
  const satelliteFallbackUrl = (!streetViewUrl && propLat && propLng) ? getSatelliteTileUrl(propLat, propLng, 18) : null;
  const imageUrl = streetViewUrl ?? satelliteFallbackUrl;
  const streetViewLink = propLat && propLng ? getGoogleStreetViewLink(propLat, propLng) : null;

  // â”€â”€ Phone & email data â”€â”€
  const persons = overlay?.persons ?? (cf.ownerFlags?.persons as Record<string, unknown>[]) ?? [];
  const phoneDetails: PhoneDetail[] = overlay?.phoneDetails
    ?? (cf.ownerFlags?.all_phones as PhoneDetail[] | undefined)?.filter((p) => typeof p === "object" && p !== null && "number" in p)
    ?? [];
  const emailDetails: EmailDetail[] = overlay?.emailDetails
    ?? (cf.ownerFlags?.all_emails as EmailDetail[] | undefined)?.filter((e) => typeof e === "object" && e !== null && "email" in e)
    ?? [];

  // â”€â”€ Mailing address from PR raw data â”€â”€
  const prMailAddr = prRaw.MailAddress ?? prRaw.MailingAddress ?? null;
  const prMailCity = prRaw.MailCity ?? null;
  const prMailState = prRaw.MailState ?? null;
  const prMailZip = prRaw.MailZip ?? null;
  const mailingFromPersons = persons.find((p: Record<string, unknown>) => p.mailing_address || p.mailingAddress);
  const safeMailing = (val: unknown): string => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (typeof val === "object" && val !== null) {
      const a = val as Record<string, unknown>;
      return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ");
    }
    return "";
  };
  const defaultMailing = prMailAddr
    ? [prMailAddr, prMailCity, prMailState, prMailZip].filter(Boolean).join(", ")
    : safeMailing(mailingFromPersons?.mailing_address) || safeMailing(mailingFromPersons?.mailingAddress);

  // â”€â”€ Editable state â”€â”€
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propertyAddr, setPropertyAddr] = useState(cf.address ?? "");
  const [propertyCity, setPropertyCity] = useState(cf.city ?? "");
  const [propertyState, setPropertyState] = useState(cf.state ?? "");
  const [propertyZip, setPropertyZip] = useState(cf.zip ?? "");
  const [mailingAddr, setMailingAddr] = useState(defaultMailing);

  // Dynamic phone slots â€” show all returned phones, minimum 5 empty slots
  const initialPhones = (() => {
    const phones: string[] = [];
    for (const pd of phoneDetails) phones.push(pd.number);
    if (phones.length === 0 && cf.ownerPhone) phones.push(cf.ownerPhone);
    const MIN_PHONE_SLOTS = 5;
    while (phones.length < MIN_PHONE_SLOTS) phones.push("");
    return phones;
  })();
  const [phoneSlots, setPhoneSlots] = useState<string[]>(initialPhones);

  // Dynamic email slots â€” show all returned emails, minimum 2 empty slots
  const initialEmails = (() => {
    const emails: string[] = [];
    for (const ed of emailDetails) emails.push(ed.email);
    if (emails.length === 0 && cf.ownerEmail) emails.push(cf.ownerEmail);
    const MIN_EMAIL_SLOTS = 2;
    while (emails.length < MIN_EMAIL_SLOTS) emails.push("");
    return emails;
  })();
  const [emailSlots, setEmailSlots] = useState<string[]>(initialEmails);

  // Re-sync when overlay updates (after enrichment)
  useEffect(() => {
    if (overlay) {
      const newPhones: string[] = [];
      if (overlay.phoneDetails) {
        for (const pd of overlay.phoneDetails) newPhones.push(pd.number);
      } else if (overlay.phones) {
        for (const ph of overlay.phones) newPhones.push(ph);
      }
      while (newPhones.length < 5) newPhones.push("");
      setPhoneSlots(newPhones);

      const newEmails: string[] = [];
      if (overlay.emailDetails) {
        for (const ed of overlay.emailDetails) newEmails.push(ed.email);
      } else if (overlay.emails) {
        for (const em of overlay.emails) newEmails.push(em);
      }
      while (newEmails.length < 2) newEmails.push("");
      setEmailSlots(newEmails);
    }
  }, [overlay]);

  const updatePhone = (i: number, val: string) => {
    setPhoneSlots((prev) => { const next = [...prev]; next[i] = val; return next; });
  };
  const updateEmail = (i: number, val: string) => {
    setEmailSlots((prev) => { const next = [...prev]; next[i] = val; return next; });
  };

  const hasChanges = useMemo(() => {
    const origPhones = initialPhones;
    const origEmails = initialEmails;
    return (
      propertyAddr !== (cf.address ?? "") ||
      propertyCity !== (cf.city ?? "") ||
      propertyState !== (cf.state ?? "") ||
      propertyZip !== (cf.zip ?? "") ||
      mailingAddr !== defaultMailing ||
      phoneSlots.some((p, i) => p !== origPhones[i]) ||
      emailSlots.some((e, i) => e !== origEmails[i])
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyAddr, propertyCity, propertyState, propertyZip, mailingAddr, phoneSlots, emailSlots]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const filledPhones = phoneSlots.filter((p) => p.trim().length >= 7);
      const filledEmails = emailSlots.filter((e) => e.includes("@"));
      const res = await fetch("/api/properties/update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          property_id: cf.propertyId,
          lead_id: cf.id,
          fields: {
            address: propertyAddr.trim(),
            city: propertyCity.trim(),
            state: propertyState.trim(),
            zip: propertyZip.trim(),
            owner_phone: filledPhones[0] || null,
            owner_email: filledEmails[0] || null,
            owner_flags: {
              mailing_address: mailingAddr.trim() || null,
              manual_phones: filledPhones,
              manual_emails: filledEmails,
              contact_updated_at: new Date().toISOString(),
            },
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error || !data.success) {
        throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
      }

      toast.success("Contact info saved");
      setEditing(false);
      onRefresh?.();
    } catch (err) {
      console.error("[Contact] Save error:", err);
      toast.error("Failed to save contact info");
    } finally {
      setSaving(false);
    }
  };

  // Show enrich button when no phones are populated (regardless of enriched badge)
  const hasPhones = phoneSlots.some((p) => p.trim().length >= 7);

  return (
    <div className="space-y-4 max-w-[680px] mx-auto">
      {/* â”€â”€ Street View / Satellite Image â”€â”€ */}
      {imageUrl && (
        <div className="rounded-[12px] border border-white/[0.06] overflow-hidden">
          <a
            href={streetViewLink ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block h-44 group cursor-pointer"
            onClick={(e) => { if (!streetViewLink) e.preventDefault(); }}
          >
            <img
              src={imageUrl}
              alt="Property"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,7,13,0.85)] via-[rgba(7,7,13,0.2)] to-transparent pointer-events-none" />
            {streetViewLink && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <span className="bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <ExternalLink className="h-3 w-3" />{streetViewUrl ? "Open Street View" : "Open in Google Maps"}
                </span>
              </div>
            )}
            <div className="absolute bottom-2 right-3 flex items-center gap-1 text-[9px] text-white/50">
              <ImageIcon className="h-2.5 w-2.5" />{streetViewUrl ? "Street View" : "Satellite"}
            </div>
          </a>
        </div>
      )}

      {/* â”€â”€ Edit / Save controls â”€â”€ */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Contact2 className="h-4 w-4 text-cyan/60" />
          Contact Information
        </h3>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="h-7 px-3 rounded-md text-[10px] font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors"
              >Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="h-7 px-3 rounded-md text-[10px] font-semibold bg-cyan/15 text-cyan border border-cyan/20 hover:bg-cyan/25 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="h-7 px-3 rounded-md text-[10px] font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Pencil className="h-3 w-3" />Edit
            </button>
          )}
        </div>
      </div>

      {/* â”€â”€ Property Address â”€â”€ */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="h-3 w-3" />Property Address
        </p>
        {editing ? (
          <div className="grid grid-cols-[1fr] gap-2">
            <input
              value={propertyAddr}
              onChange={(e) => setPropertyAddr(e.target.value)}
              placeholder="Street address"
              className="w-full bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                value={propertyCity}
                onChange={(e) => setPropertyCity(e.target.value)}
                placeholder="City"
                className="bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
              />
              <input
                value={propertyState}
                onChange={(e) => setPropertyState(e.target.value)}
                placeholder="State"
                className="bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
              />
              <input
                value={propertyZip}
                onChange={(e) => setPropertyZip(e.target.value)}
                placeholder="ZIP"
                className="bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{buildAddress(propertyAddr, propertyCity, propertyState, propertyZip) || "â€”"}</p>
            {(propertyAddr || propertyCity) && <CopyBtn text={buildAddress(propertyAddr, propertyCity, propertyState, propertyZip)} />}
          </div>
        )}
      </div>

      {/* â”€â”€ Mailing Address â”€â”€ */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="h-3 w-3" />Mailing Address
        </p>
        {editing ? (
          <input
            value={mailingAddr}
            onChange={(e) => setMailingAddr(e.target.value)}
            placeholder="Mailing address (if different from property)"
            className="w-full bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
          />
        ) : (
          <p className="text-sm text-foreground">{mailingAddr || <span className="text-muted-foreground/40 italic">No mailing address on file</span>}</p>
        )}
      </div>

      {/* â”€â”€ Phone Numbers (5 slots) â”€â”€ */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Phone className="h-3 w-3" />Phone Numbers ({phoneSlots.filter((p) => p.trim().length >= 7).length}/{phoneSlots.length})
          </p>
          {!hasPhones && (
            <button
              onClick={onSkipTrace}
              disabled={skipTracing}
              className="h-6 px-2.5 rounded-md text-[9px] font-semibold border border-amber-500/30 bg-amber-500/[0.06] text-amber-400 hover:bg-amber-500/[0.12] transition-colors flex items-center gap-1"
            >
              {skipTracing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
              {skipTracing ? "Deep Skipping..." : "~90s Deep Skip"}
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {phoneSlots.map((phone, i) => {
            const detail = phoneDetails[i];
            const hasPhone = phone.trim().length >= 7;

            if (editing) {
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 w-4 text-center">{i + 1}</span>
                  <input
                    value={phone}
                    onChange={(e) => updatePhone(i, e.target.value)}
                    placeholder={`Phone ${i + 1}`}
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-cyan/30"
                  />
                </div>
              );
            }

            if (!hasPhone) {
              return (
                <div key={i} className="rounded-[10px] border border-dashed border-white/[0.06] bg-white/[0.01] p-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground/20" />
                    </div>
                    <span className="text-sm font-mono text-muted-foreground/15">(â€¢â€¢â€¢) â€¢â€¢â€¢-â€¢â€¢â€¢â€¢</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                    detail?.lineType === "mobile" ? "bg-emerald-500/10" : "bg-cyan/10",
                  )}>
                    {detail?.lineType === "mobile" ? <Smartphone className="h-3.5 w-3.5 text-emerald-400" /> : <Phone className="h-3.5 w-3.5 text-cyan/70" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold font-mono text-foreground">{phone}</span>
                      {i === 0 && <Badge variant="outline" className="text-[7px] py-0 px-1 border-cyan/30 text-cyan">BEST</Badge>}
                      {detail?.dnc && <Badge variant="outline" className="text-[7px] py-0 px-1 border-red-500/30 text-red-400">DNC</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {detail?.lineType && (
                        <span className="text-[10px] text-muted-foreground capitalize">{detail.lineType}</span>
                      )}
                      {detail?.confidence != null && (
                        <span className="text-[10px] text-muted-foreground">{detail.confidence}%</span>
                      )}
                      {detail?.source && (
                        <Badge variant="outline" className={cn(
                          "text-[7px] py-0 px-1",
                          detail.source === "batchdata" ? "border-emerald-500/30 text-emerald-400"
                            : String(detail.source).startsWith("openclaw") ? "border-purple-500/30 text-purple-400"
                            : "border-cyan/30 text-cyan/70",
                        )}>
                          {detail.source === "batchdata" ? "BD" : String(detail.source).startsWith("openclaw") ? "OC" : "PR"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onDial(phone)}
                      disabled={calling || detail?.dnc}
                      className="h-7 px-2 rounded-md text-[10px] font-semibold bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition-all flex items-center gap-1 disabled:opacity-30"
                    >
                      <Phone className="h-3 w-3" />Dial
                    </button>
                    <button
                      onClick={() => onSms(phone)}
                      disabled={detail?.lineType === "landline"}
                      className="h-7 px-2 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all flex items-center gap-1 disabled:opacity-30"
                    >
                      <MessageSquare className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* â”€â”€ Emails (dynamic slots) â”€â”€ */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="h-3 w-3" />Emails ({emailSlots.filter((e) => e.includes("@")).length}/{emailSlots.length})
        </p>
        <div className="space-y-1.5">
          {emailSlots.map((email, i) => {
            const detail = emailDetails[i];
            const hasEmail = email.includes("@");

            if (editing) {
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 w-4 text-center">{i + 1}</span>
                  <input
                    value={email}
                    onChange={(e) => updateEmail(i, e.target.value)}
                    placeholder={`Email ${i + 1}`}
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-cyan/30"
                  />
                </div>
              );
            }

            if (!hasEmail) {
              return (
                <div key={i} className="rounded-[10px] border border-dashed border-white/[0.06] bg-white/[0.01] p-2.5">
                  <div className="flex items-center gap-2.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/20" />
                    <span className="text-sm font-mono text-muted-foreground/15">â€¢â€¢â€¢â€¢â€¢â€¢â€¢@â€¢â€¢â€¢â€¢â€¢.com</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-2.5">
                  <Mail className="h-3.5 w-3.5 text-cyan/60" />
                  <a href={`mailto:${email}`} className="text-sm text-cyan hover:underline">{email}</a>
                  {i === 0 && <Badge variant="outline" className="text-[8px] py-0 px-1 border-cyan/30 text-cyan">PRIMARY</Badge>}
                  {detail?.deliverable && (
                    <Badge variant="outline" className="text-[7px] py-0 px-1 border-emerald-500/30 text-emerald-400">Verified</Badge>
                  )}
                  {detail?.source && (
                    <Badge variant="outline" className={cn(
                      "text-[7px] py-0 px-1",
                      detail.source === "batchdata" ? "border-emerald-500/30 text-emerald-400"
                        : String(detail.source).startsWith("openclaw") ? "border-purple-500/30 text-purple-400"
                        : "border-cyan/30 text-cyan/70",
                    )}>
                      {detail.source === "batchdata" ? "BD" : String(detail.source).startsWith("openclaw") ? "OC" : "PR"}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* â”€â”€ Associated Persons â”€â”€ */}
      {persons.length > 0 && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <User className="h-3 w-3" />Associated Persons ({persons.length})
          </p>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {persons.map((person: any, i: number) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <div className="h-7 w-7 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{person.name ?? "Unknown"}</span>
                    <Badge variant="outline" className="text-[7px] py-0 px-1">{person.relation ?? person.role ?? "Owner"}</Badge>
                    {person.source && (
                      <Badge variant="outline" className={cn(
                        "text-[7px] py-0 px-1",
                        person.source === "batchdata" ? "border-emerald-500/30 text-emerald-400"
                          : String(person.source).startsWith("openclaw") ? "border-purple-500/30 text-purple-400"
                          : "border-cyan/30 text-cyan/70",
                      )}>
                        {person.source === "batchdata" ? "BD" : String(person.source).startsWith("openclaw") ? "OC" : "PR"}
                      </Badge>
                    )}
                  </div>
                  {person.age && <span className="text-[10px] text-muted-foreground">Age {person.age}</span>}
                  {person.occupation && <span className="text-[10px] text-muted-foreground ml-2">{person.occupation}</span>}
                  {person.mailing_address && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {typeof person.mailing_address === "string"
                        ? person.mailing_address
                        : typeof person.mailing_address === "object"
                          ? [person.mailing_address.street, person.mailing_address.city, person.mailing_address.state, person.mailing_address.zip].filter(Boolean).join(", ")
                          : ""}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// OVERVIEW TAB
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function OverviewTab({ cf, computedArv, skipTracing, skipTraceResult, skipTraceMs, overlay, skipTraceError, onSkipTrace, onManualSkipTrace, onEdit, onDial, onSms, calling, dialHistory, autofilling, onAutofill, deepCrawling, deepCrawlResult, deepCrawlExpanded, setDeepCrawlExpanded, executeDeepCrawl, hasSavedReport, loadingReport, loadSavedReport, crawlSteps, deepSkipResult, qualification, qualificationDirty, qualificationSaving, qualificationEditable, qualificationSuggestedRoute, onQualificationChange, onQualificationRouteSelect, onQualificationSave, offerPrepDraft, offerPrepEditing, offerPrepSaving, onOfferPrepDraftChange, onOfferPrepEditToggle, onOfferPrepSave, offerStatusDraft, offerStatusEditing, offerStatusSaving, onOfferStatusDraftChange, onOfferStatusEditToggle, onOfferStatusSave, buyerDispoTruthDraft, buyerDispoTruthEditing, buyerDispoTruthSaving, onBuyerDispoTruthDraftChange, onBuyerDispoTruthEditToggle, onBuyerDispoTruthSave }: {
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
}) {
  const displayPhone = overlay?.primaryPhone ?? cf.ownerPhone ?? (cf.ownerFlags?.contact_phone as string | null) ?? null;
  const displayEmail = overlay?.primaryEmail ?? cf.ownerEmail ?? (cf.ownerFlags?.contact_email as string | null) ?? null;
  const { notes: callHistory } = useCallNotes(cf.id, 5);
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
  const canEdit = ["prospect", "lead"].includes(cf.status);

  const { brief, loading: briefLoading, regenerate: regenerateBrief } = usePreCallBrief(cf.id);

  const bestPhone = allPhones[0] ?? (phoneDetails[0]?.number) ?? displayPhone;
  const phoneConfidence = phoneDetails.length > 0
    ? phoneDetails[0]?.confidence ?? 70
    : allPhones.length >= 3 ? 95 : allPhones.length === 2 ? 80 : allPhones.length === 1 ? 65 : null;

  const equityPct = cf.equityPercent ?? 0;
  const equityIsGreen = equityPct >= 50;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;
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
    ? (cf.equityPercent >= 50 ? "text-emerald-400 bg-emerald-500/10" : cf.equityPercent >= 25 ? "text-amber-400 bg-amber-500/10" : "text-red-400 bg-red-500/10")
    : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mailingAddr = cf.isAbsentee ? ((persons[0] as any)?.mailing_address ?? prRaw.MailAddress ?? prRaw.MailingAddress ?? null) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heirContacts = (cf.ownerFlags?.heir_contacts as any[]) ?? [];

  const warningFlags = useMemo(() => {
    const flags: { label: string; color: string }[] = [];
    if (prRaw.isListedForSale === "Yes" || prRaw.isListedForSale === true) flags.push({ label: "Listed for Sale", color: "text-red-400 bg-red-500/10 border-red-500/20" });
    if (prRaw.isRecentSale === "Yes" || prRaw.isRecentSale === true) flags.push({ label: "Recent Sale", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" });
    if (prRaw.isRecentFlip === "Yes" || prRaw.isRecentFlip === true) flags.push({ label: "Recent Flip", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" });
    if (prRaw.isAuction === "Yes" || prRaw.isAuction === true) flags.push({ label: "Auction", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" });
    if (prRaw.isBankOwned === "Yes" || prRaw.isBankOwned === true) flags.push({ label: "Bank-Owned (REO)", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" });
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
        ...(eventsRes.data ?? []).map((e: any) => ({
          id: e.id, type: "event", disposition: e.action,
          notes: typeof e.details === "object" ? JSON.stringify(e.details) : e.details,
          created_at: e.created_at,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);
      setActivityLog(merged);
    })();
  }, [cf.id, cf.propertyId]);

  const streetViewUrl = prRaw.StreetViewUrl ?? prRaw.PropertyImageUrl ?? (prRaw.Photos?.[0]) ?? null;

  // â”€â”€ Zillow photo carousel â”€â”€
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

  // â”€â”€ Geocode if no lat/lng from data (same as Comps tab) â”€â”€
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

  // â”€â”€ Clickable Street View â†’ Google Maps â”€â”€
  const streetViewLink = propLat && propLng ? getGoogleStreetViewLink(propLat, propLng) : null;

  // â”€â”€ Satellite tile fallback when no Street View available â”€â”€
  const satelliteFallbackUrl = (!streetViewUrl && propLat && propLng) ? getSatelliteTileUrl(propLat, propLng, 18) : null;
  const imageUrl = streetViewUrl ?? satelliteFallbackUrl;
  const imageLabel = streetViewUrl ? "Street View" : "Satellite";
  // â”€â”€ Small thumbnail for property tile (always satellite for compact view) â”€â”€
  const thumbUrl = propLat && propLng ? getSatelliteTileUrl(propLat, propLng, 17) : null;

  const sectionOwner = useRef<HTMLDivElement>(null);
  const sectionSignals = useRef<HTMLDivElement>(null);
  const sectionEquity = useRef<HTMLDivElement>(null);
  const sectionProperty = useRef<HTMLDivElement>(null);
  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // â”€â”€ MAO Formula: ARV Ã— 75% âˆ’ Repairs (10%) âˆ’ Assignment Fee ($15K) â”€â”€
  const persistedCompArv = (cf.ownerFlags?.comp_arv as number) ?? 0;
  const bestArv = computedArv > 0 ? computedArv : persistedCompArv > 0 ? persistedCompArv : cf.estimatedValue ?? 0;
  const arvSource: "comps" | "avm" = (computedArv > 0 || persistedCompArv > 0) ? "comps" : "avm";
  const compCount = (cf.ownerFlags?.comp_count as number) ?? 0;

  const wholesaleRate = 0.75;
  const repairRate = 0.10;
  const assignmentFee = 15000;
  const wholesaleValue = bestArv > 0 ? Math.round(bestArv * wholesaleRate) : 0;
  const repairEstimate = bestArv > 0 ? Math.round(bestArv * repairRate) : 0;
  const mao = bestArv > 0 ? Math.round(wholesaleValue - repairEstimate - assignmentFee) : null;

  // â”€â”€ Signal-specific motivation text â”€â”€
  const getSignalMotivation = (evtType: string, rd?: Record<string, unknown>): string => {
    switch (evtType) {
      case "pre_foreclosure": case "foreclosure": {
        const d = rd?.ForeclosureRecDate ?? rd?.event_date;
        return d ? `Foreclosure filed ${new Date(String(d)).toLocaleDateString()} â€” auction pressure` : "Foreclosure filing â€” auction pressure mounting";
      }
      case "tax_lien": case "tax_delinquency": {
        const amt = rd?.DelinquentAmount ?? rd?.delinquent_amount;
        const inst = rd?.NumberDelinquentInstallments;
        return amt ? `Tax delinquent $${Number(amt).toLocaleString()}${inst ? ` â€” ${inst} installments behind` : ""}` : "Tax delinquent â€” penalties accumulating";
      }
      case "divorce": return "Divorce filing â€” forced partition possible";
      case "probate": case "deceased": return "Estate in probate â€” heirs likely want quick liquidation";
      case "bankruptcy": return "Bankruptcy filing â€” motivated to resolve debts";
      case "code_violation": return "Code violations â€” mounting fines, pressure to sell";
      case "vacant": return "Vacant property â€” carrying costs with no income";
      case "inherited": return "Inherited property â€” heirs may want fast liquidation";
      case "tired_landlord": return "Long-term landlord showing signs of fatigue â€” may want to exit their rental portfolio";
      case "underwater": return "Negative equity means the owner owes more than the home is worth â€” potential short sale candidate";
      default: return "Distress signal â€” may be motivated to sell";
    }
  };

  // â”€â”€ Actual event date extraction from raw_data â”€â”€
  const getEventDate = (evt: { created_at: string; raw_data?: Record<string, unknown> }): { date: string; isActual: boolean } => {
    const rd = evt.raw_data ?? {};
    const dateVal = rd.ForeclosureRecDate ?? rd.event_date ?? rd.filing_date ?? rd.recording_date ?? rd.delinquent_date ?? null;
    if (dateVal && typeof dateVal === "string") {
      try { return { date: new Date(dateVal).toLocaleDateString(), isActual: true }; } catch { /* fall through */ }
    }
    return { date: new Date(evt.created_at).toLocaleDateString(), isActual: false };
  };

  // â”€â”€ Humanize source name â”€â”€
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
      ? "border-cyan/25 bg-cyan/[0.06] text-cyan"
      : cf.offerStatus === "offer_made"
        ? "border-blue-500/25 bg-blue-500/[0.07] text-blue-300"
        : cf.offerStatus === "seller_reviewing"
          ? "border-purple-500/25 bg-purple-500/[0.07] text-purple-300"
          : cf.offerStatus === "declined"
            ? "border-zinc-500/25 bg-zinc-500/[0.07] text-zinc-300"
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
      ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300"
      : offerStatusSnapshot.status === "passed_not_moving_forward"
        ? "border-zinc-500/25 bg-zinc-500/[0.07] text-zinc-300"
        : offerStatusSnapshot.status === "counter_needs_revision"
          ? "border-amber-500/25 bg-amber-500/[0.08] text-amber-300"
          : offerStatusSnapshot.status
            ? "border-cyan/25 bg-cyan/[0.08] text-cyan"
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
      ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300"
      : buyerDispoTruthSnapshot.buyerFit === "narrow"
        ? "border-amber-500/25 bg-amber-500/[0.08] text-amber-300"
        : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";
  const buyerDispoTruthStatusToneClass =
    buyerDispoTruthSnapshot.dispoStatus === "ready"
      ? "border-cyan/25 bg-cyan/[0.08] text-cyan"
      : buyerDispoTruthSnapshot.dispoStatus === "needs_review"
        ? "border-blue-500/25 bg-blue-500/[0.07] text-blue-300"
        : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";
  const canEditBuyerDispoTruth = cf.status !== "dead" && cf.status !== "closed";
  const buyerFitToneClass =
    buyerDispo.buyerFit === "broad"
      ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300"
      : buyerDispo.buyerFit === "narrow"
        ? "border-amber-500/25 bg-amber-500/[0.08] text-amber-300"
        : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";
  const dispoReadinessToneClass =
    buyerDispo.dispoReadiness === "ready"
      ? "border-blue-500/25 bg-blue-500/[0.08] text-blue-300"
      : buyerDispo.dispoReadiness === "needs_review"
        ? "border-cyan/25 bg-cyan/[0.08] text-cyan"
        : "border-white/[0.12] bg-white/[0.03] text-muted-foreground";

  useEffect(() => {
    setShowAllCallAssist(false);
  }, [cf.id]);

  return (
    <div className="space-y-5">
      {/* â•â•â• 1. CALL CARD â€” WHO + NUMBER (hero section) â•â•â• */}
      <div ref={sectionOwner} className="rounded-[12px] border-2 border-cyan/30 bg-cyan/[0.03] p-4 relative overflow-hidden shadow-[0_0_20px_rgba(0,212,255,0.08)]">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan/[0.05] via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan/50 to-transparent" />

        <div className="relative z-10">
          {/* Owner name + badges */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-lg font-bold text-foreground truncate">{cf.ownerName || "â€”"}</p>
                <RelationshipBadge data={{
                  ownerAgeInference: cf.prediction?.ownerAgeInference,
                  lifeEventProbability: cf.prediction?.lifeEventProbability,
                  tags: cf.tags,
                  bestAddress: cf.fullAddress,
                }} />
                {ownerAge && <span className="text-[10px] text-muted-foreground/60">Age ~{ownerAge}</span>}
                {pipelineDays != null && <Badge variant="outline" className="text-[8px] border-white/10 text-muted-foreground/60">{pipelineDays}d</Badge>}
              </div>
            </div>
          </div>

          {/* Mailing Address for absentee owners */}
          {mailingAddr && (
            <div className="rounded-[10px] border border-blue-500/15 bg-blue-500/[0.04] p-2.5 mb-3">
              <div className="flex items-start gap-2">
                <MapPinned className="h-3.5 w-3.5 text-blue-400/70 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-blue-400/60 uppercase tracking-widest">Mailing Address (Absentee)</p>
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
            <div className="rounded-[10px] border border-red-500/30 bg-red-500/[0.08] p-3 mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-red-400 uppercase">Known TCPA Litigator</p>
                  <p className="text-[10px] text-red-300/70">Do NOT call or text this owner. High litigation risk.</p>
                </div>
              </div>
            </div>
          )}


          {/* Heir Contacts (probate situations) */}
          {heirContacts.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] text-red-400/80 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />Heir / Decision-Maker Contacts
              </p>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {heirContacts.map((heir: any, i: number) => (
                <div key={i} className="rounded-md border border-red-500/15 bg-red-500/[0.04] p-2.5 text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-red-400/60" />
                    <span className="font-semibold text-foreground">{heir.name ?? "Unknown Heir"}</span>
                    {heir.role && <span className="text-muted-foreground">({heir.role})</span>}
                  </div>
                  {heir.phone && (
                    <div className="pl-5 flex items-center gap-1.5">
                      <Phone className="h-2.5 w-2.5 text-cyan/60" />
                      <button onClick={() => onDial(heir.phone)} className="text-cyan hover:underline font-mono text-xs">{heir.phone}</button>
                    </div>
                  )}
                  {heir.email && (
                    <div className="pl-5 flex items-center gap-1.5">
                      <Mail className="h-2.5 w-2.5 text-cyan/60" />
                      <a href={`mailto:${heir.email}`} className="text-cyan hover:underline">{heir.email}</a>
                    </div>
                  )}
                  {heir.mailing && <div className="pl-5 text-muted-foreground">{heir.mailing}</div>}
                </div>
              ))}
            </div>
          )}

          {skipTraceResult && !skipTraceError && (
            <div className={cn("mt-2 text-xs px-3 py-2 rounded-md border", skipTraceResult.startsWith("Found") ? "text-cyan bg-cyan/4 border-cyan/15" : "text-red-400 bg-red-500/5 border-red-500/20")}>
              <div className="flex items-center justify-between gap-2">
                <span>{skipTraceResult}</span>
                {skipTraceMs != null && (
                  <span className={cn("font-mono text-[10px] shrink-0 px-1.5 py-0.5 rounded", skipTraceMs <= 2000 ? "text-cyan bg-cyan/8" : "text-amber-400 bg-amber-500/10")}>
                    {(skipTraceMs / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
            </div>
          )}

          {skipTraceError && (
            <div className="mt-2 rounded-[10px] border border-red-500/20 bg-red-500/5 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-semibold text-red-400">{skipTraceError.error}</p>
                  {skipTraceError.reason && <p className="text-[11px] text-red-300/80">{skipTraceError.reason}</p>}
                  {skipTraceError.address_issues && skipTraceError.address_issues.length > 0 && (
                    <div className="space-y-0.5">
                      {skipTraceError.address_issues.map((issue, i) => (
                        <p key={i} className="text-[10px] text-amber-400/80 flex items-center gap-1">
                          <span className="text-amber-400">&#9679;</span>{issue}
                        </p>
                      ))}
                    </div>
                  )}
                  {skipTraceError.suggestion && <p className="text-[11px] text-cyan/70 italic">{skipTraceError.suggestion}</p>}
                  {skipTraceError.tier_reached && <p className="text-[10px] text-muted-foreground/50 font-mono">Lookup stopped at: {skipTraceError.tier_reached}</p>}
                </div>
                {skipTraceMs != null && (
                  <span className="font-mono text-[10px] shrink-0 px-1.5 py-0.5 rounded text-red-400 bg-red-500/10">
                    {(skipTraceMs / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
              <Button
                size="sm"
                onClick={onManualSkipTrace}
                disabled={skipTracing}
                className="w-full gap-2 bg-amber-600 hover:bg-amber-500 text-white border-0 shadow-[0_0_14px_rgba(245,158,11,0.25)] hover:shadow-[0_0_22px_rgba(245,158,11,0.4)] transition-all"
              >
                {skipTracing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Manual Skip Trace â€” Force Partial Lookup
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* â•â•â• 2. COMPLIANCE GATE â€” DNC / Litigator â•â•â• */}
      {(isLitigator || hasDncNumbers) && (
        <div className="rounded-[10px] border border-red-500/40 bg-red-500/[0.12] p-3 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-400 shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-400 uppercase tracking-wide">
              {isLitigator ? "TCPA Litigator â€” DO NOT CONTACT" : "DNC Numbers Detected"}
            </p>
            <p className="text-[10px] text-red-300/70 mt-0.5">
              {isLitigator ? "High litigation risk. No calls, texts, or mailers to this owner." : "One or more phone numbers are on the DNC list. Check before dialing."}
            </p>
          </div>
        </div>
      )}

      {/* â•â•â• 3. DISTRESS SIGNALS + EXTERNAL LINKS â€” side by side â•â•â• */}
      <div className="flex gap-3">
        {/* Distress Signals â€” left half */}
        <div ref={sectionSignals} className="flex-1 min-w-0 rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-orange-400" />
              <p className="text-[10px] text-orange-400/80 uppercase tracking-wider font-semibold">Distress Signals</p>
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
                    title={`${motivation}\nPer ${sourceName(evt.source)} Â· ${evtDate.isActual ? "filed" : "detected"} ${evtDate.date}`}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border cursor-default transition-colors",
                      cfg?.color ?? "text-cyan/70 bg-cyan/[0.06] border-cyan/20",
                      isRecent && "ring-1 ring-orange-400/30"
                    )}
                  >
                    <EvtIcon className="h-2.5 w-2.5 shrink-0" />
                    {cfg?.label ?? evt.event_type.replace(/_/g, " ")}
                    <span className="text-[8px] opacity-60">Â· {evtDate.date.replace(/\/\d{4}$/, "")}</span>
                    {isRecent && <Flame className="h-2.5 w-2.5 text-red-400 shrink-0" />}
                  </span>
                );
              })}
              {distressEvents.length > 6 && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold border border-white/10 text-muted-foreground bg-white/[0.03]">
                  +{distressEvents.length - 6} more
                </span>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/50">No distress signals detected</p>
          )}
        </div>

        {/* External Links + County Records â€” right half */}
        <div className="flex-1 min-w-0 rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-3 w-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">External Links</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cf.radarId && (
              <a href={`https://app.propertyradar.com/properties/${cf.radarId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-cyan/70 hover:text-cyan transition-colors">
                <Radar className="h-2.5 w-2.5" />PropertyRadar
              </a>
            )}
            {(() => {
              const listingUrl = String(cf.ownerFlags?.listing_url ?? cf.ownerFlags?.link ?? "");
              return listingUrl ? (
                <a href={listingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-orange-400/80 hover:text-orange-400 transition-colors">
                  <ExternalLink className="h-2.5 w-2.5" />Listing
                </a>
              ) : null;
            })()}
            {cf.fullAddress && (
              <>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cf.fullAddress)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-cyan/70 hover:text-cyan transition-colors">
                  <Map className="h-2.5 w-2.5" />Maps
                </a>
                <a href={`https://www.zillow.com/homes/${encodeURIComponent(cf.fullAddress)}_rb/`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-cyan/70 hover:text-cyan transition-colors">
                  <ExternalLink className="h-2.5 w-2.5" />Zillow
                </a>
                <a href={`https://www.redfin.com/search#query=${encodeURIComponent(cf.fullAddress)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-cyan/70 hover:text-cyan transition-colors">
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
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{countyInfo.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <a href={countyInfo.gis(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1 text-[9px] h-6 px-2">
                        <Map className="h-2.5 w-2.5 text-cyan/60" />GIS
                      </Button>
                    </a>
                    <a href={countyInfo.assessor(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1 text-[9px] h-6 px-2">
                        <Building className="h-2.5 w-2.5 text-cyan/60" />Assessor
                      </Button>
                    </a>
                    {countyInfo.treasurer && (
                      <a href={countyInfo.treasurer(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1 text-[9px] h-6 px-2">
                          <DollarSign className="h-2.5 w-2.5 text-cyan/60" />Tax
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
                    <Button size="sm" variant="outline" className="gap-1 text-[9px] h-6 px-2">
                      <Search className="h-2.5 w-2.5 text-cyan/60" />{cf.county} Records
                    </Button>
                  </a>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>

      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-cyan" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Recent Communication</p>
          {activityLog.length > 0 && (
            <Badge variant="outline" className="text-[9px] ml-1">{Math.min(activityLog.length, 4)}</Badge>
          )}
          <button
            className="ml-auto text-[10px] text-cyan/70 hover:text-cyan transition-colors"
            onClick={() => setTimelinesOpen(true)}
          >
            Open full timeline
          </button>
        </div>
        {activityLog.length > 0 ? (
          <div className="space-y-1.5">
            {activityLog.slice(0, 4).map((entry) => {
              const dispositionLabel = entry.disposition?.replace(/_/g, " ") ?? entry.type;
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
                    <p className="font-semibold text-foreground capitalize">{dispositionLabel}</p>
                    {notePreview && <p className="text-[10px] text-muted-foreground/65 truncate max-w-[430px]">{notePreview}</p>}
                  </div>
                  <p className="shrink-0 text-[9px] text-muted-foreground/50">{formatRelativeFromNow(entry.created_at)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/55">No calls, texts, or notes logged yet.</p>
        )}
      </div>

      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-cyan" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Call Assist</p>
          <Badge variant="outline" className="text-[9px] ml-1 border-white/[0.14] text-muted-foreground">
            Talking points
          </Badge>
          {callAssistAllCards.length > callAssistDefaultCards.length && (
            <button
              type="button"
              onClick={() => setShowAllCallAssist((prev) => !prev)}
              className="ml-auto text-[10px] text-cyan/70 hover:text-cyan transition-colors"
            >
              {showAllCallAssist ? "Show less" : `Show all (${callAssistAllCards.length})`}
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          Compact scaffolding for live calls. Adapt naturally to seller context.
        </p>
        <div className="space-y-2">
          {callAssistVisibleCards.map((card) => (
            <div key={card.id} className="rounded-[8px] border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
              <p className="text-[11px] font-semibold text-foreground">{card.title}</p>
              <p className="text-[10px] text-muted-foreground/65 mt-0.5">{card.summary}</p>
              <div className="mt-1.5 space-y-1">
                {card.talkingPoints.slice(0, 2).map((point, idx) => (
                  <p key={idx} className="text-[10px] text-foreground/85">
                    <span className="text-cyan/70 mr-1">&#8226;</span>{point}
                  </p>
                ))}
              </div>
              <p className="text-[9px] text-amber-300/80 mt-1.5">{card.actionHint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-cyan" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Offer Progress</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", offerStatusToneClass)}>
            {offerStatusLabel}
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            {offerStatusHint}
          </span>
        </div>
        {offerPrepActive && (
          <div className={cn(
            "rounded-[8px] border px-2.5 py-2 space-y-1.5",
            offerPrepStale || offerPrepMissing ? "border-amber-500/30 bg-amber-500/[0.08]" : "border-cyan/20 bg-cyan/[0.06]",
          )}>
            <p className="text-[10px] text-foreground/90">
              Workload: <span className="font-semibold">Run comps + prepare offer range</span>
            </p>
            <p className="text-[10px] text-muted-foreground/80">
              Next offer-prep follow-up: <span className="text-foreground font-medium">{offerPrepDueLabel}</span>
            </p>
            <p className={cn("text-[10px]", offerPrepStale || offerPrepMissing ? "text-amber-300" : "text-cyan/80")}>
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
          <Calculator className="h-3.5 w-3.5 text-cyan" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Offer Prep Snapshot</p>
          <Badge variant="outline" className="text-[9px] border-white/[0.14] text-muted-foreground">Operator entered</Badge>
          {offerPrepHealth.state !== "not_applicable" && (
            <Badge
              variant="outline"
              className={cn(
                "text-[9px]",
                offerPrepHealth.state === "ready"
                  ? "border-emerald-500/25 text-emerald-300"
                  : "border-amber-500/30 text-amber-300",
              )}
            >
              {offerPrepHealth.label}
            </Badge>
          )}
          {canEditOfferPrep && (
            <button
              type="button"
              onClick={() => onOfferPrepEditToggle(!offerPrepEditing)}
              className="ml-auto text-[10px] text-cyan/75 hover:text-cyan transition-colors"
              disabled={offerPrepSaving}
            >
              {offerPrepEditing ? "Cancel" : "Edit"}
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/70">
          Offer progress is derived. Offer prep snapshot is operator-entered and should reflect your current comping assumptions.
        </p>

        {offerPrepEditing ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">ARV Used</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offerPrepDraft.arvUsed}
                  onChange={(e) => onOfferPrepDraftChange({ arvUsed: e.target.value })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Rehab Estimate</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offerPrepDraft.rehabEstimate}
                  onChange={(e) => onOfferPrepDraftChange({ rehabEstimate: e.target.value })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">MAO Low</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offerPrepDraft.maoLow}
                  onChange={(e) => onOfferPrepDraftChange({ maoLow: e.target.value })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">MAO High</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offerPrepDraft.maoHigh}
                  onChange={(e) => onOfferPrepDraftChange({ maoHigh: e.target.value })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Confidence</span>
                <select
                  value={offerPrepDraft.confidence}
                  onChange={(e) => onOfferPrepDraftChange({ confidence: (e.target.value as OfferPrepConfidence | "") })}
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                >
                  <option value="">Select confidence</option>
                  {OFFER_PREP_CONFIDENCE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Sheet / Calculator Link (optional)</span>
                <input
                  type="url"
                  value={offerPrepDraft.sheetUrl}
                  onChange={(e) => onOfferPrepDraftChange({ sheetUrl: e.target.value })}
                  placeholder="https://docs.google.com/..."
                  className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus:border-cyan/30"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground/65">
                Last updated: <span className="text-foreground/85">{offerPrepUpdatedLabel}</span>
              </p>
              <Button size="sm" className="h-7 text-[11px]" disabled={offerPrepSaving} onClick={onOfferPrepSave}>
                {offerPrepSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save Snapshot
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
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
                className="inline-flex items-center gap-1 text-[10px] text-cyan/80 hover:text-cyan"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Open comp/calculator sheet
              </a>
            )}
          </div>
        )}
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

      {/* Intake Guide — visible for early-stage leads (prospect/lead with 0-1 calls) */}
      <IntakeGuideSection cf={cf} />

      {showQualificationBlock && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-cyan" />
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Qualification</p>
            {!qualificationEditable && (
              <Badge variant="outline" className="text-[9px] ml-1 border-white/[0.14] text-muted-foreground">Read-only</Badge>
            )}
          </div>

          {qualificationEditable ? (
            <div className="space-y-3">
              <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.015] px-2.5 py-2 space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="uppercase tracking-wider text-muted-foreground font-semibold">Qualification Completeness</span>
                  <span className={cn(
                    "font-semibold",
                    qualificationCompletenessRatio >= 0.8
                      ? "text-emerald-300"
                      : qualificationCompletenessRatio >= 0.4
                        ? "text-amber-300"
                        : "text-red-300"
                  )}>
                    {qualificationCompleteCount}/{qualificationCompletenessTotal}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      qualificationCompletenessRatio >= 0.8
                        ? "bg-emerald-400/80"
                        : qualificationCompletenessRatio >= 0.4
                          ? "bg-amber-400/80"
                          : "bg-red-400/80",
                    )}
                    style={{ width: `${qualificationCompletenessPct}%` }}
                  />
                </div>
                {qualificationMissingLabels.length > 0 ? (
                  <p className="text-[10px] text-muted-foreground/75">
                    Missing before routing: <span className="text-foreground/85">{qualificationMissingLabels.join(", ")}</span>
                  </p>
                ) : (
                  <p className="text-[10px] text-emerald-300/90">Core qualification inputs are complete.</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Motivation</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onQualificationChange({ motivationLevel: level })}
                        className={cn(
                          "h-7 w-7 rounded-[8px] border text-[11px] font-semibold transition-colors",
                          qualification.motivationLevel === level
                            ? "border-cyan/40 bg-cyan/[0.12] text-cyan"
                            : "border-white/[0.12] bg-white/[0.04] text-muted-foreground hover:border-white/[0.2]"
                        )}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Condition</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onQualificationChange({ conditionLevel: level })}
                        className={cn(
                          "h-7 w-7 rounded-[8px] border text-[11px] font-semibold transition-colors",
                          qualification.conditionLevel === level
                            ? "border-cyan/40 bg-cyan/[0.12] text-cyan"
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
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Occupancy</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onQualificationChange({ occupancyScore: level })}
                        className={cn(
                          "h-7 w-7 rounded-[8px] border text-[11px] font-semibold transition-colors",
                          qualification.occupancyScore === level
                            ? "border-cyan/40 bg-cyan/[0.12] text-cyan"
                            : "border-white/[0.12] bg-white/[0.04] text-muted-foreground hover:border-white/[0.2]"
                        )}
                      >
                        {level}
                      </button>
                    ))}
                    <span className="text-[9px] text-muted-foreground/60 ml-1">1=occupied · 5=vacant</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Equity / Flexibility</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onQualificationChange({ equityFlexibilityScore: level })}
                        className={cn(
                          "h-7 w-7 rounded-[8px] border text-[11px] font-semibold transition-colors",
                          qualification.equityFlexibilityScore === level
                            ? "border-cyan/40 bg-cyan/[0.12] text-cyan"
                            : "border-white/[0.12] bg-white/[0.04] text-muted-foreground hover:border-white/[0.2]"
                        )}
                      >
                        {level}
                      </button>
                    ))}
                    <span className="text-[9px] text-muted-foreground/60 ml-1">1=rigid · 5=flexible</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Timeline</p>
                  <select
                    value={qualification.sellerTimeline ?? ""}
                    onChange={(e) => onQualificationChange({ sellerTimeline: (e.target.value || null) as SellerTimeline | null })}
                    className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                  >
                    <option value="">Not set</option>
                    {SELLER_TIMELINE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Asking Price</p>
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
                    className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-cyan/30"
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
                  "rounded-[8px] border px-2.5 py-2 text-[11px] flex items-center justify-between",
                  cf.qualificationScoreTotal >= 25
                    ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300"
                    : cf.qualificationScoreTotal >= 18
                      ? "border-cyan/20 bg-cyan/[0.06] text-cyan"
                      : cf.qualificationScoreTotal >= 12
                        ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-300"
                        : "border-zinc-500/20 bg-zinc-500/[0.06] text-zinc-400"
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
                <div className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-2 text-[11px] text-emerald-300">
                  Suggestion: this lead looks <span className="font-semibold">Offer Ready</span> based on motivation, timeline, and lead score.
                </div>
              )}
              {qualificationSuggestedRoute && qualificationSuggestedRoute !== qualification.qualificationRoute && (
                <div className="rounded-[8px] border border-cyan/20 bg-cyan/[0.06] px-2.5 py-2 text-[11px] text-cyan flex items-center justify-between gap-2">
                  <span>
                    Server suggestion: <span className="font-semibold">{qualificationRouteLabel(qualificationSuggestedRoute)}</span>
                  </span>
                  <Button
                    size="sm"
                    className="h-6 text-[10px]"
                    disabled={qualificationSaving}
                    onClick={() => onQualificationRouteSelect(qualificationSuggestedRoute)}
                  >
                    Accept suggestion
                  </Button>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Route</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {QUALIFICATION_ROUTE_OPTIONS.map((route) => (
                    <button
                      key={route.id}
                      type="button"
                      disabled={qualificationSaving}
                      onClick={() => onQualificationRouteSelect(route.id)}
                      className={cn(
                        "h-7 px-2.5 rounded-[8px] border text-[11px] font-medium transition-colors",
                        qualification.qualificationRoute === route.id
                          ? "border-cyan/40 bg-cyan/[0.12] text-cyan"
                          : "border-white/[0.12] bg-white/[0.04] text-muted-foreground hover:border-white/[0.2]",
                        qualificationSaving && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {route.label}
                    </button>
                  ))}
                  <Button
                    size="sm"
                    className="h-7 text-[11px] ml-auto"
                    disabled={qualificationSaving || !qualificationDirty}
                    onClick={onQualificationSave}
                  >
                    {qualificationSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </Button>
                </div>
                {qualification.qualificationRoute === "escalate" && (
                  <p className={cn("text-[10px]", cf.assignedTo ? "text-amber-300/85" : "text-red-300")}>
                    {cf.assignedTo
                      ? "Escalation creates an Adam review task. Ownership stays with the current assignee until manually reassigned."
                      : "Escalation requires an assigned owner first. Claim or assign this lead before saving."}
                  </p>
                )}
                {qualification.qualificationRoute === "offer_ready" && (
                  <p className="text-[10px] text-cyan/85">
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
                <p className="text-amber-300/85">
                  Escalated for Adam review. Ownership remains with {cf.assignedTo ? "the assigned operator" : "the current claimant once assigned"}.
                </p>
              )}
              {qualification.qualificationRoute === "offer_ready" && (
                <p className={cn(offerPrepStale ? "text-amber-300/85" : "text-cyan/85")}>
                  Offer-prep follow-up: {offerPrepDueLabel}{offerPrepStale ? " (stale)" : ""}
                </p>
              )}
              <p className="text-muted-foreground">Decision Maker: <span className="text-foreground font-medium">{qualification.decisionMakerConfirmed ? "Confirmed" : "Not confirmed"}</span></p>
              {cf.qualificationScoreTotal != null && (
                <p className={cn(
                  "font-medium",
                  cf.qualificationScoreTotal >= 25 ? "text-emerald-300" : cf.qualificationScoreTotal >= 18 ? "text-cyan" : cf.qualificationScoreTotal >= 12 ? "text-amber-300" : "text-zinc-400"
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
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Advanced</p>
          <span className="text-[9px] text-muted-foreground/50">
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
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Deep Crawl Intelligence</p>
                    {deepCrawlResult ? (
                      <button
                        onClick={() => setDeepCrawlExpanded(!deepCrawlExpanded)}
                        className="h-6 px-2.5 rounded-md text-[9px] font-semibold border flex items-center gap-1 transition-colors border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400 hover:bg-emerald-500/[0.12]"
                      >
                        <FileText className="h-3 w-3" />
                        {deepCrawlExpanded ? "Hide Report" : "Deep Crawl Report"}
                      </button>
                    ) : hasSavedReport ? (
                      <button
                        onClick={loadSavedReport}
                        disabled={loadingReport}
                        className="h-6 px-2.5 rounded-md text-[9px] font-semibold border flex items-center gap-1 transition-colors border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400 hover:bg-emerald-500/[0.12]"
                      >
                        {loadingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                        {loadingReport ? "Loading Report..." : "View Saved Report"}
                      </button>
                    ) : (
                      <button
                        onClick={executeDeepCrawl}
                        disabled={deepCrawling}
                        className="h-6 px-2.5 rounded-md text-[9px] font-semibold border flex items-center gap-1 transition-colors border-amber-500/30 bg-amber-500/[0.06] text-amber-400 hover:bg-amber-500/[0.12]"
                      >
                        {deepCrawling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        {deepCrawling ? "Deep Crawling..." : "~120s Deep Crawl"}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground/60">
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
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Metadata</p>
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
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
                      <p className="text-xs text-foreground/80">{cf.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* â•â•â• 4. PROPERTY SNAPSHOT â€” Photo Carousel + Address + Badges â•â•â• */}
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
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 z-10">
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
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 z-10">
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
              <div className="flex items-center gap-1 text-[9px] text-white/50">
                <ImageIcon className="h-2.5 w-2.5" />{allPhotos.length > 0 ? `${allPhotos.length} photos Â· Zillow` : streetViewLink ? `Click to explore Â· ${imageLabel}` : imageLabel}
              </div>
            </div>
          </div>
        )}
        <div className="p-4 space-y-3">
          {/* Address + County + APN â€” with satellite thumbnail on the right */}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-cyan/60 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground truncate">{cf.fullAddress || "â€”"}</p>
                    {cf.fullAddress && <CopyBtn text={cf.fullAddress} />}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {cf.county && <span className="text-[10px] text-muted-foreground">{cf.county} County</span>}
                    {cf.apn && (
                      <span className="text-[10px] text-muted-foreground/60 font-mono flex items-center gap-1">
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
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      <Building className="h-2.5 w-2.5" />{cf.propertyType}
                    </span>
                  )}
                  {!imageUrl && cf.bedrooms != null && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      {cf.bedrooms}bd / {cf.bathrooms ?? "?"}ba
                    </span>
                  )}
                  {!imageUrl && cf.sqft != null && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      {cf.sqft.toLocaleString()} sqft
                    </span>
                  )}
                  {!imageUrl && cf.yearBuilt && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      Built {cf.yearBuilt}
                    </span>
                  )}
                  {!imageUrl && cf.lotSize && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
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
                className="shrink-0 relative group rounded-lg overflow-hidden border border-white/[0.08] hover:border-cyan/30 transition-colors"
              >
                <img
                  src={streetViewUrl ?? thumbUrl ?? ""}
                  alt="Property"
                  className="w-[120px] h-[90px] object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center gap-1 text-[8px] text-white/70 pointer-events-none">
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
                    "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                    cfg?.color ?? "text-cyan/70 bg-cyan/[0.06] border-cyan/20"
                  )}>
                    {cfg?.label ?? tag.replace(/_/g, " ")}
                  </span>
                );
              })}
              {warningFlags.map((f) => (
                <span key={f.label} className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider", f.color)}>
                  <AlertTriangle className="h-2.5 w-2.5" />{f.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* â•â•â• 5. MAO BREAKDOWN â€” Full formula so agents trust the math â•â•â• */}
      {mao != null && mao > 0 && (
        <div className="rounded-[12px] border border-cyan/20 bg-cyan/[0.03] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-cyan" />
              <p className="text-[11px] text-cyan/80 uppercase tracking-wider font-semibold">MAO Breakdown</p>
            </div>
            <span className="text-[9px] text-muted-foreground/50 italic">
              {arvSource === "comps" ? `Based on ${compCount || "selected"} comps` : "Based on AVM estimate"}
            </span>
          </div>

          <div className="space-y-1 font-mono text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>ARV ({arvSource === "comps" ? "comps" : "AVM"})</span>
              <span className="text-foreground font-semibold">{formatCurrency(bestArv)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Ã— 75% wholesale</span>
              <span className="text-foreground">{formatCurrency(wholesaleValue)}</span>
            </div>
            <div className="flex items-center justify-between text-red-400/70">
              <span>âˆ’ Repairs (est. 10%)</span>
              <span>âˆ’{formatCurrency(repairEstimate)}</span>
            </div>
            <div className="flex items-center justify-between text-red-400/70">
              <span>âˆ’ Assignment fee</span>
              <span>âˆ’{formatCurrency(assignmentFee)}</span>
            </div>
            <div className="border-t border-white/[0.08] pt-1.5 mt-1 flex items-center justify-between">
              <span className="text-cyan font-bold text-sm">MAO</span>
              <span className="text-neon font-bold text-lg" style={{ textShadow: "0 0 12px rgba(0,212,255,0.3)" }}>{formatCurrency(mao)}</span>
            </div>
          </div>
        </div>
      )}

      {/* â•â•â• 6. LEAD INTELLIGENCE â€” 4 Tiles â•â•â• */}
      <div className="rounded-[12px] border border-cyan/15 bg-cyan/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-cyan" />
          <p className="text-[11px] text-cyan/80 uppercase tracking-wider font-semibold">Lead Intelligence</p>
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
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Composite Score</p>
              <span className="text-[8px] text-cyan/40 group-hover:text-cyan/70 transition-colors">drill &rarr;</span>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <p className="text-3xl font-black tabular-nums" style={{ textShadow: `0 0 12px ${tc.glow}` }}>{cf.compositeScore}</p>
              <div>
                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider", tc.text, `${tc.bar}/20`)}>{tier.toUpperCase()}</span>
                <p className="text-[9px] text-muted-foreground/50 mt-0.5">{cf.tags.length} signal{cf.tags.length !== 1 ? "s" : ""} stacked</p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden relative z-10">
              <div className={cn("h-full rounded-full transition-all", tc.bar)} style={{ width: `${Math.min(cf.compositeScore, 100)}%` }} />
            </div>
          </button>

          {/* Equity & Spread */}
          <button
            type="button"
            onClick={() => scrollTo(sectionEquity)}
            className={cn("rounded-[10px] border p-3 relative overflow-hidden text-left transition-all cursor-pointer hover:bg-white/[0.04] group",
              equityIsGreen ? "border-emerald-500/20 bg-emerald-500/[0.04] hover:border-emerald-500/30" : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12]"
            )}
          >
            {equityIsGreen && <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.06] to-transparent pointer-events-none" />}
            <div className="flex items-center justify-between mb-1 relative z-10">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Equity &amp; Spread</p>
              <span className="text-[8px] text-emerald-400/40 group-hover:text-emerald-400/70 transition-colors">details &rarr;</span>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <p className={cn("text-3xl font-black tabular-nums", equityIsGreen ? "text-emerald-400" : "text-foreground")}
                style={{ textShadow: equityIsGreen ? "0 0 16px rgba(52,211,153,0.35)" : undefined }}>
                {cf.equityPercent != null ? `${cf.equityPercent}%` : "â€”"}
              </p>
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                {cf.estimatedValue != null && <p>AVM {formatCurrency(cf.estimatedValue)}</p>}
                {cf.availableEquity != null && <p>{formatCurrency(cf.availableEquity)} avail.</p>}
                {estimatedOwed != null && <p>Owed ~{formatCurrency(estimatedOwed)}</p>}
              </div>
            </div>
            {roomLabel && (
              <p className={cn("text-[9px] mt-1.5 relative z-10 font-semibold", roomColor.split(" ")[0])}>
                {roomLabel === "HIGH SPREAD" ? "Room to negotiate â€” strong equity" : roomLabel === "MODERATE" ? "Some room â€” watch margins" : "Tight spread â€” proceed with caution"}
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
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Signal Freshness</p>
              <span className="text-[8px] text-orange-400/40 group-hover:text-orange-400/70 transition-colors">timeline &rarr;</span>
            </div>
            {freshestEvent ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-black text-orange-400" style={{ textShadow: "0 0 12px rgba(251,146,60,0.3)" }}>
                    {freshestDays != null && freshestDays <= 0 ? "Today" : `${freshestDays}d`}
                  </p>
                  <p className="text-[9px] text-muted-foreground/50">since newest</p>
                </div>
                <p className="text-[9px] text-orange-300/70 mt-1 font-semibold">
                  {freshestDays != null && freshestDays <= 7 ? "Very fresh â€” call ASAP before competitors" :
                   freshestDays != null && freshestDays <= 30 ? "Recent signal â€” still a warm window" :
                   "Aging signal â€” may need re-verification"}
                </p>
              </>
            ) : cf.tags.length > 0 ? (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400/50" />
                <p className="text-xs text-muted-foreground/60">{cf.tags.length} signal{cf.tags.length !== 1 ? "s" : ""} detected</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/40 italic">No signals</p>
            )}
          </button>

          {/* Owner Situation */}
          <button
            type="button"
            onClick={() => scrollTo(sectionOwner)}
            className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3 text-left transition-all cursor-pointer hover:bg-white/[0.04] hover:border-white/[0.12] group"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Owner Situation</p>
              <span className="text-[8px] text-cyan/40 group-hover:text-cyan/70 transition-colors">contact &rarr;</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {cf.isAbsentee ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">ABSENTEE</span>
                ) : (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">OCCUPIED</span>
                )}
                {cf.isFreeClear && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">FREE &amp; CLEAR</span>}
                {cf.isVacant && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">VACANT</span>}
              </div>
              <p className="text-[9px] text-muted-foreground/70 font-semibold">
                {cf.isAbsentee && ownerAge && ownerAge >= 65 ? "Elderly absentee â€” likely estate/caretaker situation" :
                 cf.isAbsentee ? "Absentee owner â€” may be motivated to offload" :
                 cf.isFreeClear ? "Free & clear â€” no mortgage pressure, but no urgency either" :
                 yearsOwned != null && yearsOwned >= 20 ? `${yearsOwned}yr owner â€” long tenure, may be ready to move` :
                 ownerAge ? `Owner ~${ownerAge} â€” ${ownerAge >= 65 ? "senior, life transition likely" : "younger owner"}` :
                 "Standard owner situation"}
              </p>
            </div>
          </button>
        </div>
      </div>

      {scoreBreakdown && (
        <ScoreBreakdownModal cf={cf} scoreType={scoreBreakdown} onClose={() => setScoreBreakdown(null)} />
      )}

      {/* â”€â”€ Quick Call Summary (compact inline) â”€â”€ */}
      {(cf.totalCalls > 0 || cf.lastContactAt) && (
        <div className="flex items-center gap-3 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <Phone className="h-3.5 w-3.5 text-cyan shrink-0" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold shrink-0">Call Summary</p>
          <div className="flex items-center gap-2 ml-2 text-[11px] text-foreground/80 flex-wrap">
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
                <span>Live: <span className="font-medium text-emerald-400">{cf.liveAnswers}</span></span>
              </>
            )}
            {cf.voicemailsLeft > 0 && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>VM: <span className="font-medium text-blue-400">{cf.voicemailsLeft}</span></span>
              </>
            )}
            {callHistory.length > 0 && callHistory[0].disposition && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>Last: <span className="font-medium text-purple-300">{callHistory[0].disposition}</span></span>
              </>
            )}
          </div>
          {cf.nextCallScheduledAt && (
            <span className="ml-auto text-[10px] text-cyan/70 flex items-center gap-1 shrink-0">
              <Calendar className="h-3 w-3" />
              Next: {new Date(cf.nextCallScheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      )}

      {/* â”€â”€ Call Playbook â€” Grok AI (upgraded pre-call brief) â”€â”€ */}
      {brief || briefLoading ? (
        <div className="rounded-[12px] border border-purple-500/20 bg-purple-500/[0.04] p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.06] via-transparent to-cyan/[0.03] pointer-events-none" />
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/40 to-transparent" />

          <div className="flex items-center gap-2 mb-3 relative z-10">
            <div className="h-7 w-7 rounded-[8px] bg-purple-500/15 flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <p className="text-[11px] text-purple-300 uppercase tracking-wider font-semibold">Call Playbook</p>
            <Badge variant="outline" className="text-[8px] border-purple-500/20 text-purple-400/60 ml-1">GROK AI</Badge>
            {briefLoading && <Loader2 className="h-3 w-3 text-purple-400 animate-spin ml-auto" />}
            {!briefLoading && (
              <button
                onClick={regenerateBrief}
                className="ml-auto p-1 rounded-md hover:bg-purple-500/10 transition-colors text-purple-400/50 hover:text-purple-400"
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
                      <span className="text-purple-400 mt-0.5 shrink-0">&#9670;</span>
                      <p className="text-foreground/90 leading-relaxed">{bullet}</p>
                    </div>
                  ))}
                </div>

                {/* Suggested Opener */}
                {brief.suggestedOpener && (
                  <div className="pt-2 border-t border-purple-500/10">
                    <p className="text-[9px] text-purple-400/50 uppercase tracking-widest mb-1">Suggested Opener</p>
                    <p className="text-xs text-foreground/80 italic leading-relaxed">&ldquo;{brief.suggestedOpener}&rdquo;</p>
                  </div>
                )}

                {/* Talking Points */}
                {brief.talkingPoints.length > 0 && (
                  <div className="pt-2 border-t border-purple-500/10">
                    <p className="text-[9px] text-purple-400/50 uppercase tracking-widest mb-1.5">Talking Points</p>
                    <div className="space-y-1">
                      {brief.talkingPoints.map((tp, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="text-cyan/60 mt-0.5 shrink-0 text-[10px]">{i + 1}.</span>
                          <p className="text-foreground/80 leading-relaxed">{tp}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Objections & Rebuttals */}
                {brief.objections.length > 0 && (
                  <div className="pt-2 border-t border-purple-500/10">
                    <p className="text-[9px] text-purple-400/50 uppercase tracking-widest mb-1.5">Likely Objections</p>
                    <div className="space-y-2">
                      {brief.objections.map((obj, i) => (
                        <div key={i} className="rounded-[8px] border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                          <p className="text-xs text-red-300/80 font-medium">&ldquo;{obj.objection}&rdquo;</p>
                          <p className="text-xs text-emerald-300/80 mt-1 pl-3 border-l-2 border-emerald-500/20">{obj.rebuttal}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Negotiation Anchor */}
                {brief.negotiationAnchor && (
                  <div className="pt-2 border-t border-purple-500/10">
                    <p className="text-[9px] text-purple-400/50 uppercase tracking-widest mb-1">Negotiation Anchor</p>
                    <p className="text-xs text-neon/90 font-semibold">{brief.negotiationAnchor}</p>
                  </div>
                )}

                {/* Watch-Outs */}
                {brief.watchOuts.length > 0 && (
                  <div className="pt-2 border-t border-purple-500/10">
                    <p className="text-[9px] text-red-400/50 uppercase tracking-widest mb-1">Watch-Outs</p>
                    <div className="space-y-1">
                      {brief.watchOuts.map((wo, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-amber-400/80">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <p>{wo}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-4 gap-2">
                <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                <span className="text-xs text-purple-300/60">Generating playbookâ€¦</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Compact empty-state: single line instead of full card */
        <div className="flex items-center gap-2 rounded-[10px] border border-purple-500/10 bg-purple-500/[0.02] px-3 py-2">
          <Brain className="h-3.5 w-3.5 text-purple-400/40" />
          <p className="text-[11px] text-muted-foreground/40 italic">No call playbook yet</p>
          <button
            onClick={regenerateBrief}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-purple-400/60 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Generate
          </button>
        </div>
      )}

      {/* â•â•â• 8. CALL HISTORY + AI NOTES (merged) â•â•â• */}
      {(cf.totalCalls > 0 || cf.nextCallScheduledAt || summaryNotes.length > 0) && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <PhoneForwarded className="h-3.5 w-3.5 text-cyan" />
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Call History &amp; Notes</p>
            {cf.totalCalls > 0 && (
              <span className="text-[10px] text-cyan/60 ml-auto font-medium">
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
                    background: "linear-gradient(90deg, rgba(0,229,255,0.6), rgba(0,255,136,0.6))",
                    boxShadow: "0 0 8px rgba(0,229,255,0.3)",
                  }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
                  <Phone className="h-3 w-3 text-cyan mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground text-glow-number">{cf.totalCalls}</p>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Total Calls</p>
                </div>
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
                  <PhoneForwarded className="h-3 w-3 text-emerald-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-emerald-400 text-glow-number">{cf.liveAnswers}</p>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Live Answers</p>
                </div>
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
                  <Voicemail className="h-3 w-3 text-blue-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-blue-400 text-glow-number">{cf.voicemailsLeft}</p>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Voicemails</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {cf.lastContactAt && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                    <Clock className="h-3 w-3" />
                    <span>Last: {new Date(cf.lastContactAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(cf.lastContactAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                )}
                {cf.nextCallScheduledAt && (
                  <div className="flex items-center gap-1.5 text-[10px] text-cyan/70 ml-auto">
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
                <Zap className="h-3.5 w-3.5 text-purple-400" />
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">AI Call Notes</p>
                <Badge variant="outline" className="text-[9px] ml-1 border-purple-500/20 text-purple-400/70">{summaryNotes.length}</Badge>
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
                          <span className="text-[9px] font-semibold uppercase text-purple-400/60">{note.disposition}</span>
                          <span className="text-[9px] text-muted-foreground/40">
                            {new Date(note.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {" "}
                            {new Date(note.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                          {note.duration_sec > 0 && (
                            <span className="text-[9px] text-muted-foreground/40 ml-auto">{Math.floor(note.duration_sec / 60)}:{(note.duration_sec % 60).toString().padStart(2, "0")}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-line">{note.ai_summary}</p>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {!notesExpanded && summaryNotes[0] && (
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-3 whitespace-pre-line">{summaryNotes[0].ai_summary}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* â•â•â• 9. PROPERTY DETAILS â€” Tax/Transfer + Predictive (no address â€” moved to Snapshot) â•â•â• */}
      <div ref={sectionEquity} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Home className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Property Details</p>
          {(cf.bedrooms == null || cf.sqft == null || cf.yearBuilt == null) && (
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] h-6 gap-1 ml-auto text-cyan border-cyan/20 hover:bg-cyan/10"
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
                <Banknote className="h-3.5 w-3.5 text-cyan/60 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">Tax &amp; Transfer</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    {prRaw.AssessedValue && (
                      <p className="text-muted-foreground">Tax Assessed: <span className="text-foreground font-medium">{formatCurrency(Number(prRaw.AssessedValue))}</span></p>
                    )}
                    {cf.lastSalePrice != null && (
                      <p className="text-muted-foreground">Last Sale: <span className="text-foreground font-medium">{formatCurrency(cf.lastSalePrice)}</span>{cf.lastSaleDate ? ` (${new Date(cf.lastSaleDate).toLocaleDateString()})` : ""}</p>
                    )}
                    {lastTransferType && (
                      <p className="text-muted-foreground">Transfer: <span className="text-foreground font-medium">{lastTransferType}</span>{lastTransferValue ? ` â€” ${formatCurrency(lastTransferValue)}` : ""}</p>
                    )}
                    {prRaw.DelinquentYear && (
                      <p className="text-amber-400">Delinquent: <span className="font-medium">Year {prRaw.DelinquentYear}</span>{prRaw.NumberDelinquentInstallments ? ` (${prRaw.NumberDelinquentInstallments} installments)` : ""}</p>
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
                <Zap className="h-3.5 w-3.5 text-purple-400/70 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">Predictive Intelligence</p>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Distress In</p>
                      <p className="text-lg font-bold text-orange-400" style={{ textShadow: "0 0 10px rgba(251,146,60,0.3)" }}>~{cf.prediction.daysUntilDistress}d</p>
                    </div>
                    <div className="h-8 w-px bg-white/[0.06]" />
                    <div>
                      <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Confidence</p>
                      <p className="text-lg font-bold text-cyan" style={{ textShadow: "0 0 10px rgba(0,212,255,0.3)" }}>{cf.prediction.confidence}%</p>
                    </div>
                    <div className="h-8 w-px bg-white/[0.06]" />
                    <div>
                      <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Pred Score</p>
                      <p className="text-lg font-bold text-foreground">{cf.prediction.predictiveScore}</p>
                    </div>
                    {cf.prediction.lifeEventProbability != null && cf.prediction.lifeEventProbability > 0.10 && (
                      <>
                        <div className="h-8 w-px bg-white/[0.06]" />
                        <div>
                          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Life Event</p>
                          <p className="text-lg font-bold text-purple-400" style={{ textShadow: "0 0 10px rgba(168,85,247,0.3)" }}>{Math.round(cf.prediction.lifeEventProbability * 100)}%</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.04] bg-white/[0.015] px-2.5 py-1.5 col-span-2">
              <Zap className="h-3 w-3 text-purple-400/30 shrink-0" />
              <p className="text-[10px] text-muted-foreground/35 italic">No predictive data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* â•â•â• 10. EDIT DETAILS â•â•â• */}
      {canEdit && (
        <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-semibold text-cyan bg-cyan/[0.06] border border-cyan/20 hover:bg-cyan/[0.12] hover:border-cyan/30 shadow-[0_0_10px_rgba(0,212,255,0.06)] hover:shadow-[0_0_18px_rgba(0,212,255,0.12)] transition-all active:scale-[0.97]">
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
            <Clock className="h-3.5 w-3.5 text-cyan" />
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Full Activity Timeline</p>
            <Badge variant="outline" className="text-[9px] ml-1">{activityLog.length}</Badge>
            <span className="text-[9px] text-muted-foreground/45">calls, texts, updates</span>
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
                    const iconColor = isCall ? "text-cyan" : isSms ? "text-emerald-400" : "text-purple-400";
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
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate max-w-[420px]">{notePreview}</p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[9px] text-muted-foreground/45">
                            {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                            {new Date(entry.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </p>
                          <p className="text-[9px] text-muted-foreground/35">{formatRelativeFromNow(entry.created_at)}</p>
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
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">{key}</p>
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
        <div className="flex items-center gap-2 text-xs text-cyan/70">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Enriched from PropertyRadar{cf.radarId ? ` â€” RadarID: ${cf.radarId}` : ""}</span>
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
                <Map className="h-3.5 w-3.5 text-cyan" />GIS / Parcel Map â€” {countyInfo.name}
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
            <a href={countyInfo.assessor(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                <Building className="h-3.5 w-3.5 text-cyan" />Assessor&apos;s Office â€” {countyInfo.name}
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
            {countyInfo.treasurer && (
              <a href={countyInfo.treasurer(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                  <DollarSign className="h-3.5 w-3.5 text-cyan" />Treasurer / Tax Records â€” {countyInfo.name}
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
                <Search className="h-3.5 w-3.5 text-cyan" />Search County Records (Google)
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
          </div>
        )}
      </Section>

      <div className="text-[10px] text-muted-foreground/50 italic">
        Tip: Search the APN <span className="font-mono text-foreground/60">{cf.apn}</span> on the county GIS to pull official parcel data, liens, and tax history.
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: Comps & ARV â€” Interactive Leaflet Map + PropertyRadar Search
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
            className="text-[9px] text-neon hover:underline font-medium mt-0.5"
          >
            Enrich for photos
          </button>
        ) : (
          <p className="text-[9px] text-muted-foreground leading-tight">
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
              <div key={i} className={cn("h-1 w-1 rounded-full transition-colors", i === idx ? "bg-neon" : "bg-white/40")} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// â”€â”€ Comp detail panel with auto-fetching Zillow photo carousel â”€â”€â”€â”€â”€â”€â”€â”€

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
      } catch { /* ignore â€” fallback to street view / satellite */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fullAddress]);

  // Fallback image sources
  const fallbackSrc = comp.photoUrl
    ?? comp.streetViewUrl
    ?? (comp.lat && comp.lng ? getSatelliteTileUrl(comp.lat, comp.lng, 17) : null);

  const allPhotos = photos.length > 0 ? photos : (fallbackSrc ? [fallbackSrc] : []);
  const safeIdx = allPhotos.length > 0 ? photoIdx % allPhotos.length : 0;

  return (
    <div className="rounded-[10px] border border-cyan/20 bg-[rgba(12,12,22,0.6)] backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-cyan/[0.04]">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Eye className="h-3 w-3 text-cyan" />
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
              <Loader2 className="h-5 w-5 text-cyan animate-spin" />
              <span className="ml-2 text-[10px] text-muted-foreground">Fetching photosâ€¦</span>
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
                  <span className="absolute bottom-1.5 right-2 text-[9px] bg-black/60 text-white/80 px-1.5 py-0.5 rounded-full">
                    {safeIdx + 1}/{allPhotos.length}
                  </span>
                </>
              )}
              {loading && (
                <span className="absolute top-1.5 right-2 text-[8px] bg-black/60 text-cyan px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />loading more
                </span>
              )}
            </>
          ) : (
            <div className="h-full flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
              <span className="ml-2 text-[10px] text-muted-foreground">No photos available</span>
            </div>
          )}
        </div>
        {/* Property details */}
        <div className="flex-1 p-3 min-w-0">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
            <div><span className="text-muted-foreground">Beds:</span> <span className="font-medium">{comp.beds ?? "â€”"}</span></div>
            <div><span className="text-muted-foreground">Baths:</span> <span className="font-medium">{comp.baths ?? "â€”"}</span></div>
            <div><span className="text-muted-foreground">Sqft:</span> <span className="font-medium">{comp.sqft?.toLocaleString() ?? "â€”"}</span></div>
            <div><span className="text-muted-foreground">Year:</span> <span className="font-medium">{comp.yearBuilt ?? "â€”"}</span></div>
            <div><span className="text-muted-foreground">AVM:</span> <span className="font-medium text-neon">{comp.avm ? formatCurrency(comp.avm) : "â€”"}</span></div>
            <div><span className="text-muted-foreground">Last Sale:</span> <span className="font-medium">{comp.lastSalePrice ? formatCurrency(comp.lastSalePrice) : "â€”"}</span></div>
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
            {comp.isVacant && <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">Vacant</span>}
            {comp.isAbsentee && <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20">Absentee</span>}
            {comp.isFreeAndClear && <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Free & Clear</span>}
            {comp.isForeclosure && <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/10 text-red-400 border border-red-500/20">Foreclosure</span>}
            {comp.isListedForSale && <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20">Listed</span>}
            {comp.isRecentSale && <span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan/10 text-cyan border border-cyan/20">Recent Sale</span>}
          </div>
          {comp.lat && comp.lng && (
            <a
              href={getGoogleStreetViewLink(comp.lat, comp.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[9px] text-cyan hover:underline mt-2"
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

// â”€â”€ Lat/Lng extraction with fallbacks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLatLng(cf: ClientFile): { lat: number | null; lng: number | null } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flags = (cf.ownerFlags ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (flags.pr_raw ?? {}) as Record<string, any>;

  const tryParse = (v: unknown): number | null => {
    if (v == null || v === "" || v === "null") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isNaN(n) || n === 0 ? null : n;
  };

  const lat =
    tryParse(prRaw.Latitude) ??
    tryParse(prRaw.latitude) ??
    tryParse(flags.latitude) ??
    tryParse(flags.lat) ??
    null;

  const lng =
    tryParse(prRaw.Longitude) ??
    tryParse(prRaw.longitude) ??
    tryParse(flags.longitude) ??
    tryParse(flags.lng) ??
    null;

  return { lat, lng };
}

// â”€â”€ ARV adjustment helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CONDITION_LABELS: Record<number, string> = {
  [-15]: "Poor (â€“15%)",
  [-10]: "Below Avg (â€“10%)",
  [-5]: "Fair (â€“5%)",
  [0]: "Average",
  [5]: "Good (+5%)",
};

function CompsTab({ cf, selectedComps, onAddComp, onRemoveComp, onSkipTrace, computedArv, onArvChange }: {
  cf: ClientFile;
  selectedComps: CompProperty[];
  onAddComp: (comp: CompProperty) => void;
  onRemoveComp: (apn: string) => void;
  onSkipTrace?: () => void;
  computedArv: number;
  onArvChange: (arv: number) => void;
}) {
  const [focusedComp, setFocusedComp] = useState<CompProperty | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;

  // â”€â”€ Lat/lng with multi-source fallback + geocoding â”€â”€
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

  // ARV adjustment state
  const [conditionAdj, setConditionAdj] = useState(0);
  const [offerPct, setOfferPct] = useState(65);
  const [rehabEst, setRehabEst] = useState(40000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oFlagsComps = (cf.ownerFlags ?? {}) as any;
  const cachedPhotos = useMemo(() => {
    const urls: string[] = [];
    // Zillow photos from owner_flags (cached from Apify)
    const cached = oFlagsComps?.photos ?? oFlagsComps?.deep_crawl?.photos ?? [];
    if (Array.isArray(cached)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      urls.push(...cached.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean));
    }
    // PropertyRadar photos
    if (Array.isArray(prRaw.Photos)) urls.push(...prRaw.Photos.filter((u: unknown) => typeof u === "string"));
    if (Array.isArray(prRaw.photos)) urls.push(...prRaw.photos.filter((u: unknown) => typeof u === "string"));
    if (typeof prRaw.PropertyImageUrl === "string" && prRaw.PropertyImageUrl) urls.push(prRaw.PropertyImageUrl);
    if (typeof prRaw.StreetViewUrl === "string" && prRaw.StreetViewUrl) urls.push(prRaw.StreetViewUrl);
    // Deduplicate
    return [...new Set(urls)];
  }, [prRaw, oFlagsComps]);

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

  // ARV from selected comps using weighted $/sqft methodology
  const subjectSqft = cf.sqft ?? 0;
  const compMetrics = selectedComps
    .filter((c) => (c.lastSalePrice ?? c.avm ?? 0) > 0)
    .map((c) => {
      const price = c.lastSalePrice ?? c.avm ?? 0;
      const ppsqft = c.sqft && c.sqft > 0 ? price / c.sqft : null;
      return { price, sqft: c.sqft ?? 0, ppsqft };
    });

  const sqftComps = compMetrics.filter((m) => m.ppsqft != null);
  let baseArv = 0;
  let arvLow = 0;
  let arvHigh = 0;
  let arvConfidence: "high" | "medium" | "low" = "low";

  if (sqftComps.length > 0 && subjectSqft > 0) {
    const pps = sqftComps.map((m) => m.ppsqft!);
    const avgPps = pps.reduce((a, b) => a + b, 0) / pps.length;
    baseArv = Math.round(avgPps * subjectSqft);
    arvLow = Math.round(Math.min(...pps) * subjectSqft);
    arvHigh = Math.round(Math.max(...pps) * subjectSqft);
    const spread = arvHigh - arvLow;
    arvConfidence = sqftComps.length >= 3 && spread / baseArv < 0.15 ? "high"
      : sqftComps.length >= 2 && spread / baseArv < 0.30 ? "medium" : "low";
  } else if (compMetrics.length > 0) {
    const prices = compMetrics.map((m) => m.price);
    baseArv = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    arvLow = Math.min(...prices);
    arvHigh = Math.max(...prices);
    arvConfidence = compMetrics.length >= 3 ? "medium" : "low";
  } else {
    baseArv = cf.estimatedValue ?? 0;
  }

  const arv = Math.round(baseArv * (1 + conditionAdj / 100));
  const avgPpsqft = sqftComps.length > 0 ? Math.round(sqftComps.reduce((a, m) => a + m.ppsqft!, 0) / sqftComps.length) : null;

  const offer = Math.round(arv * (offerPct / 100));
  const totalCost = offer + rehabEst;
  const profit = arv - totalCost;
  const roi = totalCost > 0 ? Math.round((profit / totalCost) * 100) : 0;

  useEffect(() => { if (arv > 0) onArvChange(arv); }, [arv, onArvChange]);

  if (geocoding) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-10 w-10 text-cyan mx-auto mb-3 animate-spin" />
        <p className="text-sm text-muted-foreground">Geocoding address...</p>
      </div>
    );
  }

  if (!lat || !lng) {
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
          setGeocodeError("Could not geocode â€” try enriching from PropertyRadar");
        }
      } catch {
        setGeocodeError("Geocoding service unavailable");
      } finally {
        setGeocoding(false);
      }
    };

    return (
      <div className="text-center py-12">
        <MapPinned className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-2">
          {geocodeError ?? "No location data available"}
        </p>
        <p className="text-xs text-muted-foreground/60 mb-3">
          This property needs enrichment from PropertyRadar to get latitude/longitude,
          or you can try geocoding the address.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={handleRetryGeocode} className="gap-1.5">
            <MapPinned className="h-3 w-3" /> Retry Geocode
          </Button>
          {onSkipTrace && (
            <Button variant="outline" size="sm" onClick={onSkipTrace} className="gap-1.5">
              <Globe className="h-3 w-3" /> Enrich + Skip Trace
            </Button>
          )}
        </div>
      </div>
    );
  }

  const subject: SubjectProperty = {
    lat, lng, address: cf.fullAddress,
    beds: cf.bedrooms, baths: cf.bathrooms,
    sqft: cf.sqft, yearBuilt: cf.yearBuilt,
    propertyType: cf.propertyType, avm: cf.estimatedValue,
    radarId: cf.radarId, zip: cf.zip, county: cf.county, state: cf.state,
  };

  return (
    <div className="space-y-4">
      {/* Subject property header with photo carousel */}
      <div className="rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] backdrop-blur-xl p-0 flex overflow-hidden">
        <div className="w-44 h-28 shrink-0 border-r border-white/[0.06] bg-white/[0.04]">
          <SubjectPhotoCarousel photos={photos} onSkipTrace={onSkipTrace} />
        </div>
        <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
          <p className="text-sm font-bold truncate" style={{ textShadow: "0 0 8px rgba(0,255,136,0.12)" }}>
            {cf.fullAddress}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
            {cf.bedrooms != null && <span className="flex items-center gap-1"><Home className="h-3 w-3" />{cf.bedrooms} bd</span>}
            {cf.bathrooms != null && <span className="flex items-center gap-1"><Home className="h-3 w-3" />{cf.bathrooms} ba</span>}
            {cf.sqft != null && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" />{cf.sqft.toLocaleString()} sqft</span>}
            {cf.yearBuilt != null && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{cf.yearBuilt}</span>}
            {cf.propertyType && <span className="flex items-center gap-1"><Building className="h-3 w-3" />{cf.propertyType}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px]">
            {cf.estimatedValue != null && (
              <span className="font-semibold text-neon">{formatCurrency(cf.estimatedValue)} AVM</span>
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

      {/* Interactive map */}
      <CompsMap
        subject={subject}
        selectedComps={selectedComps}
        onAddComp={onAddComp}
        onRemoveComp={onRemoveComp}
        focusedComp={focusedComp}
      />

      {/* Selected comps table */}
      {selectedComps.length > 0 && (
        <div className="rounded-[10px] border border-white/[0.06] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-[rgba(12,12,22,0.5)] border-b border-white/[0.06]">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-cyan" />
              Selected Comps ({selectedComps.length})
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
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
                        <div className="text-[9px] text-muted-foreground">
                          Sold {new Date(comp.lastSaleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{comp.beds ?? "â€”"}</td>
                    <td className="px-3 py-2 text-right">{comp.baths ?? "â€”"}</td>
                    <td className="px-3 py-2 text-right">{comp.sqft?.toLocaleString() ?? "â€”"}</td>
                    <td className="px-3 py-2 text-right">{comp.yearBuilt ?? "â€”"}</td>
                    <td className="px-3 py-2 text-right font-medium text-neon">{comp.avm ? formatCurrency(comp.avm) : "â€”"}</td>
                    <td className="px-3 py-2 text-right">{comp.lastSalePrice ? formatCurrency(comp.lastSalePrice) : "â€”"}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => onRemoveComp(comp.apn)} className="text-red-400 hover:text-red-300">
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
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Condition Adjustment</p>
          <span className={cn("text-xs font-bold", conditionAdj > 0 ? "text-emerald-400" : conditionAdj < 0 ? "text-red-400" : "text-muted-foreground")}>
            {CONDITION_LABELS[conditionAdj] ?? `${conditionAdj > 0 ? "+" : ""}${conditionAdj}%`}
          </span>
        </div>
        <p className="text-[9px] text-muted-foreground/60 mb-2">Adjust the ARV up or down based on the subject property{"'"}s condition relative to the comps. If it needs more work than the comps, slide left. If it{"'"}s in better shape, slide right.</p>
        <input type="range" min={-15} max={5} step={5} value={conditionAdj} onChange={(e) => setConditionAdj(Number(e.target.value))} className="w-full h-1.5 accent-[#00d4ff] bg-secondary rounded-full" />
      </div>

      {/* Live ARV + Profit projection */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-cyan/15 bg-cyan/4 p-4">
          <p className="text-[10px] font-semibold text-cyan uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" />
            Live ARV
            {selectedComps.length > 0 && (
              <span className={cn("ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                arvConfidence === "high" ? "bg-emerald-500/20 text-emerald-400" :
                arvConfidence === "medium" ? "bg-amber-500/20 text-amber-400" :
                "bg-red-500/20 text-red-400"
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
                  <span className="font-bold text-neon">${avgPpsqft}</span>
                </div>
              )}
              {arvLow > 0 && arvHigh > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Range</span>
                  <span className="font-medium">{formatCurrency(arvLow)} â€“ {formatCurrency(arvHigh)}</span>
                </div>
              )}
              {conditionAdj !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Condition</span>
                  <span className={cn("font-medium", conditionAdj > 0 ? "text-emerald-400" : "text-red-400")}>
                    {conditionAdj > 0 ? "+" : ""}{conditionAdj}%
                  </span>
                </div>
              )}
              <div className="pt-2 mt-2 border-t border-cyan/15 flex justify-between">
                <span className="font-medium">Estimated ARV</span>
                <span className="font-bold text-neon text-xl" style={{ textShadow: "0 0 10px rgba(0,212,255,0.4)" }}>
                  {formatCurrency(arv)}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground/60 pt-1">
                {avgPpsqft != null ? `Based on ${sqftComps.length} comp${sqftComps.length > 1 ? "s" : ""} Ã— ${subjectSqft.toLocaleString()} sqft` : `Average of ${compMetrics.length} comp sale price${compMetrics.length > 1 ? "s" : ""}`}
              </p>
            </div>
          ) : cf.estimatedValue ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">AVM (pre-comps)</span>
                <span className="font-bold text-neon">{formatCurrency(cf.estimatedValue)}</span>
              </div>
              {conditionAdj !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Condition</span>
                  <span className={cn("font-medium", conditionAdj > 0 ? "text-emerald-400" : "text-red-400")}>
                    {conditionAdj > 0 ? "+" : ""}{conditionAdj}%
                  </span>
                </div>
              )}
              <div className="pt-2 mt-2 border-t border-cyan/15 flex justify-between">
                <span className="font-medium">Est. ARV</span>
                <span className="font-bold text-neon text-xl" style={{ textShadow: "0 0 10px rgba(0,212,255,0.4)" }}>
                  {formatCurrency(arv)}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground/60 pt-1">Add comps for a more accurate ARV</p>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">Add comps to calculate</p>
          )}
        </div>

        <div className="rounded-[12px] border border-glass-border bg-secondary/10 p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
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
                <input type="range" min={50} max={80} step={5} value={offerPct} onChange={(e) => setOfferPct(Number(e.target.value))} className="w-14 h-1 accent-[#00d4ff]" />
                <span className="text-[10px] font-mono w-7 text-right">{offerPct}%</span>
              </span>
              <span className="font-medium text-red-400">-{formatCurrency(offer)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Rehab
                <input type="number" value={rehabEst} onChange={(e) => setRehabEst(Number(e.target.value) || 0)} className="w-16 h-5 text-[10px] text-right bg-white/[0.06] border border-white/[0.1] rounded px-1 font-mono" />
              </span>
              <span className="font-medium text-red-400">-{formatCurrency(rehabEst)}</span>
            </div>
            <div className="pt-1.5 mt-1.5 border-t border-white/[0.06] flex justify-between">
              <span className="font-semibold">Net Profit</span>
              <span className={cn("font-bold text-lg", profit >= 0 ? "text-neon" : "text-red-400")} style={profit >= 0 ? { textShadow: "0 0 10px rgba(0,212,255,0.3)" } : {}}>
                {formatCurrency(profit)}
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">ROI</span>
              <span className={cn("font-semibold", roi >= 0 ? "text-neon" : "text-red-400")}>{roi}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: Offer Calculator
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function OfferCalcTab({ cf, computedArv }: { cf: ClientFile; computedArv: number }) {
  const bestArv = computedArv > 0 ? computedArv : cf.estimatedValue ?? 0;
  const [arv, setArv] = useState(bestArv > 0 ? bestArv.toString() : "");

  // Auto-fill ARV when Comps tab computes one
  useEffect(() => { if (computedArv > 0) setArv(computedArv.toString()); }, [computedArv]);
  const defaultMao = bestArv > 0 ? Math.round(bestArv * 0.75 - 40000).toString() : "";
  const [purchase, setPurchase] = useState(defaultMao);
  const [rehab, setRehab] = useState("40000");
  const [holdMonths, setHoldMonths] = useState("3");
  const [monthlyHold, setMonthlyHold] = useState("1500");
  const [closing, setClosing] = useState("5000");
  const [assignmentFee, setAssignmentFee] = useState("15000");

  const arvNum = parseFloat(arv) || 0;
  const purchaseNum = parseFloat(purchase) || 0;
  const rehabNum = parseFloat(rehab) || 0;
  const holdNum = (parseFloat(holdMonths) || 0) * (parseFloat(monthlyHold) || 0);
  const closingNum = parseFloat(closing) || 0;
  const feeNum = parseFloat(assignmentFee) || 0;

  const mao = arvNum > 0 ? Math.round(arvNum * 0.75 - rehabNum) : 0;
  const totalCosts = purchaseNum + rehabNum + holdNum + closingNum;
  const grossProfit = arvNum - totalCosts;
  const netProfit = grossProfit - feeNum;
  const roi = totalCosts > 0 && purchaseNum > 0 ? ((grossProfit / totalCosts) * 100).toFixed(1) : null;

  return (
    <div className="space-y-4">
      <Section title="Deal Inputs" icon={Calculator}>
        {computedArv > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-cyan/70 mb-2">
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
          <div className="rounded-lg border border-cyan/20 bg-cyan/4 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">MAO (75% Rule)</p>
            <p className="text-xl font-bold text-neon" style={{ textShadow: "0 0 10px rgba(0,212,255,0.3)" }}>
              {mao > 0 ? formatCurrency(mao) : "â€”"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">ARV Ã— 0.75 âˆ’ Rehab</p>
          </div>
          <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.04] p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Costs</p>
            <p className="text-xl font-bold">{totalCosts > 0 ? formatCurrency(totalCosts) : "â€”"}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Purchase + Rehab + Hold + Close</p>
          </div>
          <div className={cn("rounded-[10px] border p-3 text-center", grossProfit > 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
            <p className="text-[10px] text-muted-foreground uppercase">Gross Profit</p>
            <p className={cn("text-xl font-bold", grossProfit > 0 ? "text-emerald-400" : "text-red-400")}>
              {arvNum > 0 && purchaseNum > 0 ? formatCurrency(grossProfit) : "â€”"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">ROI: {roi != null ? `${roi}%` : "â€”"}</p>
          </div>
          <div className={cn("rounded-lg border p-3 text-center", netProfit > 0 ? "border-cyan/20 bg-cyan/4" : "border-red-500/30 bg-red-500/5")}>
            <p className="text-[10px] text-muted-foreground uppercase">Net After Assignment</p>
            <p className={cn("text-xl font-bold", netProfit > 0 ? "text-neon" : "text-red-400")} style={netProfit > 0 ? { textShadow: "0 0 10px rgba(0,212,255,0.3)" } : undefined}>
              {arvNum > 0 && purchaseNum > 0 ? formatCurrency(netProfit) : "â€”"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Gross âˆ’ Assignment Fee</p>
          </div>
        </div>
      </Section>

      {purchaseNum > mao && mao > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Purchase price exceeds MAO by {formatCurrency(purchaseNum - mao)} â€” negotiate lower or increase ARV.
        </div>
      )}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tab: Documents / PSA
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function DocumentsTab({ cf, computedArv }: { cf: ClientFile; computedArv: number }) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const bestArv = computedArv > 0 ? computedArv : cf.estimatedValue ?? 0;
  const autoMao = bestArv > 0 ? formatCurrency(Math.round(bestArv * 0.75 - 40000)) : "____________";

  const psaBody = useMemo(() => [
    `REAL ESTATE PURCHASE AND SALE AGREEMENT`,
    ``,
    `Date: ${today}`,
    ``,
    `BUYER: Dominion Homes LLC and/or assigns`,
    `SELLER: ${cf.ownerName}`,
    ``,
    `PROPERTY:`,
    `  Address: ${cf.fullAddress}`,
    `  APN: ${cf.apn}`,
    `  County: ${cf.county}`,
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
    `         ${cf.ownerName}`,
    ``,
    `BUYER:  ______________________________  Date: ____________`,
    `         Dominion Homes LLC`,
  ].join("\n"), [cf, today, autoMao]);

  const handlePrint = useCallback(() => {
    const w = window.open("", "_blank", "width=800,height=1100");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>PSA â€” ${cf.fullAddress}</title>
      <style>body{font-family:Courier,monospace;padding:40px;font-size:12px;line-height:1.6;white-space:pre-wrap;color:#000;}</style>
      </head><body>${psaBody}</body></html>`);
    w.document.close();
    w.print();
  }, [cf.fullAddress, psaBody]);

  const gmailUrl = useMemo(() => {
    const subject = encodeURIComponent(`PSA â€” ${cf.fullAddress} â€” ${cf.ownerName}`);
    const body = encodeURIComponent(`Hi ${cf.ownerName.split(" ")[0]},\n\nPlease find the Purchase and Sale Agreement for the property at:\n${cf.fullAddress}\nAPN: ${cf.apn}\n\nI'll follow up shortly to discuss terms.\n\nBest,\nAdam DesJardin\nDominion Homes LLC`);
    return `https://mail.google.com/mail/?view=cm&su=${subject}&body=${body}`;
  }, [cf]);

  return (
    <div className="space-y-4">
      {/* PSA Preview */}
      <Section title="Purchase & Sale Agreement (RCW 61.40.010)" icon={FileText}>
        <pre className="text-[11px] leading-relaxed text-foreground/80 bg-white/[0.02] rounded-[10px] p-4 border border-white/[0.06] overflow-auto max-h-64 whitespace-pre-wrap font-mono">
          {psaBody}
        </pre>
      </Section>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={handlePrint} className="gap-2 h-14 text-base font-bold" style={{ boxShadow: "0 0 30px rgba(0,212,255,0.25)" }}>
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

      <div className="flex items-center gap-2 text-xs text-cyan/70 bg-cyan/4 border border-cyan/15 rounded-md px-3 py-2">
        <Shield className="h-3.5 w-3.5 shrink-0" />
        RCW 61.40.010 compliant â€” wholesaler disclosure included in all documents.
      </div>

      {/* Auto-filled data summary */}
      <div className="text-[10px] text-muted-foreground/50 space-y-0.5">
        <p>Auto-filled from client file: {cf.ownerName} â€¢ {cf.fullAddress} â€¢ APN {cf.apn}</p>
        <p>Heat Score: {cf.compositeScore} ({cf.scoreLabel.toUpperCase()}) â€¢ Equity: {cf.equityPercent ?? "â€”"}% â€¢ ARV: {cf.estimatedValue ? formatCurrency(cf.estimatedValue) : "â€”"}</p>
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

export function MasterClientFileModal({ clientFile, open, onClose, onClaim, onRefresh }: MasterClientFileModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [skipTracing, setSkipTracing] = useState(false);
  const [skipTraceResult, setSkipTraceResult] = useState<string | null>(null);
  const [skipTraceMs, setSkipTraceMs] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<SkipTraceOverlay | null>(null);
  const [skipTraceError, setSkipTraceError] = useState<SkipTraceError | null>(null);
  const [selectedComps, setSelectedComps] = useState<CompProperty[]>([]);
  const [computedArv, setComputedArv] = useState(
    () => (clientFile?.ownerFlags?.comp_arv as number) ?? 0
  );
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [calling, setCalling] = useState(false);
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
  const [qualificationDraft, setQualificationDraft] = useState<QualificationDraft>(() => getQualificationDraft(clientFile));
  const [offerPrepDraft, setOfferPrepDraft] = useState<OfferPrepSnapshotDraft>(() => getOfferPrepDraft(clientFile));
  const [offerStatusDraft, setOfferStatusDraft] = useState<OfferStatusSnapshotDraft>(() => getOfferStatusDraft(clientFile));
  const [buyerDispoTruthDraft, setBuyerDispoTruthDraft] = useState<BuyerDispoTruthDraft>(() => getBuyerDispoTruthDraft(clientFile));
  const [ownerFlagsOverride, setOwnerFlagsOverride] = useState<Record<string, unknown> | null>(null);
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

  // â”€â”€ Deep Crawl state â”€â”€
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
  }, [clientFile?.id, clientFile?.ownerFlags]);

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
  }, [clientFile?.propertyId, clientFile?.ownerFlags]);

  // Fetch dial history for this lead â€” groups calls_log by phone_dialed
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

      toast.success(canClaimToLead ? "Lead claimed successfully" : "Lead assignment updated");
      onClaim?.(clientFile.id);
      onRefresh?.();
    } catch (err) {
      console.error(`[MCF] ${actionLabel.toLowerCase()} error:`, err);
      toast.error(`${actionLabel} failed: Network error. Check your connection and try again.`);
    } finally {
      setClaiming(false);
    }
  }, [clientFile, onClaim, onRefresh]);

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
      toast.error("Not logged in â€” cannot move stage");
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

      toast.success(`Moved to ${workflowStageLabel(selectedStage)}`);
      onRefresh?.();
    } catch (err) {
      console.error("[MCF] Move stage error:", err);
      toast.error("Stage update failed: Network error");
    } finally {
      setStageUpdating(false);
    }
  }, [clientFile, onRefresh, selectedStage]);

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
  }, [applyOwnerFlagsOverride, clientFile?.id, clientFile?.propertyId, currentUserId, currentUserName, offerPrepDraft, onRefresh]);

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
        toast.error(`Could not save qualification: ${data.detail ?? data.error ?? `HTTP ${res.status}`}`);
        return false;
      }

      setQualificationSuggestedRoute(parseSuggestedRoute(data.suggested_route));
      setQualificationDraft(nextDraft);
      toast.success("Qualification updated");
      onRefresh?.();
      return true;
    } catch (err) {
      console.error("[MCF] Qualification save error:", err);
      toast.error("Could not save qualification");
      return false;
    } finally {
      setQualificationSaving(false);
    }
  }, [clientFile, onRefresh, qualificationDraft]);

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

      toast.success(nextIso ? "Next action updated" : "Next action cleared");
      setNextActionEditorOpen(false);
      onRefresh?.();
    } catch (err) {
      console.error("[MCF] Set next action error:", err);
      toast.error("Could not save next action");
    } finally {
      setSettingNextAction(false);
    }
  }, [clientFile, nextActionAt, onRefresh]);

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

      toast.success("Note added");
      setNoteDraft("");
      setNoteEditorOpen(false);
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

      setQualificationSuggestedRoute(parseSuggestedRoute(data.suggested_route));
      setCloseoutNote("");
      setCloseoutOpen(false);
      setCloseoutPresetTouched(false);
      setCloseoutDateTouched(false);
      setNextActionAt(toLocalDateTimeInput(nextIso));
      toast.success("Call closeout saved");
      onRefresh?.();
    } catch (err) {
      console.error("[MCF] Call closeout save error:", err);
      toast.error("Could not save call closeout");
    } finally {
      setCloseoutSaving(false);
    }
  }, [
    clientFile,
    closeoutAction,
    closeoutAt,
    closeoutDateTouched,
    closeoutNote,
    closeoutOutcome,
    closeoutPresetTouched,
    onRefresh,
  ]);

  const handleDial = useCallback(async (phoneNumber?: string) => {
    const numberToDial = phoneNumber || displayPhone;
    if (!clientFile || !numberToDial) return;
    setCalling(true);
    setCallStatus("dialing");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/dialer/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          phone: numberToDial,
          leadId: clientFile.id,
          propertyId: clientFile.propertyId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCallStatus("ringing");
        toast.success(`Call initiated to ...${numberToDial.slice(-4)}`);
        setTimeout(() => { setCallStatus(null); setCalling(false); }, 30000);
        fetchDialHistory();
      } else {
        setCallStatus(null);
        setCalling(false);
        toast.error(data.error ?? "Call failed");
      }
    } catch {
      setCallStatus(null);
      setCalling(false);
      toast.error("Network error â€” call failed");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFile, displayPhone, fetchDialHistory]);

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
      toast.error("Network error â€” SMS failed");
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
      console.warn("[MCF] ARV persistence failed:", err);
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
        setSkipTraceResult(parts.length > 0 ? `Found ${parts.join(", ")}` : "Complete â€” no contact info found");
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

  // â”€â”€ Deep Crawl handler â”€â”€
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
        // SSE streaming mode â€” read events as they arrive
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
                // Final event â€” the full result
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
                toast.success(`Deep Crawl complete â€” ${event.result.sources?.join(", ") ?? "done"}`);
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
          toast.success(`Deep Crawl complete â€” ${data.sources?.join(", ") ?? "done"}`);
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
        // ATTOM failed â€” offer Zillow link
        const zUrl = data.zillow_url;
        toast.error(
          `${data.error ?? "Autofill failed"}${zUrl ? " â€” opening Zillow for manual lookup" : ""}`,
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

  const overviewClientFile =
    ownerFlagsOverride
      ? { ...clientFile, ownerFlags: ownerFlagsOverride }
      : clientFile;

  const lbl = SCORE_LABEL_CFG[clientFile.scoreLabel];
  const currentStage = normalizeWorkflowStage(clientFile.status);
  const currentStageLabel = workflowStageLabel(clientFile.status);
  const marketLabel = marketDisplayLabel(clientFile.county);
  const sourceLabel = sourceDisplayLabel(clientFile.source);
  const nextActionUrgency = getNextActionUrgency(clientFile);
  const urgencyToneClass =
    nextActionUrgency.tone === "danger"
      ? "text-red-300 bg-red-500/[0.08] border-red-500/30"
      : nextActionUrgency.tone === "warn"
        ? "text-amber-300 bg-amber-500/[0.08] border-amber-500/30"
        : "text-cyan/80 bg-cyan/[0.06] border-cyan/20";
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
            className={cn("fixed inset-x-4 top-[2%] bottom-[2%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-50 flex flex-col transition-all duration-300", activeTab === "comps" ? "md:w-[1060px]" : "md:w-[860px]")}
          >
            <div className="flex-1 overflow-hidden rounded-[16px] border border-white/[0.08] modal-glass holo-border wet-shine flex flex-col">
              {/* Header */}
              <div className="shrink-0 border-b border-white/[0.06] bg-[rgba(4,4,12,0.88)] backdrop-blur-2xl rounded-t-[16px]">
                <div className="flex items-start justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-lg font-bold truncate" style={{ textShadow: "0 0 12px rgba(0,212,255,0.12)" }}>
                        {clientFile.ownerName || "Unknown Seller"}
                      </h2>
                      <RelationshipBadge data={{
                        ownerAgeInference: clientFile.prediction?.ownerAgeInference,
                        lifeEventProbability: clientFile.prediction?.lifeEventProbability,
                        tags: clientFile.tags,
                        bestAddress: clientFile.fullAddress,
                      }} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{clientFile.fullAddress}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] gap-1 border-white/[0.14]">
                        <MapPin className="h-2.5 w-2.5" />{marketLabel}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] gap-1 border-white/[0.14]">
                        <Radar className="h-2.5 w-2.5" />{sourceLabel}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] gap-1 border-cyan/20 text-cyan">
                        <Target className="h-2.5 w-2.5" />{currentStageLabel}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] gap-1 border-white/[0.14]">
                        <Users className="h-2.5 w-2.5" />Owner: {assigneeLabel}
                      </Badge>
                      {clientFile.qualificationRoute === "escalate" && (
                        <Badge variant="outline" className="text-[9px] gap-1 border-amber-500/25 text-amber-300">
                          <AlertTriangle className="h-2.5 w-2.5" />Escalated Review
                        </Badge>
                      )}
                      {clientFile.status === "nurture" && (() => {
                        const fuIso = clientFile.followUpDate ?? clientFile.nextCallScheduledAt;
                        const fuMs = fuIso ? new Date(fuIso).getTime() : NaN;
                        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                        const isStale = !Number.isNaN(fuMs) ? fuMs < sevenDaysAgo : true;
                        return isStale ? (
                          <Badge variant="outline" className="text-[9px] gap-1 border-red-500/25 text-red-300">
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
                    {clientFile.enriched && (
                      <Badge variant="outline" className="text-[9px] gap-1 text-cyan border-cyan/20">
                        <CheckCircle2 className="h-2.5 w-2.5" />Enriched
                      </Badge>
                    )}
                    <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.04] transition-colors text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Primary operator actions */}
              <div className="shrink-0 px-4 py-3 border-b border-white/[0.06] bg-[rgba(12,12,22,0.6)]">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-cyan/20 hover:border-cyan/40 hover:bg-cyan/[0.06]"
                    disabled={!displayPhone || calling}
                    onClick={() => handleDial()}
                  >
                    {calling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                    {calling ? "Dialing..." : "Call"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/[0.06]"
                    disabled={!displayPhone}
                    onClick={() => setSmsOpen((v) => !v)}
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />Text
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-cyan/25 hover:border-cyan/45 hover:bg-cyan/[0.08]"
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
                    <CheckCircle2 className="h-3.5 w-3.5 text-cyan" />Call Closeout
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={claiming || isAssignedToCurrentUser}
                    onClick={handleClaimLead}
                  >
                    {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                    {claiming ? "Saving..." : claimButtonLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/[0.06]"
                    onClick={() => {
                      setNextActionEditorOpen((v) => !v);
                      setCloseoutOpen(false);
                    }}
                  >
                    <Calendar className="h-3.5 w-3.5 text-amber-400" />Set Next Action
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-white/[0.14] hover:border-white/[0.25] hover:bg-white/[0.06]"
                    onClick={() => {
                      setNoteEditorOpen((v) => !v);
                      setCloseoutOpen(false);
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" />Log Note
                  </Button>

                  <div className="ml-auto flex items-center gap-2">
                    <select
                      value={selectedStage}
                      onChange={(e) => setSelectedStage(e.target.value as WorkflowStageId)}
                      disabled={stageUpdating}
                      className="h-8 rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                      aria-label="Move lead stage"
                    >
                      {WORKFLOW_STAGE_OPTIONS.map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.label}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-cyan/20 hover:border-cyan/40 hover:bg-cyan/[0.06]"
                      disabled={stageUpdating || !stageChanged || !stagePrecheck.ok}
                      onClick={handleMoveStage}
                    >
                      {stageUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                      Move Stage
                    </Button>
                  </div>
                </div>
                {stageChanged && !stagePrecheck.ok && (
                  <p className="mt-2 text-[10px] text-amber-300">
                    Before moving to {workflowStageLabel(selectedStage)}:{" "}
                    <span className="font-medium">{stagePrecheck.requiredActions[0]}</span>
                  </p>
                )}
                {(closeoutOpen || nextActionEditorOpen || noteEditorOpen) && (
                  <div className="mt-2 grid grid-cols-1 lg:grid-cols-3 gap-2">
                    {closeoutOpen && (
                      <div className="rounded-[10px] border border-cyan/20 bg-cyan/[0.06] p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-cyan">Call Closeout</p>
                          <span className="text-[9px] text-cyan/80">{closeoutActionLabel(closeoutAction)}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <label className="space-y-1">
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Call Outcome</span>
                            <select
                              value={closeoutOutcome}
                              onChange={(e) => setCloseoutOutcome(e.target.value)}
                              className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2 text-xs text-foreground focus:outline-none focus:border-cyan/30"
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
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Next Action</span>
                            <select
                              value={closeoutAction}
                              onChange={(e) => {
                                const action = e.target.value as CloseoutNextAction;
                                setCloseoutAction(action);
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
                              className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                            >
                              <option value="follow_up_call">Follow-Up Call</option>
                              <option value="nurture_check_in">Nurture Check-In</option>
                              <option value="escalation_review">Escalate Review</option>
                            </select>
                          </label>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Follow-Up Preset</p>
                          <div className="flex flex-wrap gap-1.5">
                            {CLOSEOUT_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleCloseoutPresetSelect(preset.id)}
                                className={cn(
                                  "h-6 px-2 rounded-[7px] border text-[10px] transition-colors",
                                  closeoutPreset === preset.id
                                    ? "border-cyan/40 text-cyan bg-cyan/[0.12]"
                                    : "border-white/[0.12] text-muted-foreground hover:text-foreground hover:border-white/[0.24]",
                                )}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground/75">
                            Call presets schedule lead follow-up dates; only route actions create workflow tasks.
                          </p>
                        </div>
                        <label className="space-y-1 block">
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Follow-Up Date</span>
                          <input
                            type="datetime-local"
                            value={closeoutAt}
                            onChange={(e) => {
                              setCloseoutDateTouched(true);
                              setCloseoutAt(e.target.value);
                            }}
                            className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                          />
                        </label>
                        <textarea
                          value={closeoutNote}
                          onChange={(e) => setCloseoutNote(e.target.value)}
                          placeholder="Quick call summary note..."
                          className="w-full h-16 rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-cyan/30"
                          maxLength={1000}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-[11px]"
                            disabled={closeoutSaving}
                            onClick={handleSaveCallCloseout}
                          >
                            {closeoutSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Save Closeout
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] text-muted-foreground"
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
                          <span className="ml-auto text-[9px] text-muted-foreground/50">{closeoutNote.length}/1000</span>
                        </div>
                      </div>
                    )}
                    {nextActionEditorOpen && (
                      <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/[0.06] p-2.5 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-300">Next Action</p>
                        <input
                          type="datetime-local"
                          value={nextActionAt}
                          onChange={(e) => setNextActionAt(e.target.value)}
                          className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-[11px]"
                            disabled={settingNextAction}
                            onClick={handleSetNextAction}
                          >
                            {settingNextAction ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            {nextActionAt ? "Save Next Action" : "Clear Next Action"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] text-muted-foreground"
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
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Lead Note</p>
                        <textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Add operator note, outcome, or seller update..."
                          className="w-full h-20 rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-cyan/30"
                          maxLength={1000}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-[11px]"
                            disabled={savingNote || !noteDraft.trim()}
                            onClick={handleAppendNote}
                          >
                            {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Save Note
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] text-muted-foreground"
                            onClick={() => {
                              setNoteDraft("");
                              setNoteEditorOpen(false);
                            }}
                          >
                            Cancel
                          </Button>
                          <span className="ml-auto text-[9px] text-muted-foreground/50">{noteDraft.length}/1000</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Next action strip */}
              <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.06] bg-[rgba(8,10,18,0.55)]">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className={cn("rounded-[10px] border px-3 py-2", urgencyToneClass)}>
                    <p className="text-[9px] uppercase tracking-wider font-semibold">Contact Urgency</p>
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      <UrgencyIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-semibold">{nextActionUrgency.label}</span>
                    </div>
                    <p className="text-[10px] opacity-80 mt-0.5">{nextActionUrgency.detail}</p>
                    <p className="text-[10px] opacity-80 mt-0.5">
                      Next Action Type: <span className="font-medium">{nextActionView.label}</span>
                    </p>
                    <p className={cn("text-[10px] mt-1", !clientFile.assignedTo ? "text-amber-300" : "opacity-80")}>
                      {!clientFile.assignedTo
                        ? "Owner unassigned. Claim or assign to keep this lead active."
                        : isAssignedToCurrentUser
                          ? "You own this next action."
                          : `Next action owned by ${assigneeLabel}.`}
                    </p>
                    {missingNextAction && (
                      <p className="text-[10px] mt-1 font-semibold">Set a next action to keep momentum.</p>
                    )}
                  </div>
                  <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Last Contact Attempt</p>
                    <p className="text-xs mt-1 text-foreground">{formatDateTimeShort(clientFile.lastContactAt)}</p>
                  </div>
                  <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Next Action</p>
                    <p className={cn("text-xs mt-1", missingNextAction ? "text-amber-300 font-semibold" : "text-foreground")}>
                      {missingNextAction ? "Not set" : `${nextActionView.label} • ${formatDateTimeShort(nextActionIso)}`}
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Call Sequence</p>
                    <p className="text-xs mt-1 text-foreground">{currentSequenceLabel}</p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] bg-[rgba(12,12,22,0.5)] overflow-x-auto scrollbar-none">
                {TABS.filter((tab) => PRIMARY_TAB_IDS.has(tab.id)).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-medium transition-all whitespace-nowrap",
                      activeTab === tab.id
                        ? "text-cyan bg-cyan/8 border border-cyan/20 shadow-[0_0_8px_rgba(0,212,255,0.1)]"
                        : "text-muted-foreground hover:text-foreground border border-transparent hover:border-glass-border"
                    )}
                  >
                    <tab.icon className="h-3 w-3" />{tab.label}
                  </button>
                ))}

                <span className="ml-1 mr-0.5 px-1.5 text-[8px] uppercase tracking-[0.16em] text-muted-foreground/35 border-l border-white/[0.08]">
                  Advanced
                </span>

                {TABS.filter((tab) => ADVANCED_TAB_IDS.has(tab.id)).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-[10px] font-medium transition-all whitespace-nowrap",
                      activeTab === tab.id
                        ? "text-cyan bg-cyan/8 border border-cyan/20 shadow-[0_0_8px_rgba(0,212,255,0.1)]"
                        : "text-muted-foreground/55 hover:text-muted-foreground border border-transparent hover:border-white/[0.08]"
                    )}
                  >
                    <tab.icon className="h-3 w-3" />{tab.label}
                    {tab.id === "comps" && selectedComps.length > 0 && (
                      <span className="ml-1 bg-cyan/15 text-cyan text-[9px] px-1.5 rounded-full font-semibold">{selectedComps.length}</span>
                    )}
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
                      />
                    )}
                    {activeTab === "contact" && (
                      <ContactTab cf={clientFile} overlay={overlay} onSkipTrace={handleSkipTrace} skipTracing={skipTracing} onDial={handleDial} onSms={handleSendSms} calling={calling} onRefresh={onRefresh} />
                    )}
                    {activeTab === "comps" && <CompsTab cf={clientFile} selectedComps={selectedComps} onAddComp={handleAddComp} onRemoveComp={handleRemoveComp} onSkipTrace={handleSkipTrace} computedArv={computedArv} onArvChange={handleArvChange} />}
                    {activeTab === "calculator" && <OfferCalcTab cf={clientFile} computedArv={computedArv} />}
                    {activeTab === "documents" && <DocumentsTab cf={clientFile} computedArv={computedArv} />}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="shrink-0 flex flex-col border-t border-white/[0.06] bg-[rgba(4,4,12,0.88)] backdrop-blur-2xl rounded-b-[16px]">
                {/* Call status banner */}
                {callStatus && (
                  <div className="flex items-center gap-2 px-6 py-2 bg-cyan/[0.08] border-b border-cyan/15 text-xs text-cyan">
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
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">SMS to ***{(smsPhone || displayPhone)?.slice(-4)}</p>
                      <button onClick={() => setSmsOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <textarea
                      value={smsMessage}
                      onChange={(e) => setSmsMessage(e.target.value)}
                      placeholder="Type your messageâ€¦"
                      className="w-full h-16 rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-cyan/30"
                      maxLength={320}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground/40">{smsMessage.length}/320</span>
                      <Button size="sm" className="gap-1.5" disabled={smsSending || !smsMessage.trim()} onClick={() => handleSendSms()}>
                        {smsSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        {smsSending ? "Sendingâ€¦" : "Send SMS"}
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
                  <div className="ml-auto text-[10px] text-muted-foreground">
                    Lead ID: {clientFile.id.slice(0, 8)} â€¢ {sourceLabel}
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
            </div>
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

