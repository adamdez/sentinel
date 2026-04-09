import { describe, expect, it } from "vitest";

import type { LeadRow } from "@/lib/leads-data";

const BASE_FILTERS = {
  search: "",
  statuses: [],
  markets: [],
  sources: [],
  nicheTags: [],
  batchOrRuns: [],
  callStatuses: [],
  followUp: "all",
  unassignedOnly: false,
  includeClosed: false,
  excludeSuppressed: false,
  hasPhone: "any",
  neverCalled: false,
  notCalledToday: false,
  distressTags: [],
  inDialQueue: "any",
} satisfies import("@/hooks/use-leads").LeadFilters;

async function loadHelpers() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  return import("@/hooks/use-leads");
}

function makeLead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: overrides.id ?? "lead-1",
    propertyId: overrides.propertyId ?? "property-1",
    apn: overrides.apn ?? "12345.0001",
    county: overrides.county ?? "Spokane",
    address: overrides.address ?? "123 Main St",
    city: overrides.city ?? "Spokane",
    state: overrides.state ?? "WA",
    zip: overrides.zip ?? "99201",
    ownerName: overrides.ownerName ?? "Alice Owner",
    ownerPhone: overrides.ownerPhone ?? null,
    ownerEmail: overrides.ownerEmail ?? null,
    ownerBadge: overrides.ownerBadge ?? null,
    distressSignals: overrides.distressSignals ?? [],
    status: overrides.status ?? "lead",
    assignedTo: overrides.assignedTo ?? null,
    assignedName: overrides.assignedName ?? null,
    score: overrides.score ?? {
      composite: 0,
      motivation: 0,
      equityVelocity: 0,
      urgency: 0,
      historicalConversion: 0,
      aiBoost: 0,
      label: "unscored",
    },
    predictivePriority: overrides.predictivePriority ?? 0,
    estimatedValue: overrides.estimatedValue ?? null,
    equityPercent: overrides.equityPercent ?? null,
    bedrooms: overrides.bedrooms ?? null,
    bathrooms: overrides.bathrooms ?? null,
    sqft: overrides.sqft ?? null,
    propertyType: overrides.propertyType ?? null,
    yearBuilt: overrides.yearBuilt ?? null,
    lotSize: overrides.lotSize ?? null,
    loanBalance: overrides.loanBalance ?? null,
    lastSalePrice: overrides.lastSalePrice ?? null,
    lastSaleDate: overrides.lastSaleDate ?? null,
    foreclosureStage: overrides.foreclosureStage ?? null,
    defaultAmount: overrides.defaultAmount ?? null,
    delinquentAmount: overrides.delinquentAmount ?? null,
    isVacant: overrides.isVacant ?? false,
    followUpDate: overrides.followUpDate ?? null,
    lastContactAt: overrides.lastContactAt ?? null,
    firstAttemptAt: overrides.firstAttemptAt ?? null,
    motivationLevel: overrides.motivationLevel ?? null,
    sellerTimeline: overrides.sellerTimeline ?? null,
    conditionLevel: overrides.conditionLevel ?? null,
    decisionMakerConfirmed: overrides.decisionMakerConfirmed ?? false,
    priceExpectation: overrides.priceExpectation ?? null,
    qualificationRoute: overrides.qualificationRoute ?? null,
    occupancyScore: overrides.occupancyScore ?? null,
    equityFlexibilityScore: overrides.equityFlexibilityScore ?? null,
    qualificationScoreTotal: overrides.qualificationScoreTotal ?? null,
    offerStatus: overrides.offerStatus ?? "none",
    offerPrepSnapshot: overrides.offerPrepSnapshot ?? {
      arvUsed: null,
      rehabEstimate: null,
      maoLow: null,
      maoHigh: null,
      confidence: null,
      sheetUrl: null,
      updatedAt: null,
      formulaVersion: null,
      formulaMode: null,
      arvLow: null,
      arvBase: null,
      arvHigh: null,
      arvSource: null,
      conditionLevel: null,
      conditionAdjPct: null,
      avgPpsf: null,
      compCount: null,
      spreadPct: null,
      offerPercentage: null,
      assignmentFeeTarget: null,
      holdingCosts: null,
      closingCosts: null,
      maoResult: null,
      warnings: null,
      calculatedBy: null,
    },
    offerPrepHealth: overrides.offerPrepHealth ?? "not_applicable",
    promotedAt: overrides.promotedAt ?? "2026-04-09T00:00:00.000Z",
    source: overrides.source ?? "manual",
    sourceChannel: overrides.sourceChannel ?? "manual",
    sourceVendor: overrides.sourceVendor ?? null,
    sourceListName: overrides.sourceListName ?? null,
    sourcePullDate: overrides.sourcePullDate ?? null,
    sourceCampaign: overrides.sourceCampaign ?? null,
    intakeMethod: overrides.intakeMethod ?? null,
    rawSourceRef: overrides.rawSourceRef ?? null,
    duplicateStatus: overrides.duplicateStatus ?? null,
    receivedAt: overrides.receivedAt ?? null,
    nicheTag: overrides.nicheTag ?? null,
    importBatchId: overrides.importBatchId ?? null,
    scoutRunId: overrides.scoutRunId ?? null,
    scoutSourceSystem: overrides.scoutSourceSystem ?? null,
    outreachType: overrides.outreachType ?? null,
    assignedAt: overrides.assignedAt ?? null,
    skipTraceStatus: overrides.skipTraceStatus ?? null,
    skipTraceCompletedAt: overrides.skipTraceCompletedAt ?? null,
    skipTraceLastError: overrides.skipTraceLastError ?? null,
    outboundStatus: overrides.outboundStatus ?? null,
    outboundAttemptCount: overrides.outboundAttemptCount ?? null,
    outboundFirstCallAt: overrides.outboundFirstCallAt ?? null,
    outboundLastCallAt: overrides.outboundLastCallAt ?? null,
    firstContactAt: overrides.firstContactAt ?? null,
    wrongNumber: overrides.wrongNumber ?? false,
    doNotCall: overrides.doNotCall ?? false,
    badRecord: overrides.badRecord ?? false,
    tags: overrides.tags ?? [],
    complianceClean: overrides.complianceClean ?? true,
    notes: overrides.notes ?? null,
    totalCalls: overrides.totalCalls ?? 0,
    liveAnswers: overrides.liveAnswers ?? 0,
    voicemailsLeft: overrides.voicemailsLeft ?? 0,
    callSequenceStep: overrides.callSequenceStep ?? 1,
    nextCallScheduledAt: overrides.nextCallScheduledAt ?? null,
    dispositionCode: overrides.dispositionCode ?? null,
    ownerFlags: overrides.ownerFlags ?? {},
    appointmentAt: overrides.appointmentAt ?? null,
    offerAmount: overrides.offerAmount ?? null,
    contractAt: overrides.contractAt ?? null,
    assignmentFeeProjected: overrides.assignmentFeeProjected ?? null,
    conversionGclid: overrides.conversionGclid ?? null,
    attribution: overrides.attribution ?? null,
    sellerSituationSummaryShort: overrides.sellerSituationSummaryShort ?? null,
    recommendedCallAngle: overrides.recommendedCallAngle ?? null,
    topFact1: overrides.topFact1 ?? null,
    topFact2: overrides.topFact2 ?? null,
    topFact3: overrides.topFact3 ?? null,
    opportunityScore: overrides.opportunityScore ?? null,
    contactabilityScore: overrides.contactabilityScore ?? null,
    confidenceScore: overrides.confidenceScore ?? null,
    dossierUrl: overrides.dossierUrl ?? null,
    nextAction: overrides.nextAction ?? null,
    nextActionDueAt: overrides.nextActionDueAt ?? null,
    pinned: overrides.pinned ?? false,
    pinnedAt: overrides.pinnedAt ?? null,
    pinnedBy: overrides.pinnedBy ?? null,
    dialQueueActive: overrides.dialQueueActive ?? false,
    dialQueueAddedAt: overrides.dialQueueAddedAt ?? null,
    introSopActive: overrides.introSopActive ?? true,
    introDayCount: overrides.introDayCount ?? 0,
    introLastCallDate: overrides.introLastCallDate ?? null,
    introCompletedAt: overrides.introCompletedAt ?? null,
    introExitCategory: overrides.introExitCategory ?? null,
    requiresIntroExitCategory: overrides.requiresIntroExitCategory ?? false,
  };
}

describe("lead queue filter helpers", () => {
  it("keeps all source options available so operators can select values beyond the old top-8 chip limit", async () => {
    const { buildLeadSourceOptions, filterLeadRows } = await loadHelpers();
    const leads = Array.from({ length: 9 }, (_, index) =>
      makeLead({
        id: `lead-${index + 1}`,
        propertyId: `property-${index + 1}`,
        source: `source_${index + 1}`,
        sourceChannel: `source_${index + 1}`,
      }),
    );

    const sourceOptions = buildLeadSourceOptions(leads);

    expect(sourceOptions).toHaveLength(9);
    expect(sourceOptions.map((option) => option.value)).toContain("source_9");

    const filtered = filterLeadRows(
      leads,
      { ...BASE_FILTERS, sources: ["source_9"] },
      "none",
    );

    expect(filtered.map((lead) => lead.id)).toEqual(["lead-9"]);
  });

  it("builds unified run/batch options from both CSV imports and Spokane Scout lineage", async () => {
    const { batchOrRunFilterValue, buildLeadBatchOrRunOptions } = await loadHelpers();
    const options = buildLeadBatchOrRunOptions([
      makeLead({ importBatchId: "batch-april-07" }),
      makeLead({
        id: "lead-2",
        propertyId: "property-2",
        source: "spokane_scout_crawler",
        sourceChannel: "spokane_scout",
        scoutRunId: "scout-2026-04-07",
      }),
    ]);

    expect(options.map((option) => option.value)).toEqual(
      expect.arrayContaining([
        batchOrRunFilterValue("import_batch", "batch-april-07"),
        batchOrRunFilterValue("scout_run", "scout-2026-04-07"),
      ]),
    );
  });

  it("filters to Spokane Scout tax lien leads when source and distress filters are combined", async () => {
    const { filterLeadRows } = await loadHelpers();
    const leads = [
      makeLead({
        id: "scout-tax",
        propertyId: "property-scout-tax",
        source: "spokane_scout_crawler",
        sourceChannel: "spokane_scout",
        scoutRunId: "scout-2026-04-07",
        distressSignals: ["tax_lien"],
        tags: ["tax_lien"],
      }),
      makeLead({
        id: "scout-other",
        propertyId: "property-scout-other",
        source: "spokane_scout_crawler",
        sourceChannel: "spokane_scout",
        scoutRunId: "scout-2026-04-07",
        distressSignals: ["probate"],
        tags: ["probate"],
      }),
      makeLead({
        id: "csv-tax",
        propertyId: "property-csv-tax",
        source: "csv_import",
        sourceChannel: "csv_import",
        importBatchId: "batch-april-07",
        distressSignals: ["tax_lien"],
        tags: ["tax_lien"],
      }),
    ];

    const filtered = filterLeadRows(
      leads,
      { ...BASE_FILTERS, sources: ["spokane_scout"], distressTags: ["tax_lien"] },
      "none",
    );

    expect(filtered.map((lead) => lead.id)).toEqual(["scout-tax"]);
  });
});
