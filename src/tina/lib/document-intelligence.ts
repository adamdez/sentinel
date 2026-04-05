import type {
  TinaDocumentIntelligenceExtractConfidence,
  TinaDocumentIntelligenceExtractedFact,
  TinaDocumentIntelligenceExtractKind,
  TinaDocumentIntelligenceExtractSource,
  TinaDocumentIntelligenceItem,
  TinaDocumentIntelligenceRole,
  TinaDocumentIntelligenceSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaEntityContinuitySignalProfileFromText } from "@/tina/lib/entity-continuity-signals";
import { buildTinaPayrollComplianceSignalProfileFromText } from "@/tina/lib/payroll-compliance-signals";
import type { TinaFilingLaneId, TinaStoredDocument, TinaWorkspaceDraft } from "@/tina/types";

const documentIntelligenceCache = new WeakMap<
  TinaWorkspaceDraft,
  TinaDocumentIntelligenceSnapshot
>();

const LANE_PATTERNS: Array<{ laneId: TinaFilingLaneId; pattern: RegExp }> = [
  { laneId: "schedule_c_single_member_llc", pattern: /\bschedule c\b|\b1040\b/i },
  { laneId: "1065", pattern: /\b1065\b|\bpartnership\b|\bk-1\b/i },
  { laneId: "1120_s", pattern: /\b1120-s\b|\b1120s\b|\bform 2553\b|\bs corporation\b|\bs-corp\b/i },
  { laneId: "1120", pattern: /\b1120\b|\bc corporation\b|\bc-corp\b|\bcorporate tax treatment\b/i },
];

type RoleMatchConfig = {
  role: TinaDocumentIntelligenceRole;
  patterns: RegExp[];
  requestIds?: string[];
  categories?: Array<"prior_return" | "supporting_document">;
};

type TinaDocumentContext = {
  document: TinaStoredDocument;
  nameText: string;
  requestText: string;
  detailText: string;
  factText: string;
  combinedText: string;
  relatedFactIds: string[];
};

const ROLE_CONFIGS: RoleMatchConfig[] = [
  {
    role: "prior_return_package",
    patterns: [/\bprior return\b/i, /\bfiled federal return\b/i, /\bschedule c\b/i, /\b1120-s\b|\b1120s\b/i, /\b1065\b/i],
    categories: ["prior_return"],
  },
  {
    role: "entity_election",
    patterns: [/\bform 2553\b/i, /\bentity election\b/i, /\bs corporation\b|\bs-corp\b/i, /\bc corporation\b|\bc-corp\b/i, /\bcorporate election\b/i],
    requestIds: ["entity-election", "formation-papers"],
  },
  {
    role: "formation_document",
    patterns: [/\barticles of organization\b/i, /\barticles of incorporation\b/i, /\bcertificate of organization\b/i, /\bformation papers\b/i, /\bcertificate of formation\b/i],
    requestIds: ["formation-papers"],
  },
  {
    role: "state_registration",
    patterns: [/\bcertificate of authority\b/i, /\bqualified in\b/i, /\bformation state\b/i, /\bqualification state\b/i, /\bnexus\b/i, /\bsales tax permit\b/i, /\bstate account\b/i],
  },
  {
    role: "operating_agreement",
    patterns: [/\boperating agreement\b/i, /\bllc agreement\b/i, /\bmembership agreement\b/i],
    requestIds: ["ownership-agreement", "formation-papers"],
  },
  {
    role: "cap_table",
    patterns: [/\bcap table\b/i, /\bcapitalization table\b/i, /\bunits outstanding\b/i],
  },
  {
    role: "ownership_schedule",
    patterns: [/\bownership schedule\b/i, /\bmember roster\b/i, /\bshareholder roster\b/i, /\bownership split\b/i, /\bmember percentages\b/i],
    requestIds: ["ownership-breakdown"],
  },
  {
    role: "buyout_agreement",
    patterns: [/\bbuyout\b/i, /\bredemption\b/i, /\btransfer agreement\b/i, /\bformer owner\b/i],
  },
  {
    role: "payroll_report",
    patterns: [/\bpayroll register\b/i, /\bpayroll summary\b/i, /\bw-2\b/i, /\bpayroll\b/i],
  },
  {
    role: "asset_ledger",
    patterns: [/\basset rollforward\b/i, /\bfixed asset\b/i, /\bdepreciation\b/i, /\bplaced-in-service\b/i, /\b4562\b/i],
  },
  {
    role: "inventory_count",
    patterns: [/\binventory count\b/i, /\byear-end inventory\b/i, /\bsku\b/i, /\bstock count\b/i],
  },
  {
    role: "inventory_rollforward",
    patterns: [/\bcogs rollforward\b/i, /\bbeginning inventory\b/i, /\bending inventory\b/i, /\bcost of goods\b/i],
  },
  {
    role: "related_party_agreement",
    patterns: [/\brelated-party\b/i, /\brelated party\b/i, /\bintercompany\b/i, /\bmanagement agreement\b/i, /\bfamily management\b/i],
  },
  {
    role: "books_ledger",
    patterns: [/\bgeneral ledger\b/i, /\bledger\b/i, /\btrial balance\b/i, /\bquickbooks\b/i, /\bbookkeeping\b/i],
  },
  {
    role: "bank_statement",
    patterns: [/\bbank statement\b/i, /\bchecking statement\b/i, /\bcard statement\b/i, /\bdeposits\b/i],
  },
  {
    role: "general_support",
    patterns: [/\bagreement\b/i, /\binvoice\b/i, /\bsummary\b/i, /\breport\b/i],
  },
];

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function compact<T>(values: Array<T | null | undefined | false>): T[] {
  return values.filter(Boolean) as T[];
}

function buildDocumentContext(draft: TinaWorkspaceDraft, document: TinaStoredDocument): TinaDocumentContext {
  const reading = draft.documentReadings.find((item) => item.documentId === document.id);
  const facts = draft.sourceFacts.filter((fact) => fact.sourceDocumentId === document.id);
  const nameText = document.name;
  const requestText = document.requestLabel ?? document.requestId ?? "";
  const detailText = reading?.detailLines.join("\n") ?? "";
  const factText = facts.map((fact) => `${fact.label} ${fact.value}`).join("\n");

  return {
    document,
    nameText,
    requestText,
    detailText,
    factText,
    combinedText: [nameText, requestText, detailText, factText].filter(Boolean).join("\n"),
    relatedFactIds: facts.map((fact) => fact.id),
  };
}

function inferLaneIds(text: string): TinaFilingLaneId[] {
  return unique(
    LANE_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.laneId)
  );
}

function roleScore(args: {
  context: TinaDocumentContext;
  config: RoleMatchConfig;
}): number {
  let score = 0;

  if (args.config.requestIds?.includes(args.context.document.requestId ?? "")) {
    score += 2;
  }

  if (args.config.categories?.includes(args.context.document.category)) {
    score += 2;
  }

  const patternHits = args.config.patterns.filter((pattern) =>
    pattern.test(args.context.combinedText)
  ).length;
  score += Math.min(patternHits, 2);

  return score;
}

function parseNumberToken(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[$,%\s]/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceForPattern(context: TinaDocumentContext, pattern: RegExp): TinaDocumentIntelligenceExtractSource {
  if (pattern.test(context.factText)) return "source_fact";
  if (pattern.test(context.detailText)) return "detail_line";
  if (pattern.test(context.requestText)) return "request_metadata";
  return "document_name";
}

function sourceForLabel(
  context: TinaDocumentContext,
  labels: string[]
): TinaDocumentIntelligenceExtractSource {
  const pattern = new RegExp(labels.map(escapeRegExp).join("|"), "i");
  return sourceForPattern(context, pattern);
}

function buildExtract(args: {
  documentId: string;
  kind: TinaDocumentIntelligenceExtractKind;
  source: TinaDocumentIntelligenceExtractSource;
  confidence: TinaDocumentIntelligenceExtractConfidence;
  label: string;
  summary: string;
  valueText?: string | null;
  valueNumber?: number | null;
  laneId?: TinaFilingLaneId | null;
}): TinaDocumentIntelligenceExtractedFact {
  return {
    id: `${args.documentId}-${args.kind}-${args.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind: args.kind,
    source: args.source,
    confidence: args.confidence,
    label: args.label,
    summary: args.summary,
    valueText: args.valueText ?? null,
    valueNumber: args.valueNumber ?? null,
    laneId: args.laneId ?? null,
  };
}

function dedupeExtracts(
  extracts: TinaDocumentIntelligenceExtractedFact[]
): TinaDocumentIntelligenceExtractedFact[] {
  const seen = new Set<string>();
  return extracts.filter((extract) => {
    const key = [
      extract.kind,
      extract.label,
      extract.valueText ?? "",
      extract.valueNumber ?? "",
      extract.laneId ?? "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractNumber(
  text: string,
  patterns: RegExp[]
): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = parseNumberToken(match?.[1]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function buildLaneHintExtracts(args: {
  context: TinaDocumentContext;
  laneIds: TinaFilingLaneId[];
}): TinaDocumentIntelligenceExtractedFact[] {
  return args.laneIds.map((laneId) =>
    buildExtract({
      documentId: args.context.document.id,
      kind: "lane_hint",
      source: "detail_line",
      confidence: "moderate",
      label: "Document lane hint",
      summary: `This paper points toward the ${laneId} federal lane.`,
      valueText: laneId,
      laneId,
    })
  );
}

function buildElectionExtracts(args: {
  context: TinaDocumentContext;
  roles: TinaDocumentIntelligenceRole[];
}): TinaDocumentIntelligenceExtractedFact[] {
  if (!args.roles.includes("entity_election")) return [];
  const extracts: TinaDocumentIntelligenceExtractedFact[] = [];

  if (/\bform 2553\b|\bs corporation\b|\bs-corp\b/i.test(args.context.combinedText)) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "election_signal",
        source: sourceForLabel(args.context, ["form 2553", "s corporation", "s-corp"]),
        confidence: "strong",
        label: "S corporation election signal",
        summary: "Current-year election paperwork points toward S-corporation treatment.",
        valueText: "s_corp",
        laneId: "1120_s",
      })
    );
  }

  if (/\bc corporation\b|\bc-corp\b|\bcorporate tax treatment\b/i.test(args.context.combinedText)) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "election_signal",
        source: sourceForLabel(args.context, ["c corporation", "c-corp", "corporate tax treatment"]),
        confidence: "strong",
        label: "C corporation election signal",
        summary: "Current-year election paperwork points toward C-corporation treatment.",
        valueText: "c_corp",
        laneId: "1120",
      })
    );
  }

  return extracts;
}

function buildIdentityExtracts(args: { context: TinaDocumentContext }): TinaDocumentIntelligenceExtractedFact[] {
  return unique(args.context.combinedText.match(/\b\d{2}-\d{7}\b/g) ?? []).map((ein) =>
    buildExtract({
      documentId: args.context.document.id,
      kind: "identity_signal",
      source: sourceForLabel(args.context, [ein]),
      confidence: "strong",
      label: "Employer identification number",
      summary: "A specific EIN appears in the paper trail.",
      valueText: ein,
    })
  );
}

function buildEntityNameExtracts(args: {
  context: TinaDocumentContext;
  continuityProfile: ReturnType<typeof buildTinaEntityContinuitySignalProfileFromText>;
}): TinaDocumentIntelligenceExtractedFact[] {
  return args.continuityProfile.entityNames.map((entityName) =>
    buildExtract({
      documentId: args.context.document.id,
      kind: "entity_name_signal",
      source: sourceForLabel(args.context, [entityName]),
      confidence: "strong",
      label: "Entity name signal",
      summary: "The paper trail names a specific legal entity.",
      valueText: entityName,
    })
  );
}

function buildPriorFilingExtracts(args: {
  context: TinaDocumentContext;
  roles: TinaDocumentIntelligenceRole[];
  continuityProfile: ReturnType<typeof buildTinaEntityContinuitySignalProfileFromText>;
}): TinaDocumentIntelligenceExtractedFact[] {
  if (
    !args.roles.includes("prior_return_package") &&
    args.continuityProfile.priorFilingLanes.length === 0
  ) {
    return [];
  }

  return args.continuityProfile.priorFilingLanes.map((laneId) =>
    buildExtract({
      documentId: args.context.document.id,
      kind: "prior_filing_signal",
      source: sourceForPattern(
        args.context,
        /\bprior return\b|\bfiled federal return\b|\bschedule c\b|\b1065\b|\b1120-s\b|\b1120s\b|\b1120\b/i
      ),
      confidence: args.roles.includes("prior_return_package") ? "strong" : "moderate",
      label: "Prior filing lane signal",
      summary: `The paper trail preserves prior filing posture for the ${laneId} lane.`,
      valueText: laneId,
      laneId,
    })
  );
}

function buildElectionTimelineExtracts(args: {
  context: TinaDocumentContext;
  continuityProfile: ReturnType<typeof buildTinaEntityContinuitySignalProfileFromText>;
}): TinaDocumentIntelligenceExtractedFact[] {
  if (
    args.continuityProfile.electionLanes.length === 0 &&
    !args.continuityProfile.hasLateElectionSignal &&
    !args.continuityProfile.hasCurrentYearElectionSignal &&
    !args.continuityProfile.hasEntityChangeSignal
  ) {
    return [];
  }

  const label = args.continuityProfile.hasLateElectionSignal
    ? "Late or missing election timing"
    : args.continuityProfile.hasEntityChangeSignal
      ? "Entity transition timing signal"
      : "Current-year election timing";
  const summary = args.continuityProfile.hasLateElectionSignal
    ? "The paper trail suggests a late, missing, or relief-dependent election timeline."
    : args.continuityProfile.hasEntityChangeSignal
      ? "The paper trail suggests the legal or tax posture changed over time."
      : "The paper trail suggests current-year election timing rather than static old history.";
  const lanes =
    args.continuityProfile.electionLanes.length > 0
      ? args.continuityProfile.electionLanes
      : ([null] as Array<TinaFilingLaneId | null>);

  return lanes.map((laneId) =>
    buildExtract({
      documentId: args.context.document.id,
      kind: "election_timeline_signal",
      source: sourceForPattern(
        args.context,
        /\bcurrent(?:-|\s)?year\b|\bthis year\b|\blate\b|\bmissing\b|\brelief\b|\bbecame\b|\bconverted\b|\bchanged structure\b|\b2553\b|\b1120-s\b|\b1120s\b|\bs corp\b|\bs-corp\b|\b1120\b|\bc corp\b|\bc-corp\b/i
      ),
      confidence:
        args.continuityProfile.hasLateElectionSignal || args.continuityProfile.hasEntityChangeSignal
          ? "strong"
          : "moderate",
      label,
      summary,
      valueText:
        laneId ??
        (args.continuityProfile.hasLateElectionSignal
          ? "late_or_missing_election"
          : args.continuityProfile.hasEntityChangeSignal
            ? "entity_transition"
            : "current_year_election"),
      laneId,
    })
  );
}

function buildStateRegistrationExtracts(args: {
  context: TinaDocumentContext;
  roles: TinaDocumentIntelligenceRole[];
  continuityProfile: ReturnType<typeof buildTinaEntityContinuitySignalProfileFromText>;
}): TinaDocumentIntelligenceExtractedFact[] {
  const extracts: TinaDocumentIntelligenceExtractedFact[] = [];

  args.continuityProfile.formationStateMentions.forEach((state) => {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "state_registration_signal",
        source: sourceForLabel(args.context, [state, "formed in", "formation state"]),
        confidence: "moderate",
        label: "Formation-state signal",
        summary: "The paper trail calls out a formation-state posture.",
        valueText: state,
      })
    );
  });

  args.continuityProfile.operatingStateMentions.forEach((state) => {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "state_registration_signal",
        source: sourceForLabel(args.context, [state, "operating in"]),
        confidence: "moderate",
        label: "Operating-state signal",
        summary: "The paper trail calls out a distinct operating-state posture.",
        valueText: state,
      })
    );
  });

  args.continuityProfile.registrationStateMentions.forEach((state) => {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "state_registration_signal",
        source: sourceForLabel(args.context, [state, "qualified in", "registration", "nexus"]),
        confidence: "moderate",
        label: "State-registration signal",
        summary: "The paper trail calls out state registration, qualification, or nexus posture.",
        valueText: state,
      })
    );
  });

  if (
    extracts.length === 0 &&
    (args.roles.includes("state_registration") || args.continuityProfile.hasMultiStateSignal)
  ) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "state_registration_signal",
        source: sourceForPattern(
          args.context,
          /\bformed in one state\b|\boperating in another\b|\bqualification state\b|\bnexus\b|\bsales tax permit\b|\bstate account\b/i
        ),
        confidence: "moderate",
        label: "Multi-state registration pressure",
        summary: "The paper trail suggests state registration and nexus facts can change the filing story.",
        valueText: "multi_state_registration_pressure",
      })
    );
  }

  return extracts;
}

function buildOwnershipExtracts(args: {
  context: TinaDocumentContext;
  roles: TinaDocumentIntelligenceRole[];
}): TinaDocumentIntelligenceExtractedFact[] {
  if (
    !args.roles.some((role) =>
      ["operating_agreement", "cap_table", "ownership_schedule"].includes(role)
    )
  ) {
    return [];
  }

  const extracts: TinaDocumentIntelligenceExtractedFact[] = [];
  const splitMatch =
    args.context.combinedText.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/) ??
    args.context.combinedText.match(/\b(\d{1,3})%\s*(?:and|\/)\s*(\d{1,3})%\b/i);

  if (splitMatch) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "ownership_signal",
        source: sourceForLabel(args.context, [splitMatch[0]]),
        confidence: "moderate",
        label: "Ownership split signal",
        summary: "The paper trail includes an explicit ownership split.",
        valueText: splitMatch[0],
      })
    );
  }

  return extracts;
}

function buildOwnershipTimelineExtracts(args: {
  context: TinaDocumentContext;
  continuityProfile: ReturnType<typeof buildTinaEntityContinuitySignalProfileFromText>;
}): TinaDocumentIntelligenceExtractedFact[] {
  const extracts: TinaDocumentIntelligenceExtractedFact[] = [];

  args.continuityProfile.ownershipSplitTexts.forEach((splitText) => {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "ownership_timeline_signal",
        source: sourceForLabel(args.context, [splitText]),
        confidence: "moderate",
        label: "Ownership split timing signal",
        summary: "The paper trail preserves a specific ownership split that matters for route continuity.",
        valueText: splitText,
      })
    );
  });

  if (args.continuityProfile.hasOwnershipChangeSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "ownership_timeline_signal",
        source: sourceForPattern(
          args.context,
          /\bownership changed\b|\bnew owner\b|\bowner exit\b|\bowner enter\b|\bmidyear\b|\bmid-year\b|\btransfer\b/i
        ),
        confidence: "strong",
        label: "Ownership change timing signal",
        summary: "The paper trail suggests ownership changed during the tax year.",
        valueText: "ownership_change",
      })
    );
  }

  if (args.continuityProfile.hasBuyoutSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "ownership_timeline_signal",
        source: sourceForPattern(args.context, /\bbuyout\b|\bredemption\b/i),
        confidence: "strong",
        label: "Buyout or redemption timing signal",
        summary: "The paper trail suggests a buyout or redemption that can change entity posture and economics.",
        valueText: "buyout_or_redemption",
      })
    );
  }

  if (args.continuityProfile.hasFormerOwnerSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "ownership_timeline_signal",
        source: sourceForPattern(args.context, /\bformer owner\b|\bretired owner\b/i),
        confidence: "strong",
        label: "Former-owner payment timing signal",
        summary: "The paper trail suggests former-owner economics remain live after a transition.",
        valueText: "former_owner_payments",
      })
    );
  }

  return extracts;
}

function buildHomeOfficeExtracts(args: {
  context: TinaDocumentContext;
}): TinaDocumentIntelligenceExtractedFact[] {
  const text = args.context.combinedText;
  const homeOfficeSignal = /\b(home office|office in home|exclusive use|square footage)\b/i.test(text);
  if (!homeOfficeSignal) return [];

  const officeSquareFootage = extractNumber(text, [
    /office square footage[^0-9]{0,16}([\d,.]+)/i,
    /business(?:\s+use)? area[^0-9]{0,16}([\d,.]+)/i,
  ]);
  const homeSquareFootage = extractNumber(text, [
    /home square footage[^0-9]{0,16}([\d,.]+)/i,
    /total area of home[^0-9]{0,16}([\d,.]+)/i,
    /home area[^0-9]{0,16}([\d,.]+)/i,
  ]);
  const businessUsePercentage = extractNumber(text, [
    /business(?:-|\s)?use percentage[^0-9]{0,16}([\d,.]+)/i,
    /([\d,.]+)\s*%[^.\n]{0,24}(?:business use|home office)/i,
  ]);
  const rentAmount = extractNumber(text, [/rent[^0-9$]{0,16}\$?([\d,.]+)/i]);
  const utilitiesAmount = extractNumber(text, [/utilities[^0-9$]{0,16}\$?([\d,.]+)/i]);

  return compact([
    officeSquareFootage !== null
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "home_office_input",
          source: sourceForLabel(args.context, ["office square footage", "business area"]),
          confidence: "strong",
          label: "Office square footage",
          summary: "Structured home-office support includes office area.",
          valueNumber: officeSquareFootage,
        })
      : null,
    homeSquareFootage !== null
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "home_office_input",
          source: sourceForLabel(args.context, ["home square footage", "total area of home", "home area"]),
          confidence: "strong",
          label: "Home square footage",
          summary: "Structured home-office support includes total home area.",
          valueNumber: homeSquareFootage,
        })
      : null,
    businessUsePercentage !== null
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "home_office_input",
          source: sourceForLabel(args.context, ["business-use percentage", "business use", "home office"]),
          confidence: "moderate",
          label: "Business-use percentage",
          summary: "Structured home-office support includes a stated business-use percentage.",
          valueNumber: businessUsePercentage,
        })
      : null,
    rentAmount !== null
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "home_office_input",
          source: sourceForLabel(args.context, ["rent"]),
          confidence: "moderate",
          label: "Rent support amount",
          summary: "Structured home-office support includes rent expense.",
          valueNumber: rentAmount,
        })
      : null,
    utilitiesAmount !== null
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "home_office_input",
          source: sourceForLabel(args.context, ["utilities"]),
          confidence: "moderate",
          label: "Utilities support amount",
          summary: "Structured home-office support includes utilities expense.",
          valueNumber: utilitiesAmount,
        })
      : null,
  ]);
}

function buildAssetExtracts(args: {
  context: TinaDocumentContext;
  roles: TinaDocumentIntelligenceRole[];
}): TinaDocumentIntelligenceExtractedFact[] {
  if (!args.roles.includes("asset_ledger")) return [];

  return compact([
    /\bplaced-in-service\b/i.test(args.context.combinedText)
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "asset_signal",
          source: sourceForLabel(args.context, ["placed-in-service"]),
          confidence: "strong",
          label: "Placed-in-service support",
          summary: "Asset support includes placed-in-service detail.",
        })
      : null,
    /\bprior depreciation\b/i.test(args.context.combinedText)
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "asset_signal",
          source: sourceForLabel(args.context, ["prior depreciation"]),
          confidence: "strong",
          label: "Prior depreciation support",
          summary: "Asset support includes prior depreciation history.",
        })
      : null,
    /\bsection 179\b/i.test(args.context.combinedText)
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "asset_signal",
          source: sourceForLabel(args.context, ["section 179"]),
          confidence: "moderate",
          label: "Section 179 signal",
          summary: "Asset support includes Section 179 treatment clues.",
        })
      : null,
    /\bdepreciation\b/i.test(args.context.combinedText)
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "asset_signal",
          source: sourceForLabel(args.context, ["depreciation"]),
          confidence: "moderate",
          label: "Depreciation support signal",
          summary: "Asset support includes a depreciation-specific signal.",
        })
      : null,
  ]);
}

function buildLaborExtracts(args: {
  context: TinaDocumentContext;
  roles: TinaDocumentIntelligenceRole[];
}): TinaDocumentIntelligenceExtractedFact[] {
  const extracts: TinaDocumentIntelligenceExtractedFact[] = [];
  const payrollSignals = buildTinaPayrollComplianceSignalProfileFromText(
    args.context.combinedText
  );

  if (
    args.roles.includes("payroll_report") ||
    payrollSignals.payrollSignal
  ) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "payroll_signal",
        source: sourceForLabel(args.context, ["payroll register", "officer pay", "w-2", "payroll"]),
        confidence: "strong",
        label: "Payroll register support",
        summary: "The paper trail includes payroll-specific labor support.",
      })
    );
  }

  if (payrollSignals.payrollProviderSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "payroll_provider_signal",
        source: sourceForLabel(args.context, [
          "payroll provider",
          "gusto",
          "adp",
          "paychex",
          "quickbooks payroll",
          "rippling",
        ]),
        confidence: "strong",
        label: "Payroll provider support",
        summary: "The paper trail points to a payroll provider or outsourced payroll operation.",
      })
    );
  }

  if (payrollSignals.manualPayrollSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "manual_payroll_signal",
        source: sourceForLabel(args.context, [
          "manual payroll",
          "paid wages manually",
          "manual paycheck",
          "payroll journal",
        ]),
        confidence: "moderate",
        label: "Manual payroll support",
        summary: "The paper trail points to payroll being run manually instead of through a clear provider trail.",
      })
    );
  }

  if (payrollSignals.quarterlyFilingSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "payroll_quarterly_filing_signal",
        source: sourceForLabel(args.context, [
          "941",
          "quarterly payroll",
          "quarterly filing",
          "quarterly return",
          "q1",
          "q2",
          "q3",
          "q4",
        ]),
        confidence: "strong",
        label: "Quarterly payroll filing support",
        summary: "The paper trail includes quarterly payroll filing clues.",
        valueText:
          payrollSignals.quarterMentions.length > 0
            ? payrollSignals.quarterMentions.join(", ")
            : null,
      })
    );
  }

  if (payrollSignals.annualWageFormSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "payroll_annual_wage_form_signal",
        source: sourceForLabel(args.context, ["w-2", "w-3", "year-end wage"]),
        confidence: "strong",
        label: "Annual wage-form support",
        summary: "The paper trail includes year-end wage-form clues.",
      })
    );
  }

  if (payrollSignals.depositSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "payroll_deposit_signal",
        source: sourceForLabel(args.context, [
          "deposit schedule",
          "payroll deposit",
          "eftps",
          "withholding deposit",
        ]),
        confidence: "moderate",
        label: "Payroll deposit support",
        summary: "The paper trail includes payroll-deposit clues.",
      })
    );
  }

  if (payrollSignals.missedComplianceSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "payroll_compliance_gap_signal",
        source: sourceForLabel(args.context, [
          "late deposit",
          "missed deposit",
          "missing payroll filing",
          "not filed",
          "broken compliance trail",
        ]),
        confidence: "strong",
        label: "Payroll compliance gap signal",
        summary: "The paper trail suggests payroll happened, but the compliance trail is incomplete or broken.",
      })
    );
  }

  if (payrollSignals.ownerCompSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "owner_comp_signal",
        source: sourceForLabel(args.context, [
          "officer pay",
          "shareholder salary",
          "owner compensation",
          "reasonable compensation",
        ]),
        confidence: "moderate",
        label: "Owner compensation signal",
        summary: "The paper trail includes owner or officer compensation clues.",
      })
    );
  }

  if (payrollSignals.contractorSignal) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "contractor_signal",
        source: sourceForLabel(args.context, ["1099", "subcontractor", "contract labor"]),
        confidence: "strong",
        label: "Contractor labor support",
        summary: "The paper trail includes contractor or 1099 labor support.",
      })
    );
  }

  return extracts;
}

function buildInventoryExtracts(args: {
  context: TinaDocumentContext;
  roles: TinaDocumentIntelligenceRole[];
}): TinaDocumentIntelligenceExtractedFact[] {
  const extracts: TinaDocumentIntelligenceExtractedFact[] = [];

  if (
    args.roles.includes("inventory_count") ||
    /\binventory count\b|\byear-end inventory\b|\bsku\b|\bshrinkage\b/i.test(args.context.combinedText)
  ) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "inventory_signal",
        source: sourceForLabel(args.context, ["inventory count", "year-end inventory", "sku", "shrinkage"]),
        confidence: "strong",
        label: "Inventory count support",
        summary: "The paper trail includes inventory-count style support.",
      })
    );
  }

  if (
    args.roles.includes("inventory_rollforward") ||
    /\bcogs rollforward\b|\bbeginning inventory\b|\bending inventory\b/i.test(args.context.combinedText)
  ) {
    extracts.push(
      buildExtract({
        documentId: args.context.document.id,
        kind: "inventory_signal",
        source: sourceForLabel(args.context, ["cogs rollforward", "beginning inventory", "ending inventory"]),
        confidence: "strong",
        label: "COGS rollforward support",
        summary: "The paper trail includes inventory rollforward support.",
      })
    );
  }

  return extracts;
}

function buildRelatedPartyExtracts(args: {
  context: TinaDocumentContext;
  roles: TinaDocumentIntelligenceRole[];
}): TinaDocumentIntelligenceExtractedFact[] {
  if (
    !args.roles.includes("related_party_agreement") &&
    !/\brelated-party\b|\brelated party\b|\bintercompany\b|\bfamily management\b|\bdue-to owner\b/i.test(
      args.context.combinedText
    )
  ) {
    return [];
  }

  return compact([
    /\brelated-party\b|\brelated party\b|\bfamily management\b/i.test(args.context.combinedText)
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "related_party_signal",
          source: sourceForLabel(args.context, ["related-party", "related party", "family management"]),
          confidence: "strong",
          label: "Related-party agreement signal",
          summary: "The paper trail includes related-party agreement or charge language.",
        })
      : null,
    /\bintercompany\b|\bdue-to owner\b/i.test(args.context.combinedText)
      ? buildExtract({
          documentId: args.context.document.id,
          kind: "related_party_signal",
          source: sourceForLabel(args.context, ["intercompany", "due-to owner"]),
          confidence: "strong",
          label: "Intercompany transfer signal",
          summary: "The paper trail includes intercompany or due-to-owner flow language.",
        })
      : null,
  ]);
}

function inferStructuredTruths(args: {
  roles: TinaDocumentIntelligenceRole[];
  laneIds: TinaFilingLaneId[];
  extractedFacts: TinaDocumentIntelligenceExtractedFact[];
}): string[] {
  const truths = args.roles.flatMap((role) => {
    switch (role) {
      case "prior_return_package":
        return ["Prior federal return history is present in the paper trail."];
      case "entity_election":
        return ["Current entity-election paperwork is present in the paper trail."];
      case "formation_document":
        return ["Formation or conversion paperwork is present in the paper trail."];
      case "state_registration":
        return ["State registration, qualification, or nexus paperwork is present in the paper trail."];
      case "operating_agreement":
        return ["Operating-agreement language is present for ownership/economics review."];
      case "cap_table":
        return ["A cap-table style ownership record is present."];
      case "ownership_schedule":
        return ["An ownership roster or split schedule is present."];
      case "buyout_agreement":
        return ["Buyout, redemption, or ownership-transfer paperwork is present."];
      case "payroll_report":
        return ["Payroll support is present beyond general bookkeeping clues."];
      case "asset_ledger":
        return ["Asset-history support is present beyond a raw depreciation clue."];
      case "inventory_count":
        return ["Inventory-count support is present beyond ordinary expense labels."];
      case "inventory_rollforward":
        return ["COGS or inventory rollforward support is present."];
      case "related_party_agreement":
        return ["Related-party or intercompany agreement language is present."];
      case "books_ledger":
        return ["A books-ledger style artifact is present."];
      case "bank_statement":
        return ["A bank/card statement style artifact is present."];
      case "general_support":
        return ["A general support paper is present but not deeply classified yet."];
      case "unknown":
        return [];
    }
  });

  args.laneIds.forEach((laneId) => {
    truths.push(`This paper trail carries a ${laneId} lane hint.`);
  });

  if (args.extractedFacts.some((fact) => fact.kind === "election_signal")) {
    truths.push("Extracted election facts are available for route and continuity judgment.");
  }
  if (args.extractedFacts.some((fact) => fact.kind === "prior_filing_signal")) {
    truths.push("Prior filing posture is structured enough to compare against current-year route signals.");
  }
  if (args.extractedFacts.some((fact) => fact.kind === "election_timeline_signal")) {
    truths.push("Election timing or entity-transition facts are structured enough to drive continuity checks.");
  }
  if (args.extractedFacts.some((fact) => fact.kind === "ownership_timeline_signal")) {
    truths.push("Ownership continuity facts are structured enough to drive route and economics review.");
  }
  if (args.extractedFacts.some((fact) => fact.kind === "state_registration_signal")) {
    truths.push("State registration and nexus clues are structured enough to keep federal versus state posture honest.");
  }
  if (args.extractedFacts.some((fact) => fact.kind === "entity_name_signal")) {
    truths.push("The paper trail exposes named legal-entity identity instead of only generic labels.");
  }
  if (args.extractedFacts.some((fact) => fact.kind === "home_office_input")) {
    truths.push("Home-office input facts are structured enough to reuse downstream.");
  }
  if (args.extractedFacts.some((fact) => fact.kind === "asset_signal")) {
    truths.push("Asset-history support includes more than a raw depreciation clue.");
  }

  return unique(truths);
}

function buildItem(item: TinaDocumentIntelligenceItem): TinaDocumentIntelligenceItem {
  return {
    ...item,
    roles: unique(item.roles),
    structuredTruths: unique(item.structuredTruths),
    relatedLaneIds: unique(item.relatedLaneIds),
    relatedFactIds: unique(item.relatedFactIds),
    extractedFacts: dedupeExtracts(item.extractedFacts),
  };
}

function hasRelatedPartySignals(draft: TinaWorkspaceDraft): boolean {
  return (
    /related-party|related party|intercompany/i.test(draft.profile.notes ?? "") ||
    draft.sourceFacts.some((fact) =>
      /related-party|related party|intercompany|family management/i.test(
        `${fact.label} ${fact.value}`
      )
    )
  );
}

function missingCriticalRoles(
  draft: TinaWorkspaceDraft,
  items: TinaDocumentIntelligenceItem[]
): string[] {
  const strongOrPartialRoles = new Set(
    items
      .filter((item) => item.status !== "signal_only")
      .flatMap((item) => item.roles)
  );
  const missing: string[] = [];

  if (
    (draft.profile.taxElection === "s_corp" || draft.profile.taxElection === "c_corp") &&
    !strongOrPartialRoles.has("entity_election")
  ) {
    missing.push("entity election papers");
  }

  if (
    ((draft.profile.ownerCount ?? 1) > 1 ||
      draft.profile.hasOwnerBuyoutOrRedemption ||
      draft.profile.hasFormerOwnerPayments) &&
    !(
      strongOrPartialRoles.has("operating_agreement") ||
      strongOrPartialRoles.has("cap_table") ||
      strongOrPartialRoles.has("ownership_schedule")
    )
  ) {
    missing.push("ownership roster or agreement papers");
  }

  if (draft.profile.hasPayroll && !strongOrPartialRoles.has("payroll_report")) {
    missing.push("payroll reports");
  }

  if (draft.profile.hasFixedAssets && !strongOrPartialRoles.has("asset_ledger")) {
    missing.push("asset rollforward or depreciation support");
  }

  if (
    draft.profile.hasInventory &&
    !(
      strongOrPartialRoles.has("inventory_count") ||
      strongOrPartialRoles.has("inventory_rollforward")
    )
  ) {
    missing.push("inventory count or COGS rollforward support");
  }

  if (hasRelatedPartySignals(draft) && !strongOrPartialRoles.has("related_party_agreement")) {
    missing.push("related-party agreement support");
  }

  const continuityProfile = buildTinaEntityContinuitySignalProfileFromText(
    [
      draft.profile.notes ?? "",
      ...draft.documents.map(
        (document) => `${document.name} ${document.requestLabel ?? ""} ${document.requestId ?? ""}`
      ),
      ...draft.documentReadings.flatMap((reading) => reading.detailLines),
      ...draft.sourceFacts.map((fact) => `${fact.label} ${fact.value}`),
    ].join("\n")
  );

  if (
    (continuityProfile.hasEntityChangeSignal ||
      continuityProfile.hasCurrentYearElectionSignal ||
      draft.profile.taxElection === "s_corp" ||
      draft.profile.taxElection === "c_corp") &&
    !(strongOrPartialRoles.has("entity_election") || strongOrPartialRoles.has("formation_document"))
  ) {
    missing.push("formation, conversion, or election papers");
  }

  if (
    continuityProfile.hasMultiStateSignal &&
    !strongOrPartialRoles.has("state_registration")
  ) {
    missing.push("state registration and nexus papers");
  }

  if (
    (continuityProfile.hasOwnershipChangeSignal ||
      continuityProfile.hasBuyoutSignal ||
      continuityProfile.hasFormerOwnerSignal) &&
    !(strongOrPartialRoles.has("buyout_agreement") || strongOrPartialRoles.has("ownership_schedule"))
  ) {
    missing.push("ownership-transfer or buyout papers");
  }

  return unique(missing);
}

function inferExtractedFacts(args: {
  context: TinaDocumentContext;
  roles: TinaDocumentIntelligenceRole[];
  laneIds: TinaFilingLaneId[];
}): TinaDocumentIntelligenceExtractedFact[] {
  const continuityProfile = buildTinaEntityContinuitySignalProfileFromText(
    args.context.combinedText
  );

  return dedupeExtracts([
    ...buildLaneHintExtracts({ context: args.context, laneIds: args.laneIds }),
    ...buildEntityNameExtracts({ context: args.context, continuityProfile }),
    ...buildElectionExtracts({ context: args.context, roles: args.roles }),
    ...buildPriorFilingExtracts({ context: args.context, roles: args.roles, continuityProfile }),
    ...buildElectionTimelineExtracts({ context: args.context, continuityProfile }),
    ...buildIdentityExtracts({ context: args.context }),
    ...buildOwnershipExtracts({ context: args.context, roles: args.roles }),
    ...buildOwnershipTimelineExtracts({ context: args.context, continuityProfile }),
    ...buildStateRegistrationExtracts({ context: args.context, roles: args.roles, continuityProfile }),
    ...buildHomeOfficeExtracts({ context: args.context }),
    ...buildAssetExtracts({ context: args.context, roles: args.roles }),
    ...buildLaborExtracts({ context: args.context, roles: args.roles }),
    ...buildInventoryExtracts({ context: args.context, roles: args.roles }),
    ...buildRelatedPartyExtracts({ context: args.context, roles: args.roles }),
  ]);
}

export function listTinaDocumentIntelligenceExtractedFacts(
  snapshot: TinaDocumentIntelligenceSnapshot
): TinaDocumentIntelligenceExtractedFact[] {
  return dedupeExtracts(snapshot.items.flatMap((item) => item.extractedFacts));
}

export function countTinaDocumentIntelligenceExtracts(args: {
  snapshot: TinaDocumentIntelligenceSnapshot;
  kind?: TinaDocumentIntelligenceExtractKind;
  label?: string;
}): number {
  return listTinaDocumentIntelligenceExtractedFacts(args.snapshot).filter((extract) => {
    if (args.kind && extract.kind !== args.kind) return false;
    if (args.label && extract.label !== args.label) return false;
    return true;
  }).length;
}

export function findTinaDocumentIntelligenceNumericFact(args: {
  snapshot: TinaDocumentIntelligenceSnapshot;
  label?: string;
  labels?: string[];
}): number | null {
  const labels = compact([args.label, ...(args.labels ?? [])]);
  return (
    listTinaDocumentIntelligenceExtractedFacts(args.snapshot).find(
      (extract) =>
        labels.includes(extract.label) && typeof extract.valueNumber === "number"
    )?.valueNumber ?? null
  );
}

export function listTinaDocumentIntelligenceFactsByKind(args: {
  snapshot: TinaDocumentIntelligenceSnapshot;
  kind: TinaDocumentIntelligenceExtractKind;
}): TinaDocumentIntelligenceExtractedFact[] {
  return listTinaDocumentIntelligenceExtractedFacts(args.snapshot).filter(
    (extract) => extract.kind === args.kind
  );
}

export function listTinaDocumentIntelligenceDistinctValues(args: {
  snapshot: TinaDocumentIntelligenceSnapshot;
  kind: TinaDocumentIntelligenceExtractKind;
  label?: string;
}): string[] {
  return unique(
    listTinaDocumentIntelligenceExtractedFacts(args.snapshot)
      .filter((extract) => extract.kind === args.kind)
      .filter((extract) => (args.label ? extract.label === args.label : true))
      .map((extract) => extract.valueText)
      .filter((value): value is string => Boolean(value))
  );
}

export function buildTinaDocumentIntelligence(
  draft: TinaWorkspaceDraft
): TinaDocumentIntelligenceSnapshot {
  const cached = documentIntelligenceCache.get(draft);
  if (cached) {
    return cached;
  }

  const items = draft.documents.map((document) => {
    const context = buildDocumentContext(draft, document);
    const laneIds = inferLaneIds(context.combinedText);
    const roleMatches = ROLE_CONFIGS.map((config) => ({
      role: config.role,
      score: roleScore({
        context,
        config,
      }),
    })).filter((match) => match.score > 0);
    const maxScore = Math.max(0, ...roleMatches.map((match) => match.score));
    const roles =
      roleMatches.length > 0
        ? roleMatches
            .filter((match) => match.score >= Math.max(1, maxScore - 1))
            .map((match) => match.role)
        : (["unknown"] as TinaDocumentIntelligenceRole[]);
    const status: TinaDocumentIntelligenceItem["status"] =
      maxScore >= 3 ? "strong" : maxScore >= 2 ? "partial" : "signal_only";
    const extractedFacts = inferExtractedFacts({ context, roles, laneIds });
    const structuredTruths = inferStructuredTruths({ roles, laneIds, extractedFacts });

    return buildItem({
      id: `document-intelligence-${document.id}`,
      documentId: document.id,
      title: document.name,
      roles,
      status,
      summary:
        status === "strong"
          ? `${document.name} is acting like a strongly classified tax artifact with reusable extracted facts.`
          : status === "partial"
            ? `${document.name} is partially classified and already yielding extracted facts Tina can reuse.`
            : `${document.name} is still mostly a surface clue, not a deeply classified artifact yet.`,
      structuredTruths,
      relatedLaneIds: laneIds,
      relatedFactIds: context.relatedFactIds,
      extractedFacts,
    });
  });

  const structuredDocumentCount = items.filter((item) => item.status !== "signal_only").length;
  const extractedFactCount = items.reduce((total, item) => total + item.extractedFacts.length, 0);
  const extractedFacts = items.flatMap((item) => item.extractedFacts);
  const strongLaneHints = items
    .filter((item) => item.status === "strong")
    .flatMap((item) => item.relatedLaneIds);
  const laneConflict =
    unique(strongLaneHints).filter((laneId) => laneId !== "unknown").length > 1 ? 1 : 0;
  const priorReturnLanes = unique(
    extractedFacts
      .filter((fact) => fact.kind === "prior_filing_signal")
      .map((fact) => fact.laneId ?? fact.valueText ?? "")
      .filter(Boolean)
  ) as TinaFilingLaneId[];
  const extractedElectionLanes = unique(
    extractedFacts
      .filter(
        (fact) =>
          (fact.kind === "election_signal" || fact.kind === "election_timeline_signal") &&
          Boolean(fact.laneId)
      )
      .map((fact) => fact.laneId as TinaFilingLaneId)
  );
  const crossYearConflict =
    priorReturnLanes.length > 0 &&
    extractedElectionLanes.length > 0 &&
    extractedElectionLanes.some((laneId) => !priorReturnLanes.includes(laneId))
      ? 1
      : 0;
  const entityNameValues = unique(
    extractedFacts
      .filter((fact) => fact.kind === "entity_name_signal")
      .map((fact) => fact.valueText ?? "")
      .filter(Boolean)
  );
  const distinctEinValues = unique(
    extractedFacts
      .filter(
        (fact) =>
          fact.kind === "identity_signal" && fact.label === "Employer identification number"
      )
      .map((fact) => fact.valueText ?? "")
      .filter(Boolean)
  );
  const priorFilingSignalCount = extractedFacts.filter(
    (fact) => fact.kind === "prior_filing_signal"
  ).length;
  const electionTimelineSignalCount = extractedFacts.filter(
    (fact) => fact.kind === "election_timeline_signal"
  ).length;
  const ownershipTimelineSignalCount = extractedFacts.filter(
    (fact) => fact.kind === "ownership_timeline_signal"
  ).length;
  const stateRegistrationSignalCount = extractedFacts.filter(
    (fact) => fact.kind === "state_registration_signal"
  ).length;
  const identityConflictCount =
    (distinctEinValues.length > 1 ? 1 : 0) + (entityNameValues.length > 1 ? 1 : 0);
  const continuityConflictCount =
    crossYearConflict +
    (ownershipTimelineSignalCount > 0 &&
    draft.profile.ownerCount === 1 &&
    draft.profile.spouseCommunityPropertyTreatment !== "confirmed"
      ? 1
      : 0);
  const conflictCount = laneConflict + identityConflictCount + continuityConflictCount;
  const missingRoles = missingCriticalRoles(draft, items);
  const continuityQuestions = unique(
    [
      distinctEinValues.length > 1
        ? `Which EIN belongs to the current filing entity: ${distinctEinValues.join(", ")}?`
        : "",
      entityNameValues.length > 1
        ? `Which legal entity name belongs to the current-year return: ${entityNameValues.join(", ")}?`
        : "",
      crossYearConflict > 0
        ? "Which prior filing posture is stale versus current, and what is the exact election or conversion effective date?"
        : "",
      electionTimelineSignalCount > 0
        ? "What is the exact election, conversion, or transition date that governs the current tax year?"
        : "",
      ownershipTimelineSignalCount > 0
        ? "Who owned the entity at opening and closing, and what transfers, buyouts, or former-owner payments happened during the year?"
        : "",
      stateRegistrationSignalCount > 0
        ? "Which state is formation versus qualification versus actual operations, and which state accounts are tied to the filing entity?"
        : "",
    ].filter(Boolean)
  ).slice(0, 6);
  const snapshot: TinaDocumentIntelligenceSnapshot = {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus:
      conflictCount > 0 ? "conflicted" : structuredDocumentCount > 0 ? "structured" : "surface_only",
    summary:
      conflictCount > 0
        ? "Tina sees structured document truth, extracted facts, and an identity or continuity conflict that still needs resolution."
        : structuredDocumentCount > 0
          ? "Tina can already classify several papers into real tax artifacts, extract reusable facts, and preserve route continuity clues."
          : "Tina is still mostly looking at surface document clues rather than deeply classified tax artifacts.",
    nextStep:
      missingRoles.length > 0
        ? `Strengthen the paper trail with: ${missingRoles.slice(0, 3).join("; ")}.`
      : conflictCount > 0
          ? "Resolve the conflicting entity identity, filing continuity, or ownership-timeline story before Tina widens route or treatment confidence."
          : "Keep turning newly uploaded papers into structured tax artifacts and continuity facts so route and treatment engines can trust them faster.",
    structuredDocumentCount,
    extractedFactCount,
    conflictCount,
    identityConflictCount,
    continuityConflictCount,
    missingCriticalRoleCount: missingRoles.length,
    entityNameCount: entityNameValues.length,
    distinctEinCount: distinctEinValues.length,
    priorFilingSignalCount,
    electionTimelineSignalCount,
    ownershipTimelineSignalCount,
    stateRegistrationSignalCount,
    missingCriticalRoles: missingRoles,
    continuityQuestions,
    items,
  };

  documentIntelligenceCache.set(draft, snapshot);
  return snapshot;
}
