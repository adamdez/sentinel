import type {
  TinaOwnerFlowBasisAdjudicationItem,
  TinaOwnerFlowBasisAdjudicationSnapshot,
  TinaOwnerFlowBasisRollupStatus,
  TinaOwnerFlowBasisAdjudicationStatus,
  TinaOwnerFlowBasisAdjudicationTopic,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaOwnershipCapitalEvents } from "@/tina/lib/ownership-capital-events";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import type { TinaFilingLaneId, TinaWorkspaceDraft } from "@/tina/types";

export interface TinaOwnerFlowBasisSignalProfile {
  ownerFlowSignal: boolean;
  basisSignal: boolean;
  capitalRollforwardSignal: boolean;
  priorBasisSignal: boolean;
  loanSignal: boolean;
  noteSignal: boolean;
  repaymentSignal: boolean;
  contributionSignal: boolean;
  distributionSignal: boolean;
  allocationSignal: boolean;
  ownershipChangeSignal: boolean;
  formerOwnerPaymentSignal: boolean;
  buyoutSignal: boolean;
  debtForgivenessSignal: boolean;
  assetBasisSignal: boolean;
  sweatEquitySignal: boolean;
  multiOwnerSignal: boolean;
  spouseOwnedSignal: boolean;
  payrollSignal: boolean;
}

interface TinaOwnerFlowBasisPlan {
  id: string;
  title: string;
  topic: TinaOwnerFlowBasisAdjudicationTopic;
  sensitivity: TinaOwnerFlowBasisAdjudicationItem["sensitivity"];
  enabled: boolean;
  requiredRecordIds: string[];
  relatedEventIds: string[];
  treatmentIds: string[];
  likelyCharacterizations: string[];
  requiredProof: string[];
}

const OWNER_FLOW_PATTERNS = [
  /\bowner draw(s)?\b/i,
  /\bdistribution(s)?\b/i,
  /\bdraw(s)?\b/i,
  /\bshareholder loan\b/i,
  /\bpartner loan\b/i,
  /\bowner loan\b/i,
  /\bloan to owner\b/i,
  /\bloan from owner\b/i,
  /\bdue to owner\b/i,
  /\bdue from owner\b/i,
  /\bdue from shareholder\b/i,
  /\breimbursement\b/i,
];
const BASIS_PATTERNS = [
  /\bbasis\b/i,
  /\bcapital account\b/i,
  /\bcapital rollforward\b/i,
  /\bbasis rollforward\b/i,
  /\broll forward\b/i,
  /\bk-1\b/i,
  /\bpartner basis\b/i,
  /\bshareholder basis\b/i,
  /\bstock basis\b/i,
];
const CAPITAL_ROLLFORWARD_PATTERNS = [
  /\bcapital rollforward\b/i,
  /\bbasis rollforward\b/i,
  /\bbeginning capital\b/i,
  /\bending capital\b/i,
  /\bopening basis\b/i,
  /\bclosing basis\b/i,
  /\bprior year k-1\b/i,
  /\bstock basis schedule\b/i,
];
const PRIOR_BASIS_PATTERNS = [
  /\bprior year\b/i,
  /\bprior-year\b/i,
  /\bbeginning capital\b/i,
  /\bopening basis\b/i,
  /\bcarryover basis\b/i,
  /\bprior depreciation\b/i,
];
const LOAN_PATTERNS = [
  /\bloan\b/i,
  /\bpromissory note\b/i,
  /\brepayment\b/i,
  /\binterest\b/i,
  /\bdue to\b/i,
  /\bdue from\b/i,
];
const NOTE_PATTERNS = [/\bpromissory note\b/i, /\bnote receivable\b/i, /\bnote payable\b/i];
const REPAYMENT_PATTERNS = [/\brepayment\b/i, /\bpaid back\b/i, /\binstallment\b/i];
const CONTRIBUTION_PATTERNS = [
  /\bcontribution\b/i,
  /\bcontributed\b/i,
  /\bcapital infusion\b/i,
  /\bpaid in capital\b/i,
  /\bowner contribution\b/i,
  /\bcontributed equipment\b/i,
  /\bcontributed assets?\b/i,
];
const DISTRIBUTION_PATTERNS = [
  /\bdistribution(s)?\b/i,
  /\bdividend(s)?\b/i,
  /\bdraw(s)?\b/i,
  /\bguaranteed payment(s)?\b/i,
  /\bredemption\b/i,
];
const ALLOCATION_PATTERNS = [
  /\ballocation\b/i,
  /\bspecial allocation\b/i,
  /\bprofit sharing\b/i,
  /\b70\/30\b/i,
  /\b50\/50\b/i,
  /\bownership split\b/i,
];
const OWNERSHIP_CHANGE_PATTERNS = [
  /\bownership changed\b/i,
  /\bmidyear ownership\b/i,
  /\bnew owner\b/i,
  /\bpartner exit\b/i,
  /\bowner exit\b/i,
  /\bsold interests?\b/i,
  /\btransfer agreement\b/i,
  /\bformer owner\b/i,
];
const FORMER_OWNER_PAYMENT_PATTERNS = [
  /\bformer owner\b/i,
  /\bowner exit\b/i,
  /\bformer partner\b/i,
  /\bformer shareholder\b/i,
  /\bcontinuing payout\b/i,
];
const BUYOUT_PATTERNS = [/\bbuyout\b/i, /\bredemption\b/i, /\bformer owner\b/i];
const DEBT_FORGIVENESS_PATTERNS = [
  /\bdebt forgiven\b/i,
  /\bforgiven debt\b/i,
  /\bcancellation of debt\b/i,
  /\b1099-c\b/i,
  /\bsettled with lender\b/i,
  /\bwritten off by a lender\b/i,
];
const ASSET_BASIS_PATTERNS = [
  /\bdepreciation\b/i,
  /\basset schedule\b/i,
  /\bplaced in service\b/i,
  /\bdisposed asset\b/i,
  /\basset sold\b/i,
  /\babandoned\b/i,
  /\brecapture\b/i,
  /\brepo('?d)?\b/i,
];
const SWEAT_EQUITY_PATTERNS = [
  /\bsweat equity\b/i,
  /\blabor contribution\b/i,
  /\bservices for ownership\b/i,
  /\bworked in the business\b/i,
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function buildDraftText(draft: TinaWorkspaceDraft): string {
  return [
    draft.profile.notes,
    ...draft.documents.flatMap((document) => [
      document.name,
      document.requestLabel ?? "",
      document.requestId ?? "",
    ]),
    ...draft.sourceFacts.flatMap((fact) => [fact.label, fact.value]),
    ...draft.documentReadings.flatMap((reading) => reading.detailLines),
  ]
    .join(" ")
    .toLowerCase();
}

function treatmentEscalationStatus(
  treatmentBucket: string | null
): TinaOwnerFlowBasisAdjudicationStatus | null {
  if (treatmentBucket === "reject") return "blocked";
  if (treatmentBucket === "review") return "needs_review";
  return null;
}

function maxStatus(
  current: TinaOwnerFlowBasisAdjudicationStatus,
  next: TinaOwnerFlowBasisAdjudicationStatus | null
): TinaOwnerFlowBasisAdjudicationStatus {
  const rank = (value: TinaOwnerFlowBasisAdjudicationStatus) =>
    value === "blocked" ? 4 : value === "needs_review" ? 3 : value === "clear" ? 2 : 1;
  if (!next) return current;
  return rank(next) > rank(current) ? next : current;
}

export function buildTinaOwnerFlowBasisSignalProfileFromText(
  text: string
): TinaOwnerFlowBasisSignalProfile {
  const haystack = text.toLowerCase();

  return {
    ownerFlowSignal: hasAny(haystack, OWNER_FLOW_PATTERNS),
    basisSignal: hasAny(haystack, BASIS_PATTERNS),
    capitalRollforwardSignal: hasAny(haystack, CAPITAL_ROLLFORWARD_PATTERNS),
    priorBasisSignal: hasAny(haystack, PRIOR_BASIS_PATTERNS),
    loanSignal: hasAny(haystack, LOAN_PATTERNS),
    noteSignal: hasAny(haystack, NOTE_PATTERNS),
    repaymentSignal: hasAny(haystack, REPAYMENT_PATTERNS),
    contributionSignal: hasAny(haystack, CONTRIBUTION_PATTERNS),
    distributionSignal: hasAny(haystack, DISTRIBUTION_PATTERNS),
    allocationSignal: hasAny(haystack, ALLOCATION_PATTERNS),
    ownershipChangeSignal: hasAny(haystack, OWNERSHIP_CHANGE_PATTERNS),
    formerOwnerPaymentSignal: hasAny(haystack, FORMER_OWNER_PAYMENT_PATTERNS),
    buyoutSignal: hasAny(haystack, BUYOUT_PATTERNS),
    debtForgivenessSignal: hasAny(haystack, DEBT_FORGIVENESS_PATTERNS),
    assetBasisSignal: hasAny(haystack, ASSET_BASIS_PATTERNS),
    sweatEquitySignal: hasAny(haystack, SWEAT_EQUITY_PATTERNS),
    multiOwnerSignal: /\bmulti owner\b|\bmulti-member\b|\bmultiple owners\b|\bpartner\b/i.test(
      haystack
    ),
    spouseOwnedSignal: /\bspouse\b|\bhusband wife\b|\bmarried couple\b/i.test(haystack),
    payrollSignal: /\bpayroll\b|\b941\b|\bw-2\b|\breasonable compensation\b/i.test(haystack),
  };
}

function plansForLane(
  laneId: TinaFilingLaneId,
  signals: TinaOwnerFlowBasisSignalProfile,
  draft: TinaWorkspaceDraft
): TinaOwnerFlowBasisPlan[] {
  const multiOwnerLike =
    (draft.profile.ownerCount ?? 0) > 1 || signals.multiOwnerSignal || signals.spouseOwnedSignal;
  const corporateLane = laneId === "1120_s" || laneId === "1120";
  const transitionPressure =
    draft.profile.ownershipChangedDuringYear ||
    draft.profile.hasOwnerBuyoutOrRedemption ||
    draft.profile.hasFormerOwnerPayments ||
    signals.ownershipChangeSignal ||
    signals.formerOwnerPaymentSignal ||
    signals.buyoutSignal;
  const basisPressure =
    signals.basisSignal ||
    signals.capitalRollforwardSignal ||
    signals.priorBasisSignal ||
    signals.contributionSignal ||
    signals.distributionSignal ||
    signals.loanSignal ||
    signals.allocationSignal ||
    signals.sweatEquitySignal ||
    transitionPressure ||
    multiOwnerLike ||
    corporateLane;

  const basePlans: TinaOwnerFlowBasisPlan[] = [
    {
      id: "opening-basis-footing",
      title:
        laneId === "1065"
          ? "Opening basis and capital footing"
          : laneId === "1120_s"
            ? "Opening shareholder basis footing"
            : laneId === "1120"
              ? "Opening equity footing"
              : "Owner boundary footing",
      topic: "opening_basis",
      sensitivity: "high",
      enabled: laneId !== "schedule_c_single_member_llc" || signals.basisSignal || signals.loanSignal,
      requiredRecordIds:
        laneId === "1065"
          ? ["partnership-capital", "partnership-prior-return", "partnership-ownership"]
          : laneId === "1120_s"
            ? ["s-corp-shareholders", "s-corp-prior-return", "s-corp-distributions"]
            : laneId === "1120"
              ? ["c-corp-equity", "c-corp-prior-return", "c-corp-books"]
              : ["schedule-c-prior-return", "schedule-c-books"],
      relatedEventIds: ["opening-ownership"],
      treatmentIds: ["basis-capital-treatment"],
      likelyCharacterizations:
        laneId === "1065"
          ? ["Partner capital", "Partner basis", "Debt basis where support exists"]
          : laneId === "1120_s"
            ? ["Shareholder stock basis", "Shareholder debt basis", "Carryover basis posture"]
            : laneId === "1120"
              ? ["Corporate equity", "Retained earnings footing", "Shareholder funding posture"]
              : ["Owner contribution boundary", "Personal versus business footing"],
      requiredProof:
        laneId === "1065" || laneId === "1120_s"
          ? [
              "Opening basis or capital balances",
              "Prior-year K-1 or return support",
              "Current-year owner-flow history tied back to the opening footing",
            ]
          : laneId === "1120"
            ? [
                "Opening equity rollforward",
                "Prior-year corporate return support",
                "Shareholder funding history for the current year",
              ]
            : [
                "Prior-year return support if the owner boundary changed",
                "Current-year owner-flow support for business versus personal treatment",
              ],
    },
    {
      id: "basis-rollforward-continuity",
      title:
        laneId === "1065"
          ? "Partner basis and capital rollforward continuity"
          : laneId === "1120_s"
            ? "Shareholder basis rollforward continuity"
            : laneId === "1120"
              ? "Equity rollforward continuity"
              : "Owner-boundary rollforward continuity",
      topic: "basis_rollforward_continuity",
      sensitivity: "high",
      enabled:
        laneId !== "schedule_c_single_member_llc"
          ? basisPressure
          : basisPressure && (signals.ownerFlowSignal || transitionPressure),
      requiredRecordIds:
        laneId === "1065"
          ? ["partnership-capital", "partnership-payments", "partnership-prior-return", "partnership-books"]
          : laneId === "1120_s"
            ? ["s-corp-shareholders", "s-corp-distributions", "s-corp-prior-return", "s-corp-books"]
            : laneId === "1120"
              ? ["c-corp-equity", "c-corp-shareholder-flows", "c-corp-prior-return", "c-corp-books"]
              : ["schedule-c-prior-return", "schedule-c-books", "schedule-c-bank-card"],
      relatedEventIds: ["opening-ownership", "capital-economics", "closing-ownership"],
      treatmentIds: ["basis-capital-treatment", "owner-flow-treatment"],
      likelyCharacterizations:
        laneId === "1065"
          ? [
              "Beginning partner capital tied to current-year contributions, draws, and allocations",
              "Basis rollforward sensitive to debt, loss, and distribution history",
            ]
          : laneId === "1120_s"
            ? [
                "Beginning stock or debt basis tied to distributions and current-year pass-through items",
                "Shareholder rollforward sensitive to compensation, loans, and prior-year carry items",
              ]
            : laneId === "1120"
              ? [
                  "Equity rollforward tied to shareholder funding, dividends, and retained earnings changes",
                ]
              : [
                  "Owner-boundary rollforward tied to draws, reimbursements, and prior-year footing",
                ],
      requiredProof:
        laneId === "1065" || laneId === "1120_s"
          ? [
              "Beginning owner basis or capital balances tied to the last filed return",
              "Current-year contribution, loan, income, loss, and distribution schedule",
              "Closing rollforward that explains how the year-end footing was reached",
            ]
          : laneId === "1120"
            ? [
                "Beginning equity tied to the prior corporate return",
                "Current-year shareholder funding and extraction schedule",
                "Closing equity rollforward that matches the books and current-year posture",
              ]
            : [
                "A clear opening-versus-closing owner-flow story for the current year",
                "Support showing which flows were business, owner, loan, or personal",
              ],
    },
    {
      id: "owner-flow-characterization",
      title: "Owner-flow characterization",
      topic: "owner_flow_characterization",
      sensitivity: laneId === "schedule_c_single_member_llc" ? "medium" : "high",
      enabled:
        laneId !== "schedule_c_single_member_llc" ||
        signals.ownerFlowSignal ||
        signals.loanSignal ||
        signals.distributionSignal,
      requiredRecordIds:
        laneId === "1065"
          ? ["partnership-payments", "partnership-books"]
          : laneId === "1120_s"
            ? ["s-corp-distributions", "s-corp-payroll", "s-corp-books"]
            : laneId === "1120"
              ? ["c-corp-shareholder-flows", "c-corp-compensation", "c-corp-books"]
              : ["schedule-c-books", "schedule-c-bank-card"],
      relatedEventIds: ["capital-economics", "former-owner-payments"],
      treatmentIds: ["owner-flow-treatment"],
      likelyCharacterizations:
        laneId === "1065"
          ? ["Partner distribution", "Guaranteed payment", "Partner loan", "Capital contribution"]
          : laneId === "1120_s"
            ? ["Shareholder distribution", "Shareholder loan", "Officer wage", "Reimbursement"]
            : laneId === "1120"
              ? ["Dividend", "Shareholder loan", "Officer compensation", "Capital contribution"]
              : ["Owner draw", "Business reimbursement", "Personal nondeductible charge"],
      requiredProof: [
        "Owner-flow ledger or transaction grouping",
        "Support for whether each material flow was debt, equity, compensation, or reimbursement",
      ],
    },
    {
      id: "loan-vs-equity",
      title:
        laneId === "1120" ? "Shareholder loan versus dividend or equity posture" : "Loan versus equity posture",
      topic: "loan_vs_equity",
      sensitivity: "high",
      enabled:
        laneId !== "schedule_c_single_member_llc" ||
        signals.loanSignal ||
        signals.contributionSignal ||
        signals.distributionSignal,
      requiredRecordIds:
        laneId === "1065"
          ? ["partnership-capital", "partnership-payments", "partnership-books"]
          : laneId === "1120_s"
            ? ["s-corp-distributions", "s-corp-shareholders", "s-corp-books"]
            : laneId === "1120"
              ? ["c-corp-shareholder-flows", "c-corp-equity", "c-corp-books"]
              : ["schedule-c-books", "schedule-c-bank-card"],
      relatedEventIds: ["capital-economics", "former-owner-payments"],
      treatmentIds: ["basis-capital-treatment", "owner-flow-treatment"],
      likelyCharacterizations:
        laneId === "1120"
          ? ["Shareholder loan", "Dividend", "Capital contribution"]
          : ["Loan to or from owner", "Capital contribution", "Distribution or draw"],
      requiredProof: [
        "Debt documents or repayment evidence if loans are claimed",
        "Interest, repayment, and intent evidence separating debt from equity",
      ],
    },
    {
      id: "distribution-taxability",
      title:
        laneId === "1120"
          ? "Shareholder extraction taxability"
          : "Distribution taxability and owner-level footing",
      topic: "distribution_taxability",
      sensitivity: "high",
      enabled:
        laneId === "1065" ||
        laneId === "1120_s" ||
        signals.distributionSignal ||
        signals.basisSignal ||
        multiOwnerLike ||
        corporateLane,
      requiredRecordIds:
        laneId === "1065"
          ? ["partnership-capital", "partnership-payments", "partnership-prior-return"]
          : laneId === "1120_s"
            ? ["s-corp-distributions", "s-corp-prior-return", "s-corp-shareholders"]
            : laneId === "1120"
              ? ["c-corp-shareholder-flows", "c-corp-equity", "c-corp-prior-return"]
              : ["schedule-c-books", "schedule-c-bank-card"],
      relatedEventIds: ["capital-economics", "closing-ownership"],
      treatmentIds: ["basis-capital-treatment", "owner-flow-treatment"],
      likelyCharacterizations:
        laneId === "1065"
          ? ["Nontaxable distribution within basis", "Distribution in excess of basis", "Guaranteed payment overlap"]
          : laneId === "1120_s"
            ? ["Nontaxable distribution within basis", "Taxable distribution to extent required", "Debt-basis-supported loss or distribution posture"]
            : laneId === "1120"
              ? ["Dividend", "Compensation recharacterization", "Shareholder loan settlement"]
              : ["Owner draw outside the deduction stack"],
      requiredProof: [
        "Opening footing plus current-year flows tied to distributions",
        "Prior-year pass-through or equity history that changes owner-level taxability",
      ],
    },
    {
      id: "ownership-change-allocation",
      title: "Ownership-change allocation and timing",
      topic: "ownership_change_allocation",
      sensitivity: "high",
      enabled: draft.profile.ownershipChangedDuringYear || signals.ownershipChangeSignal,
      requiredRecordIds:
        laneId === "1065"
          ? ["partnership-transfer", "partnership-ownership", "partnership-capital"]
          : laneId === "1120_s"
            ? ["s-corp-shareholders", "s-corp-distributions", "s-corp-books"]
            : laneId === "1120"
              ? ["c-corp-shareholder-flows", "c-corp-equity", "c-corp-books"]
              : ["schedule-c-prior-return", "schedule-c-books"],
      relatedEventIds: ["ownership-change", "closing-ownership"],
      treatmentIds: ["basis-capital-treatment"],
      likelyCharacterizations:
        laneId === "1065"
          ? ["Interim allocation change", "Partner transfer", "Redeemed interest"]
          : ["Stock or ownership transfer", "Owner exit or entry", "Allocation timing change"],
      requiredProof: [
        "A dated ownership timeline",
        "Who sold or redeemed what and when",
        "How cash or notes changed hands during the transition",
      ],
    },
    {
      id: "buyout-redemption",
      title: "Buyout and redemption economics",
      topic: "buyout_redemption",
      sensitivity: "high",
      enabled:
        draft.profile.hasOwnerBuyoutOrRedemption ||
        draft.profile.hasFormerOwnerPayments ||
        signals.buyoutSignal ||
        signals.formerOwnerPaymentSignal,
      requiredRecordIds:
        laneId === "1065"
          ? ["partnership-transfer", "partnership-capital", "partnership-books"]
          : laneId === "1120_s"
            ? ["s-corp-distributions", "s-corp-shareholders", "s-corp-books"]
            : laneId === "1120"
              ? ["c-corp-shareholder-flows", "c-corp-equity", "c-corp-books"]
              : ["schedule-c-books", "schedule-c-prior-return"],
      relatedEventIds: ["buyout-redemption", "former-owner-payments", "ownership-change"],
      treatmentIds: ["basis-capital-treatment", "owner-flow-treatment"],
      likelyCharacterizations:
        laneId === "1065"
          ? ["Partner buyout", "Redemption payment", "Section 736-style owner-exit economics"]
          : laneId === "1120"
            ? ["Stock redemption", "Shareholder debt settlement", "Dividend-like extraction"]
            : ["Owner buyout", "Redemption", "Former-owner payment stream"],
      requiredProof: [
        "Buyout, redemption, or settlement papers",
        "Payment terms for former-owner cash or notes",
        "How the redemption or purchase affected remaining owner footing",
      ],
    },
    {
      id: "debt-basis-overlap",
      title: "Debt-event and basis overlap",
      topic: "debt_basis_overlap",
      sensitivity: "high",
      enabled: signals.debtForgivenessSignal,
      requiredRecordIds:
        laneId === "1065"
          ? ["partnership-books", "partnership-capital"]
          : laneId === "1120_s"
            ? ["s-corp-books", "s-corp-distributions"]
            : laneId === "1120"
              ? ["c-corp-books", "c-corp-shareholder-flows"]
              : ["schedule-c-books", "schedule-c-prior-return"],
      relatedEventIds: [],
      treatmentIds: ["debt-forgiveness-treatment", "basis-capital-treatment"],
      likelyCharacterizations: [
        "Taxable cancellation-of-debt income",
        "Exclusion path if facts support it",
        "Debt event that also changes owner or asset footing",
      ],
      requiredProof: [
        "Lender settlement or forgiveness documents",
        "Whether collateral or owner guarantees changed the economics",
        "Any solvency, bankruptcy, or balance-sheet facts needed for exclusions",
      ],
    },
    {
      id: "asset-basis-overlap",
      title: "Asset-basis and disposition overlap",
      topic: "asset_basis_overlap",
      sensitivity: "high",
      enabled: signals.assetBasisSignal || draft.profile.hasFixedAssets,
      requiredRecordIds:
        laneId === "1065"
          ? ["partnership-books"]
          : laneId === "1120_s"
            ? ["s-corp-books"]
            : laneId === "1120"
              ? ["c-corp-books"]
              : ["schedule-c-fixed-assets", "schedule-c-prior-return"],
      relatedEventIds: [],
      treatmentIds: ["depreciation-treatment"],
      likelyCharacterizations: [
        "Depreciation carryover support",
        "Disposition gain/loss support",
        "Recapture or abandonment treatment",
      ],
      requiredProof: [
        "Asset schedule with original cost and depreciation history",
        "Disposition or abandonment documents for assets that left service",
      ],
    },
  ];

  return basePlans.filter((plan) => plan.enabled);
}

function buildItem(args: {
  plan: TinaOwnerFlowBasisPlan;
  status: TinaOwnerFlowBasisAdjudicationStatus;
  relatedRecordIds: string[];
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}): TinaOwnerFlowBasisAdjudicationItem {
  const blocked = args.status === "blocked";
  const watch = args.status === "needs_review";

  return {
    id: args.plan.id,
    title: args.plan.title,
    topic: args.plan.topic,
    status: args.status,
    sensitivity: args.plan.sensitivity,
    summary:
      args.status === "clear"
        ? `Tina has enough current support to keep ${args.plan.title.toLowerCase()} coherent.`
        : watch
          ? `Tina sees the shape of ${args.plan.title.toLowerCase()}, but reviewer control still matters before the file sounds stable.`
          : blocked
            ? `Tina should not trust ${args.plan.title.toLowerCase()} until the owner-flow and basis proof catches up.`
            : `${args.plan.title} does not currently apply to this lane.`,
    nextStep:
      args.status === "clear"
        ? "Carry this footing forward into return calculations, reviewer artifacts, and final package truth."
        : args.plan.requiredProof[0] ??
          "Keep this area reviewer-controlled until stronger owner-flow proof exists.",
    likelyCharacterizations: unique(args.plan.likelyCharacterizations),
    requiredProof: unique(args.plan.requiredProof),
    relatedRecordIds: unique(args.relatedRecordIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
    relatedFactIds: unique(args.relatedFactIds),
  };
}

function combineRollupStatuses(
  items: TinaOwnerFlowBasisAdjudicationItem[]
): TinaOwnerFlowBasisRollupStatus {
  if (items.length === 0) return "not_applicable";
  if (items.some((item) => item.status === "blocked")) return "blocked";
  if (items.some((item) => item.status === "needs_review")) return "review_required";
  if (items.some((item) => item.status === "clear")) return "clear";
  return "not_applicable";
}

function describeRollup(
  label: string,
  status: TinaOwnerFlowBasisRollupStatus
): string | null {
  if (status === "blocked") return label;
  if (status === "review_required") return `${label} (review)`;
  return null;
}

export function buildTinaOwnerFlowBasisAdjudication(
  draft: TinaWorkspaceDraft
): TinaOwnerFlowBasisAdjudicationSnapshot {
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const laneId = federalReturnRequirements.laneId;
  const recordMatrix = buildTinaEntityRecordMatrix(draft);
  const ownershipCapitalEvents = buildTinaOwnershipCapitalEvents(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const text = buildDraftText(draft);
  const signals = buildTinaOwnerFlowBasisSignalProfileFromText(text);
  const recordMap = new Map(recordMatrix.items.map((item) => [item.id, item]));
  const eventMap = new Map(ownershipCapitalEvents.events.map((event) => [event.id, event]));
  const treatmentMap = new Map(treatmentJudgment.items.map((item) => [item.id, item]));
  const plans = plansForLane(laneId, signals, draft);

  const items = plans.map((plan) => {
    const relatedRecords = plan.requiredRecordIds
      .map((recordId) => recordMap.get(recordId))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const relatedEvents = plan.relatedEventIds
      .map((eventId) => eventMap.get(eventId))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const treatmentStatus = plan.treatmentIds
      .map((treatmentId) => treatmentMap.get(treatmentId)?.taxPositionBucket ?? null)
      .reduce<TinaOwnerFlowBasisAdjudicationStatus>(
        (current, bucket) => maxStatus(current, treatmentEscalationStatus(bucket)),
        "clear"
      );

    const hasMissingCriticalRecord = relatedRecords.some(
      (record) => record.criticality === "critical" && record.status === "missing"
    );
    const hasMissingRecord = relatedRecords.some((record) => record.status === "missing");
    const hasPartialRecord = relatedRecords.some((record) => record.status === "partial");
    const hasBlockedEvent = relatedEvents.some((event) => event.status === "blocked");
    const hasReviewEvent = relatedEvents.some((event) => event.status === "needs_review");
    const hasNoSupport = relatedRecords.length === 0;

    let status: TinaOwnerFlowBasisAdjudicationStatus =
      hasBlockedEvent || hasMissingCriticalRecord || (hasNoSupport && plan.sensitivity === "high")
        ? "blocked"
        : hasReviewEvent || hasPartialRecord || hasMissingRecord
          ? "needs_review"
          : "clear";

    status = maxStatus(status, treatmentStatus);

    const relatedDocumentIds = unique([
      ...relatedRecords.flatMap((record) => record.matchedDocumentIds),
      ...relatedEvents.flatMap((event) => event.relatedDocumentIds),
      ...plan.treatmentIds.flatMap(
        (treatmentId) => treatmentMap.get(treatmentId)?.relatedDocumentIds ?? []
      ),
    ]);
    const relatedFactIds = unique([
      ...relatedRecords.flatMap((record) => record.matchedFactIds),
      ...relatedEvents.flatMap((event) => event.relatedFactIds),
      ...plan.treatmentIds.flatMap(
        (treatmentId) => treatmentMap.get(treatmentId)?.relatedFactIds ?? []
      ),
    ]);

    return buildItem({
      plan,
      status,
      relatedRecordIds: relatedRecords.map((record) => record.id),
      relatedDocumentIds,
      relatedFactIds,
    });
  });

  const blockedItemCount = items.filter((item) => item.status === "blocked").length;
  const reviewItemCount = items.filter((item) => item.status === "needs_review").length;
  const overallStatus =
    blockedItemCount > 0 ? "blocked" : reviewItemCount > 0 ? "review_required" : "clear";
  const openingFootingStatus = combineRollupStatuses(
    items.filter((item) => item.id === "opening-basis-footing")
  );
  const basisRollforwardStatus = combineRollupStatuses(
    items.filter(
      (item) =>
        item.id === "opening-basis-footing" || item.id === "basis-rollforward-continuity"
    )
  );
  const ownerFlowCharacterizationStatus = combineRollupStatuses(
    items.filter((item) => item.id === "owner-flow-characterization")
  );
  const loanEquityStatus = combineRollupStatuses(
    items.filter((item) => item.id === "loan-vs-equity" || item.id === "debt-basis-overlap")
  );
  const distributionTaxabilityStatus = combineRollupStatuses(
    items.filter((item) => item.id === "distribution-taxability")
  );
  const transitionEconomicsStatus = combineRollupStatuses(
    items.filter(
      (item) =>
        item.id === "ownership-change-allocation" || item.id === "buyout-redemption"
    )
  );
  const rollupHighlights = [
    describeRollup("opening footing", openingFootingStatus),
    describeRollup("basis rollforward", basisRollforwardStatus),
    describeRollup("owner-flow characterization", ownerFlowCharacterizationStatus),
    describeRollup("loan-versus-equity posture", loanEquityStatus),
    describeRollup("distribution taxability", distributionTaxabilityStatus),
    describeRollup("transition economics", transitionEconomicsStatus),
  ].filter((value): value is string => Boolean(value));
  const primaryBlockedOrReviewItem =
    items.find((item) => item.status === "blocked") ??
    items.find((item) => item.status === "needs_review") ??
    null;

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId,
    returnFamily: federalReturnRequirements.returnFamily,
    overallStatus,
    openingFootingStatus,
    basisRollforwardStatus,
    ownerFlowCharacterizationStatus,
    loanEquityStatus,
    distributionTaxabilityStatus,
    transitionEconomicsStatus,
    summary:
      overallStatus === "clear"
        ? "Tina has a coherent owner-flow and basis story for the current lane."
        : overallStatus === "review_required"
          ? `Tina still has ${reviewItemCount} owner-flow or basis area${
              reviewItemCount === 1 ? "" : "s"
            } under reviewer control${rollupHighlights.length > 0 ? `, led by ${rollupHighlights.slice(0, 2).join(" and ")}` : ""}.`
          : `Tina still has ${blockedItemCount} blocked owner-flow or basis area${
              blockedItemCount === 1 ? "" : "s"
            }${rollupHighlights.length > 0 ? `, especially ${rollupHighlights.slice(0, 3).join(", ")}` : ""}, that can change treatment, taxability, or allocation materially.`,
    nextStep:
      overallStatus === "clear"
        ? "Carry this owner-flow and basis footing through calculations, package artifacts, and reviewer packaging."
        : overallStatus === "review_required"
          ? primaryBlockedOrReviewItem?.nextStep ??
            "Keep owner-flow and basis-sensitive areas reviewer-controlled while Tina tightens the proof."
          : primaryBlockedOrReviewItem?.nextStep ??
            "Resolve the blocked owner-flow and basis areas before Tina trusts owner-level taxability or allocation-sensitive work.",
    blockedItemCount,
    reviewItemCount,
    items,
  };
}
