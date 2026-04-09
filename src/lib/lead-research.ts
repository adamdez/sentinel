import { createServerClient } from "@/lib/supabase";
import { analyzeWithOpenAIReasoning } from "@/lib/executive-reasoning-client";
import {
  buildDeepSkipResult,
  fanOutAgents,
  isOpenClawConfigured,
  type AgentFinding,
  type AgentResult,
  type DeepSkipPerson,
  type DeepSkipResult,
} from "@/lib/openclaw-client";
import { buildAgentPlan, buildPropertyContext } from "@/lib/openclaw-orchestrator";
import { runLegalSearch, type LegalSearchInput, type NormalizedDocument } from "@/lib/county-legal-search";
import type {
  NextOfKinCandidate,
  PeopleIntelHighlight,
  UnifiedResearchMetadata,
  UnifiedResearchStatusResponse,
} from "@/lib/research-run-types";

const DEFAULT_RESEARCH_MODEL = "gpt-5-mini";
const ESCALATED_RESEARCH_MODEL = "gpt-5.4";
const MAX_FACTS = 4;

interface LeadRow {
  id: string;
  property_id: string | null;
}

interface PropertyRow {
  id: string;
  owner_name: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zip: string | null;
  apn: string | null;
  owner_flags: Record<string, unknown> | null;
  estimated_value: number | null;
  equity_percent: number | null;
}

interface DistressEventRow {
  event_type: string;
}

interface RunRow {
  id: string;
  status: string;
  started_at: string;
  closed_at: string | null;
  artifact_count: number;
  fact_count: number;
  source_mix: string[] | null;
}

interface DossierRow {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  raw_ai_output: Record<string, unknown> | null;
}

interface PersistedLegalSearchResult {
  supported: boolean;
  status: "completed" | "partial" | "unsupported";
  county: string | null;
  documents: NormalizedDocument[];
  documentsFound: number;
  documentsInserted: number;
  courtCasesFound: number;
  errors: string[];
  nextUpcomingEvent: {
    date: string | null;
    type: string | null;
    caseNumber: string | null;
    description: string | null;
  } | null;
}

interface SynthesisResult {
  situation_summary: string;
  likely_decision_maker: string | null;
  recommended_call_angle: string | null;
  top_facts: Array<{ fact: string; source: string; confidence?: string }>;
  verification_checklist: Array<{ item: string; verified: boolean }>;
}

interface RunLeadResearchOptions {
  leadId: string;
  startedBy: string;
  force?: boolean;
  model?: string;
}

interface RunLeadResearchResult extends UnifiedResearchStatusResponse {
  metadata: UnifiedResearchMetadata;
}

function compact(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function isSupportedLegalCounty(county: string | null | undefined): boolean {
  return /spokane/i.test(county ?? "");
}

function severityForFinding(finding: AgentFinding): string | undefined {
  if (finding.confidence >= 0.85) return "high";
  if (finding.confidence >= 0.6) return "medium";
  return "low";
}

function sourceTypeForFinding(finding: AgentFinding): string {
  switch (finding.category) {
    case "court_record":
      return "court_record";
    case "obituary":
      return "obituary";
    case "social_media":
    case "employment":
      return "social_media";
    case "county_record":
      return "assessor";
    case "financial":
      return "court_record";
    case "heir":
      return "obituary";
    default:
      return "other";
  }
}

function truncateText(value: string, max = 240): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

function toPeopleIntelHighlight(finding: AgentFinding): PeopleIntelHighlight {
  return {
    summary: finding.finding,
    source: finding.source,
    confidence: finding.confidence,
    category: finding.category,
    url: finding.url,
    date: finding.date,
  };
}

function isHardRecordFinding(finding: AgentFinding): boolean {
  return ["court_record", "financial", "county_record"].includes(finding.category);
}

export function summarizeResearchSignals(args: {
  legalDocumentsFound: number;
  agentFindings: AgentFinding[];
}): {
  confirmedLegalRecords: number;
  corroboratingHardRecordFindings: number;
} {
  return {
    confirmedLegalRecords: args.legalDocumentsFound,
    corroboratingHardRecordFindings: args.agentFindings.filter(isHardRecordFinding).length,
  };
}

export function extractNextOfKinCandidates(people: DeepSkipPerson[]): NextOfKinCandidate[] {
  const kinRoles = new Set(["heir", "executor", "spouse", "family", "attorney"]);
  return people
    .filter((person) => kinRoles.has(person.role))
    .sort((a, b) => b.confidence - a.confidence)
    .map((person) => ({
      name: person.name,
      role: person.role,
      summary: person.notes,
      source: person.source,
      confidence: person.confidence,
      phones: person.phones,
      emails: person.emails,
    }));
}

function buildFallbackSynthesis(args: {
  property: PropertyRow;
  legal: PersistedLegalSearchResult;
  agentFindings: AgentFinding[];
  nextOfKin: NextOfKinCandidate[];
}): SynthesisResult {
  const ownerName = compact(args.property.owner_name) || "the owner";
  const signalSummary = summarizeResearchSignals({
    legalDocumentsFound: args.legal.documentsFound,
    agentFindings: args.agentFindings,
  });
  const prioritizedFindings = [...args.agentFindings].sort((left, right) => {
    const hardRecordDelta = Number(isHardRecordFinding(right)) - Number(isHardRecordFinding(left));
    if (hardRecordDelta !== 0) return hardRecordDelta;
    return right.confidence - left.confidence;
  });
  const signalText = signalSummary.confirmedLegalRecords > 0
    ? `${signalSummary.confirmedLegalRecords} legal record${signalSummary.confirmedLegalRecords === 1 ? "" : "s"} found`
    : signalSummary.corroboratingHardRecordFindings > 0
      ? `${signalSummary.corroboratingHardRecordFindings} corroborating hard-record signal${signalSummary.corroboratingHardRecordFindings === 1 ? "" : "s"} surfaced, but no normalized legal documents were confirmed`
      : "no legal records confirmed in the supported county sources";
  const kinSummary = args.nextOfKin[0]
    ? `${args.nextOfKin[0].name} appears relevant as ${args.nextOfKin[0].role}.`
    : "No confirmed next-of-kin contact was found yet.";
  const topFacts = [
    ...prioritizedFindings.slice(0, 2).map((finding) => ({
      fact: truncateText(finding.finding, 140),
      source: finding.source,
      confidence: severityForFinding(finding),
    })),
    ...args.legal.documents.slice(0, 2).map((doc) => ({
      fact: truncateText(doc.eventDescription || `${doc.documentType} ${doc.caseNumber ?? doc.instrumentNumber ?? ""}`.trim(), 140),
      source: doc.source,
      confidence: "medium",
    })),
  ].slice(0, MAX_FACTS);

  const verification = [
    { item: "Review people-intel evidence before promoting any soft-signal claims.", verified: false },
    ...(args.legal.status === "unsupported"
      ? [{ item: `Legal county adapter is not supported yet for ${compact(args.property.county) || "this county"}.`, verified: false }]
      : []),
    ...(args.nextOfKin.length > 0
      ? [{ item: `Confirm next-of-kin relevance for ${args.nextOfKin[0].name} before outreach.`, verified: false }]
      : []),
  ].slice(0, 4);

  return {
    situation_summary: `${ownerName} research run completed with ${signalText}. ${kinSummary}`,
    likely_decision_maker: args.nextOfKin[0]?.name ?? (compact(args.property.owner_name) || null),
    recommended_call_angle: args.nextOfKin.length > 0
      ? `Lead with empathy, confirm whether ${args.nextOfKin[0].name} is handling decisions, and verify probate or estate authority before discussing an offer.`
      : `Lead with a concise property-specific opener, confirm who controls the sale decision, and validate the most relevant distress signals before moving into motivation.`,
    top_facts: topFacts,
    verification_checklist: verification,
  };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

async function synthesizeResearchBrief(args: {
  property: PropertyRow;
  legal: PersistedLegalSearchResult;
  agentFindings: AgentFinding[];
  nextOfKin: NextOfKinCandidate[];
  model: string;
}): Promise<{ brief: SynthesisResult; provider: "openai" | "fallback"; model: string }> {
  const fallback = buildFallbackSynthesis(args);

  if (!process.env.OPENAI_API_KEY) {
    return { brief: fallback, provider: "fallback", model: "fallback" };
  }

  const prompt = [
    "Create a concise operator research brief for a motivated-seller acquisitions CRM.",
    "Return valid JSON only.",
    "",
    "Property Context:",
    JSON.stringify({
      owner_name: args.property.owner_name,
      address: args.property.address,
      city: args.property.city,
      county: args.property.county,
      apn: args.property.apn,
      estimated_value: args.property.estimated_value,
      equity_percent: args.property.equity_percent,
    }),
    "",
    "Legal Summary:",
    JSON.stringify({
      supported: args.legal.supported,
      status: args.legal.status,
      documents_found: args.legal.documentsFound,
      court_cases_found: args.legal.courtCasesFound,
      next_upcoming_event: args.legal.nextUpcomingEvent,
      sample_documents: args.legal.documents.slice(0, 6).map((doc) => ({
        type: doc.documentType,
        status: doc.status,
        source: doc.source,
        case_number: doc.caseNumber,
        event: doc.eventDescription,
        amount: doc.amount,
      })),
    }),
    "",
    "People Intel Findings:",
    JSON.stringify(args.agentFindings.slice(0, 12).map((finding) => ({
      category: finding.category,
      source: finding.source,
      confidence: finding.confidence,
      finding: finding.finding,
      date: finding.date,
    }))),
    "",
    "Next Of Kin / Estate Contacts:",
    JSON.stringify(args.nextOfKin.slice(0, 6)),
    "",
    "Return JSON matching this shape:",
    JSON.stringify({
      situation_summary: "string",
      likely_decision_maker: "string | null",
      recommended_call_angle: "string | null",
      top_facts: [{ fact: "string", source: "string", confidence: "high|medium|low" }],
      verification_checklist: [{ item: "string", verified: false }],
    }),
    "",
    "Rules:",
    "- Keep the situation summary to 2-4 short bullet-style sentences worth of content.",
    "- Keep top_facts to at most 4 items.",
    "- If probate, obituary, or deceased-owner signals exist, prioritize executor/heir decision-maker guidance.",
    "- Treat social media, news, and obituary claims as review-needed evidence, not certain truth.",
    "- Verification checklist should emphasize anything that still needs human confirmation.",
  ].join("\n");

  try {
    const raw = await analyzeWithOpenAIReasoning({
      systemPrompt: "You are Sentinel's acquisitions research summarizer. Produce concise, evidence-aware JSON. Never wrap JSON in markdown.",
      prompt,
      model: args.model,
      temperature: 0.1,
      maxTokens: 1400,
      generationName: "unified_research_brief",
    });
    const parsed = extractJsonObject(raw);
    if (!parsed) {
      return { brief: fallback, provider: "fallback", model: "fallback" };
    }

    const topFactsRaw = Array.isArray(parsed.top_facts) ? parsed.top_facts : [];
    const checklistRaw = Array.isArray(parsed.verification_checklist) ? parsed.verification_checklist : [];

    return {
      provider: "openai",
      model: args.model,
      brief: {
        situation_summary: typeof parsed.situation_summary === "string" ? parsed.situation_summary : fallback.situation_summary,
        likely_decision_maker: typeof parsed.likely_decision_maker === "string"
          ? parsed.likely_decision_maker
          : fallback.likely_decision_maker,
        recommended_call_angle: typeof parsed.recommended_call_angle === "string"
          ? parsed.recommended_call_angle
          : fallback.recommended_call_angle,
        top_facts: topFactsRaw
          .map((item) => {
            const row = item as Record<string, unknown>;
            if (typeof row.fact !== "string" || !row.fact.trim()) return null;
            return {
              fact: row.fact.trim(),
              source: typeof row.source === "string" ? row.source : "research_run",
              confidence: typeof row.confidence === "string" ? row.confidence : undefined,
            };
          })
          .filter(Boolean)
          .slice(0, MAX_FACTS) as SynthesisResult["top_facts"],
        verification_checklist: checklistRaw
          .map((item) => {
            const row = item as Record<string, unknown>;
            if (typeof row.item !== "string" || !row.item.trim()) return null;
            return {
              item: row.item.trim(),
              verified: false,
            };
          })
          .filter(Boolean)
          .slice(0, 4) as SynthesisResult["verification_checklist"],
      },
    };
  } catch {
    return { brief: fallback, provider: "fallback", model: "fallback" };
  }
}

async function fetchLeadAndProperty(leadId: string): Promise<{ lead: LeadRow; property: PropertyRow }> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadError } = await (sb.from("leads") as any)
    .select("id, property_id")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    throw new Error("Lead not found");
  }
  if (!lead.property_id) {
    throw new Error("Lead has no property attached");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: property, error: propertyError } = await (sb.from("properties") as any)
    .select("id, owner_name, address, city, county, state, zip, apn, owner_flags, estimated_value, equity_percent")
    .eq("id", lead.property_id)
    .single();

  if (propertyError) {
    throw new Error(`Property lookup failed: ${propertyError.message ?? "unknown error"}`);
  }
  if (!property) {
    throw new Error("Property not found");
  }

  return { lead: lead as LeadRow, property: property as PropertyRow };
}

async function findOpenRun(leadId: string): Promise<RunRow | null> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("research_runs") as any)
    .select("id, status, started_at, closed_at, artifact_count, fact_count, source_mix")
    .eq("lead_id", leadId)
    .eq("status", "open")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RunRow | null) ?? null;
}

async function createRun(lead: LeadRow, startedBy: string): Promise<RunRow> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("research_runs") as any)
    .insert({
      lead_id: lead.id,
      property_id: lead.property_id,
      status: "open",
      started_by: startedBy,
      notes: "Unified manual research run",
      artifact_count: 0,
      fact_count: 0,
      source_mix: [],
    })
    .select("id, status, started_at, closed_at, artifact_count, fact_count, source_mix")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create research run: ${error?.message ?? "unknown error"}`);
  }

  return data as RunRow;
}

async function persistArtifact(args: {
  leadId: string;
  propertyId: string;
  dossierId?: string;
  runId: string;
  sourceType: string;
  sourceLabel: string;
  sourceUrl?: string | null;
  extractedNotes?: string | null;
  rawExcerpt?: string | null;
  capturedBy: string;
}): Promise<void> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("dossier_artifacts") as any).insert({
    lead_id: args.leadId,
    property_id: args.propertyId,
    dossier_id: args.dossierId ?? null,
    source_url: args.sourceUrl ?? null,
    source_type: args.sourceType,
    source_label: args.sourceLabel,
    extracted_notes: args.extractedNotes ?? null,
    raw_excerpt: args.rawExcerpt ?? null,
    captured_by: args.capturedBy,
    run_id: args.runId,
  });
  if (error) {
    throw new Error(`Failed to persist artifact: ${error.message}`);
  }
}

function buildLegalInput(property: PropertyRow): LegalSearchInput {
  return {
    ownerName: compact(property.owner_name),
    address: compact(property.address),
    apn: compact(property.apn),
    county: compact(property.county),
    city: compact(property.city),
  };
}

function normalizeDocumentDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function mapNextUpcomingEvent(documents: NormalizedDocument[]): PersistedLegalSearchResult["nextUpcomingEvent"] {
  const upcomingEvents = documents
    .filter((doc) => doc.nextHearingDate)
    .map((doc) => ({ doc, date: new Date(doc.nextHearingDate!) }))
    .filter(({ date }) => !Number.isNaN(date.getTime()) && date.getTime() > Date.now())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const first = upcomingEvents[0]?.doc;
  return first
    ? {
        date: first.nextHearingDate,
        type: first.documentType,
        caseNumber: first.caseNumber,
        description: first.eventDescription,
      }
    : null;
}

export async function performLeadLegalSearch(args: {
  leadId: string;
  propertyId: string;
  property: PropertyRow;
}): Promise<PersistedLegalSearchResult> {
  const { property, leadId, propertyId } = args;
  const county = compact(property.county);
  if (!isSupportedLegalCounty(county)) {
    return {
      supported: false,
      status: "unsupported",
      county: county || null,
      documents: [],
      documentsFound: 0,
      documentsInserted: 0,
      courtCasesFound: 0,
      errors: county ? [`Legal county adapter not supported for ${county}.`] : ["Legal county adapter not supported for this lead."],
      nextUpcomingEvent: null,
    };
  }

  const input = buildLegalInput(property);
  if (!input.ownerName && !input.address) {
    return {
      supported: true,
      status: "partial",
      county: county || null,
      documents: [],
      documentsFound: 0,
      documentsInserted: 0,
      courtCasesFound: 0,
      errors: ["Need owner name or address to search legal records."],
      nextUpcomingEvent: null,
    };
  }

  const sb = createServerClient();
  const { documents, errors } = await runLegalSearch(input, process.env.FIRECRAWL_API_KEY ?? "");
  let inserted = 0;

  for (const doc of documents) {
    const row = {
      property_id: propertyId,
      lead_id: leadId,
      document_type: doc.documentType,
      instrument_number: doc.instrumentNumber,
      recording_date: normalizeDocumentDate(doc.recordingDate),
      document_date: normalizeDocumentDate(doc.documentDate),
      grantor: doc.grantor,
      grantee: doc.grantee,
      amount: doc.amount,
      lender_name: doc.lenderName,
      status: doc.status,
      case_number: doc.caseNumber,
      court_name: doc.courtName,
      case_type: doc.caseType,
      attorney_name: doc.attorneyName,
      contact_person: doc.contactPerson,
      next_hearing_date: normalizeDocumentDate(doc.nextHearingDate),
      event_description: doc.eventDescription,
      source: doc.source,
      source_url: doc.sourceUrl,
      raw_excerpt: doc.rawExcerpt,
    };

    let exists = false;
    if (doc.instrumentNumber) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb.from("recorded_documents") as any)
        .select("id")
        .eq("property_id", propertyId)
        .eq("instrument_number", doc.instrumentNumber)
        .limit(1);
      exists = (data?.length ?? 0) > 0;
    } else if (doc.caseNumber) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb.from("recorded_documents") as any)
        .select("id")
        .eq("property_id", propertyId)
        .eq("case_number", doc.caseNumber)
        .limit(1);
      exists = (data?.length ?? 0) > 0;
    }

    if (!exists) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sb.from("recorded_documents") as any).insert(row);
      if (!error) inserted += 1;
    }
  }

  const ownerFlags = (property.owner_flags ?? {}) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("properties") as any)
    .update({
      owner_flags: {
        ...ownerFlags,
        legal_search_at: new Date().toISOString(),
        legal_search_count: documents.length,
      },
    })
    .eq("id", propertyId);

  return {
    supported: true,
    status: errors.length > 0 ? "partial" : "completed",
    county: county || null,
    documents,
    documentsFound: documents.length,
    documentsInserted: inserted,
    courtCasesFound: documents.filter((doc) => doc.caseNumber).length,
    errors,
    nextUpcomingEvent: mapNextUpcomingEvent(documents),
  };
}

function toArtifactSummary(doc: NormalizedDocument): string {
  return [
    doc.documentType,
    doc.eventDescription,
    doc.caseNumber ? `Case ${doc.caseNumber}` : null,
    doc.amount != null ? `$${doc.amount.toLocaleString()}` : null,
  ].filter(Boolean).join(" - ");
}

async function persistLegalArtifacts(args: {
  leadId: string;
  propertyId: string;
  runId: string;
  documents: NormalizedDocument[];
  capturedBy: string;
}): Promise<number> {
  let count = 0;
  for (const doc of args.documents.slice(0, 20)) {
    await persistArtifact({
      leadId: args.leadId,
      propertyId: args.propertyId,
      runId: args.runId,
      sourceType: doc.source === "wa_courts" ? "court_record" : "other",
      sourceLabel: `Legal: ${doc.documentType}`,
      sourceUrl: doc.sourceUrl,
      extractedNotes: truncateText(toArtifactSummary(doc), 400),
      rawExcerpt: doc.rawExcerpt,
      capturedBy: args.capturedBy,
    });
    count += 1;
  }
  return count;
}

async function persistPeopleArtifacts(args: {
  leadId: string;
  propertyId: string;
  runId: string;
  findings: AgentFinding[];
  capturedBy: string;
}): Promise<number> {
  let count = 0;
  for (const finding of args.findings.slice(0, 30)) {
    await persistArtifact({
      leadId: args.leadId,
      propertyId: args.propertyId,
      runId: args.runId,
      sourceType: sourceTypeForFinding(finding),
      sourceLabel: `${finding.source}: ${finding.category.replace(/_/g, " ")}`,
      sourceUrl: finding.url,
      extractedNotes: truncateText(finding.finding, 400),
      rawExcerpt: finding.rawSnippet,
      capturedBy: args.capturedBy,
    });
    count += 1;
  }
  return count;
}

function mergeContacts(ownerFlags: Record<string, unknown>, agentResults: AgentResult[]) {
  const existingPhones = Array.isArray(ownerFlags.all_phones)
    ? (ownerFlags.all_phones as Array<{ number?: unknown }>)
        .map((row) => typeof row?.number === "string" ? row.number : "")
        .filter(Boolean)
    : [];
  const existingEmails = Array.isArray(ownerFlags.all_emails)
    ? (ownerFlags.all_emails as Array<{ email?: unknown }>)
        .map((row) => typeof row?.email === "string" ? row.email : "")
        .filter(Boolean)
    : [];

  const meta = {
    agentsRun: agentResults.map((result) => result.agentId),
    agentsSucceeded: agentResults.filter((result) => result.success).map((result) => result.agentId),
    agentsFailed: agentResults.filter((result) => !result.success).map((result) => result.agentId),
    totalDurationMs: agentResults.reduce((total, result) => total + result.durationMs, 0),
  };

  const deepSkip = buildDeepSkipResult(agentResults, existingPhones, existingEmails, meta);
  const currentPhones = Array.isArray(ownerFlags.all_phones) ? [...ownerFlags.all_phones as unknown[]] : [];
  const currentEmails = Array.isArray(ownerFlags.all_emails) ? [...ownerFlags.all_emails as unknown[]] : [];

  for (const phone of deepSkip.newPhones) {
    currentPhones.push({
      number: phone.number,
      lineType: "unknown",
      confidence: 60,
      dnc: false,
      source: `openclaw_${phone.source}`,
    });
  }

  for (const email of deepSkip.newEmails) {
    currentEmails.push({
      email: email.email,
      deliverable: true,
      source: `openclaw_${email.source}`,
    });
  }

  return {
    deepSkip,
    updatedFlags: {
      ...ownerFlags,
      all_phones: currentPhones,
      all_emails: currentEmails,
      phone_count: currentPhones.length,
      email_count: currentEmails.length,
    },
  };
}

function buildSourceLinks(legal: PersistedLegalSearchResult, findings: AgentFinding[]): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();

  const push = (url: string | null | undefined, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ label, url });
  };

  for (const doc of legal.documents) {
    push(doc.sourceUrl, doc.source);
  }
  for (const finding of findings) {
    push(finding.url, finding.source);
  }

  return links.slice(0, 8);
}

function buildDeepCrawlCache(args: {
  property: PropertyRow;
  legal: PersistedLegalSearchResult;
  brief: SynthesisResult;
  findings: AgentFinding[];
  nextOfKin: NextOfKinCandidate[];
  provider: "openai" | "fallback";
  model: string;
  metadata: UnifiedResearchMetadata;
}): Record<string, unknown> {
  return {
    crawledAt: new Date().toISOString(),
    signals: args.legal.documents.slice(0, 6).map((doc) => ({
      type: doc.documentType,
      filingDate: doc.recordingDate,
      amount: doc.amount,
      stage: doc.status,
      auctionDate: doc.nextHearingDate,
      lender: doc.lenderName,
      source: doc.source,
    })),
    financial: {
      avm: args.property.estimated_value,
      equityPercent: args.property.equity_percent,
      availableEquity: null,
      loanBalance: null,
      taxAssessed: null,
      taxAmount: null,
    },
    owner: {
      name: args.property.owner_name,
      age: null,
      ownershipYears: null,
      lastTransferDate: null,
      lastTransferValue: null,
      lastTransferType: null,
      absentee: Boolean((args.property.owner_flags ?? {})["absentee"]),
      deceased: args.nextOfKin.length > 0,
      freeClear: false,
      mailingAddress: null,
    },
    aiDossier: {
      summary: args.brief.situation_summary,
      urgencyLevel: args.legal.documentsFound > 0 ? "HIGH" : "MEDIUM",
      urgencyReason: args.legal.nextUpcomingEvent?.description ?? "Unified research run completed.",
      signalAnalysis: args.legal.documents.slice(0, 4).map((doc) => ({
        headline: truncateText(toArtifactSummary(doc), 120),
        detail: truncateText(doc.rawExcerpt ?? doc.eventDescription ?? doc.documentType, 220),
        daysUntilCritical: null,
        actionableInsight: doc.source,
      })),
      ownerProfile: args.brief.likely_decision_maker ?? args.property.owner_name ?? "",
      financialAnalysis: args.legal.documentsFound > 0
        ? `${args.legal.documentsFound} legal records were matched for this file.`
        : "No supported legal record matches were confirmed during this run.",
      suggestedApproach: args.brief.recommended_call_angle ?? "",
      redFlags: args.brief.verification_checklist.map((item) => item.item),
      talkingPoints: args.brief.top_facts.map((item) => item.fact),
      webFindings: args.findings.slice(0, 8).map((finding) => ({
        source: finding.source,
        finding: finding.finding,
      })),
      estimatedMAO: null,
    },
    sources: args.metadata.source_groups,
    grokSuccess: false,
    openAiSuccess: args.provider === "openai",
    openAiModel: args.model,
    agentFindings: args.findings,
    photos: Array.isArray((args.property.owner_flags ?? {})["photos"]) ? (args.property.owner_flags ?? {})["photos"] : undefined,
  };
}

async function upsertProposedDossier(args: {
  leadId: string;
  propertyId: string;
  runId: string;
  brief: SynthesisResult;
  metadata: UnifiedResearchMetadata;
  findings: AgentFinding[];
  sourceLinks: Array<{ label: string; url: string }>;
}): Promise<DossierRow> {
  const sb = createServerClient();

  const rawAiOutput = {
    research_run: args.metadata,
    staged_brief_version: "brief_first_v1",
    people_intel_count: args.metadata.people_intel.highlights.length,
    next_of_kin_count: args.metadata.people_intel.next_of_kin.length,
    findings: args.findings.slice(0, 12).map((finding) => ({
      category: finding.category,
      source: finding.source,
      finding: finding.finding,
      confidence: finding.confidence,
      url: finding.url,
      date: finding.date,
    })),
  };

  const record = {
    lead_id: args.leadId,
    property_id: args.propertyId,
    status: "proposed",
    situation_summary: args.brief.situation_summary,
    likely_decision_maker: args.brief.likely_decision_maker,
    top_facts: args.brief.top_facts.length > 0 ? args.brief.top_facts : null,
    recommended_call_angle: args.brief.recommended_call_angle,
    verification_checklist: args.brief.verification_checklist.length > 0 ? args.brief.verification_checklist : null,
    source_links: args.sourceLinks.length > 0 ? args.sourceLinks : null,
    raw_ai_output: rawAiOutput,
    ai_run_id: args.runId,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("dossiers") as any)
    .select("id")
    .eq("lead_id", args.leadId)
    .eq("status", "proposed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let dossier: DossierRow | null = null;
  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("dossiers") as any)
      .update(record)
      .eq("id", existing.id)
      .select("id, status, created_at, reviewed_at, raw_ai_output")
      .single();
    if (error || !data) {
      throw new Error(`Failed to update proposed dossier: ${error?.message ?? "unknown error"}`);
    }
    dossier = data as DossierRow;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("dossiers") as any)
      .insert(record)
      .select("id, status, created_at, reviewed_at, raw_ai_output")
      .single();
    if (error || !data) {
      throw new Error(`Failed to create proposed dossier: ${error?.message ?? "unknown error"}`);
    }
    dossier = data as DossierRow;
  }

  return dossier;
}

async function linkRunArtifactsToDossier(runId: string, dossierId: string): Promise<void> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dossier_artifacts") as any)
    .update({ dossier_id: dossierId, updated_at: new Date().toISOString() })
    .eq("run_id", runId);
}

async function completeRun(args: {
  runId: string;
  dossierId: string;
  artifactCount: number;
  sourceMix: string[];
}): Promise<RunRow> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("research_runs") as any)
    .update({
      status: "compiled",
      dossier_id: args.dossierId,
      artifact_count: args.artifactCount,
      fact_count: 0,
      source_mix: args.sourceMix,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.runId)
    .select("id, status, started_at, closed_at, artifact_count, fact_count, source_mix")
    .single();

  if (error || !data) {
    throw new Error(`Failed to complete research run: ${error?.message ?? "unknown error"}`);
  }
  return data as RunRow;
}

async function saveOwnerFlags(propertyId: string, ownerFlags: Record<string, unknown>): Promise<void> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("properties") as any)
    .update({
      owner_flags: ownerFlags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", propertyId);
}

export async function runLeadResearch(options: RunLeadResearchOptions): Promise<RunLeadResearchResult> {
  const { lead, property } = await fetchLeadAndProperty(options.leadId);
  const existingOpenRun = options.force ? null : await findOpenRun(lead.id);
  const run = existingOpenRun ?? await createRun(lead, options.startedBy);

  const ownerFlags = (property.owner_flags ?? {}) as Record<string, unknown>;
  const distressSignalRows = await (async () => {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("distress_events") as any)
      .select("event_type")
      .eq("property_id", property.id);
    return (data ?? []) as DistressEventRow[];
  })();
  const distressSignalTypes = distressSignalRows.map((row) => row.event_type);

  const legal = process.env.FIRECRAWL_API_KEY
    ? await performLeadLegalSearch({ leadId: lead.id, propertyId: property.id, property })
    : {
        supported: isSupportedLegalCounty(property.county),
        status: isSupportedLegalCounty(property.county) ? "partial" : "unsupported",
        county: compact(property.county) || null,
        documents: [],
        documentsFound: 0,
        documentsInserted: 0,
        courtCasesFound: 0,
        errors: ["FIRECRAWL_API_KEY not configured"],
        nextUpcomingEvent: null,
      } satisfies PersistedLegalSearchResult;

  let agentResults: AgentResult[] = [];
  let agentFindings: AgentFinding[] = [];
  let deepSkip: DeepSkipResult = {
    people: [],
    newPhones: [],
    newEmails: [],
    employmentSignals: [],
    agentMeta: { agentsRun: [], agentsSucceeded: [], agentsFailed: [], totalDurationMs: 0 },
    crawledAt: new Date().toISOString(),
  };
  let sourceGroups: UnifiedResearchMetadata["source_groups"] = ["deep_property"];
  let workingOwnerFlags = { ...ownerFlags };

  if (isOpenClawConfigured()) {
    const propertyContext = buildPropertyContext(property, distressSignalTypes, ownerFlags);
    const plan = buildAgentPlan(propertyContext);
    const fanOut = await fanOutAgents(plan.tasks);
    agentResults = fanOut.results;
    agentFindings = fanOut.results.flatMap((result) => result.findings);
    const merged = mergeContacts(workingOwnerFlags, fanOut.results);
    deepSkip = merged.deepSkip;
    workingOwnerFlags = merged.updatedFlags;
    sourceGroups = ["deep_property", "people_intel"];
  }

  if (legal.supported || legal.documentsFound > 0 || legal.errors.length > 0) {
    sourceGroups = [...new Set([...sourceGroups, "legal"])] as UnifiedResearchMetadata["source_groups"];
  }

  const nextOfKin = extractNextOfKinCandidates(deepSkip.people);
  const aiModel = nextOfKin.length > 0 || legal.documentsFound >= 8
    ? options.model ?? ESCALATED_RESEARCH_MODEL
    : options.model ?? DEFAULT_RESEARCH_MODEL;
  const synthesis = await synthesizeResearchBrief({
    property,
    legal,
    agentFindings,
    nextOfKin,
    model: aiModel,
  });

  let artifactCount = 0;
  artifactCount += await persistLegalArtifacts({
    leadId: lead.id,
    propertyId: property.id,
    runId: run.id,
    documents: legal.documents,
    capturedBy: options.startedBy,
  });
  artifactCount += await persistPeopleArtifacts({
    leadId: lead.id,
    propertyId: property.id,
    runId: run.id,
    findings: agentFindings,
    capturedBy: options.startedBy,
  });

  const metadata: UnifiedResearchMetadata = {
    version: "unified_research_v1",
    source_groups: sourceGroups,
    ai_provider: synthesis.provider,
    ai_model: synthesis.model,
    legal: {
      supported: legal.supported,
      status: legal.status,
      county: legal.county,
      documents_found: legal.documentsFound,
      documents_inserted: legal.documentsInserted,
      court_cases_found: legal.courtCasesFound,
      errors: legal.errors,
      next_upcoming_event: legal.nextUpcomingEvent,
    },
    people_intel: {
      highlights: agentFindings
        .filter((finding) => ["social_media", "employment", "obituary", "contact", "heir"].includes(finding.category))
        .slice(0, 8)
        .map(toPeopleIntelHighlight),
      next_of_kin: nextOfKin.slice(0, 6),
    },
    artifact_count: artifactCount,
    staged_at: new Date().toISOString(),
  };

  const sourceLinks = buildSourceLinks(legal, agentFindings);
  const dossier = await upsertProposedDossier({
    leadId: lead.id,
    propertyId: property.id,
    runId: run.id,
    brief: synthesis.brief,
    metadata,
    findings: agentFindings,
    sourceLinks,
  });

  await linkRunArtifactsToDossier(run.id, dossier.id);

  workingOwnerFlags = {
    ...workingOwnerFlags,
    deep_crawl: buildDeepCrawlCache({
      property,
      legal,
      brief: synthesis.brief,
      findings: agentFindings,
      nextOfKin,
      provider: synthesis.provider,
      model: synthesis.model,
      metadata,
    }),
    deep_skip: deepSkip,
    research_run_last_id: run.id,
    research_run_last_at: metadata.staged_at,
  };
  await saveOwnerFlags(property.id, workingOwnerFlags);

  const completedRun = await completeRun({
    runId: run.id,
    dossierId: dossier.id,
    artifactCount,
    sourceMix: sourceGroups,
  });

  return {
    run: completedRun,
    dossier: {
      id: dossier.id,
      status: dossier.status,
      created_at: dossier.created_at,
      reviewed_at: dossier.reviewed_at,
    },
    metadata,
  };
}

export async function getLeadResearchStatus(leadId: string): Promise<UnifiedResearchStatusResponse> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: run } = await (sb.from("research_runs") as any)
    .select("id, status, started_at, closed_at, artifact_count, fact_count, source_mix")
    .eq("lead_id", leadId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dossier } = await (sb.from("dossiers") as any)
    .select("id, status, created_at, reviewed_at, raw_ai_output")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const raw = (dossier?.raw_ai_output as Record<string, unknown> | null) ?? null;
  const metadata = raw && typeof raw.research_run === "object"
    ? raw.research_run as UnifiedResearchMetadata
    : null;

  return {
    run: run as UnifiedResearchStatusResponse["run"],
    dossier: dossier
      ? {
          id: dossier.id,
          status: dossier.status,
          created_at: dossier.created_at,
          reviewed_at: dossier.reviewed_at,
        }
      : null,
    metadata,
  };
}
