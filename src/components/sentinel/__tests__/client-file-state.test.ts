import { describe, expect, it } from "vitest";
import type { LeadPhone } from "@/lib/dialer/types";
import type { ClientFile } from "@/components/sentinel/master-client-file-helpers";
import {
  buildClientFilePatchFromPropertyRecord,
  getCanonicalLeadPhone,
  mergeClientFileState,
} from "@/components/sentinel/master-client-file/client-file-state";

function buildClientFile(overrides: Partial<ClientFile> = {}): ClientFile {
  return {
    id: "lead-1",
    propertyId: "prop-1",
    apn: "123",
    county: "Spokane",
    address: "6704 E 7TH AVE",
    city: "Spokane",
    state: "WA",
    zip: "99202",
    fullAddress: "6704 E 7TH AVE, Spokane, WA, 99202",
    ownerName: "Timothy Hill",
    ownerPhone: "5091111111",
    ownerEmail: null,
    ownerBadge: null,
    distressSignals: [],
    status: "lead",
    pinned: false,
    pinnedAt: null,
    pinnedBy: null,
    assignedTo: null,
    assignedName: null,
    source: "manual",
    sourceVendor: null,
    sourceListName: null,
    sourcePullDate: null,
    sourceCampaign: null,
    sourceChannel: "manual",
    intakeMethod: null,
    rawSourceRef: null,
    tags: [],
    notes: null,
    promotedAt: null,
    lastContactAt: null,
    followUpDate: null,
    firstAttemptAt: null,
    motivationLevel: null,
    sellerTimeline: null,
    conditionLevel: null,
    decisionMakerConfirmed: false,
    priceExpectation: null,
    qualificationRoute: null,
    occupancyScore: null,
    equityFlexibilityScore: null,
    qualificationScoreTotal: null,
    nextAction: null,
    nextActionDueAt: null,
    scoreLabel: "bronze",
    predictivePriority: null,
    estimatedValue: null,
    equityPercent: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    propertyType: null,
    yearBuilt: null,
    lotSize: null,
    radarId: null,
    ownerFlags: {},
    isAbsentee: false,
    isFreeClear: false,
    isHighEquity: false,
    isCashBuyer: false,
    sourceScore: null,
    dispositionCode: null,
    totalCalls: 0,
    liveAnswers: 0,
    voicemailsLeft: 0,
    callSequenceStep: 1,
    nextCallScheduledAt: null,
    lockVersion: 0,
    callRailStatus: null,
    skipTraceStatus: null,
    skipTraceCompletedAt: null,
    outreachType: null,
    assignedAt: null,
    outboundStatus: null,
    outboundAttemptCount: null,
    outboundFirstCallAt: null,
    outboundLastCallAt: null,
    firstContactAt: null,
    wrongNumber: false,
    doNotCall: false,
    badRecord: false,
    score: null,
    nicheTag: null,
    importBatchId: null,
    duplicateStatus: null,
    receivedAt: null,
    attribution: null,
    offerPrepSnapshot: null,
    offerPrepHealth: null,
    offerStatus: null,
    appointmentAt: null,
    offerAmount: null,
    contractAt: null,
    assignmentFeeProjected: null,
    conversionGclid: null,
    sellerSituationSummaryShort: null,
    recommendedCallAngle: null,
    topFact1: null,
    topFact2: null,
    topFact3: null,
    opportunityScore: null,
    contactabilityScore: null,
    confidenceScore: null,
    dossierUrl: null,
    ...overrides,
  } as ClientFile;
}

function buildLeadPhone(overrides: Partial<LeadPhone> = {}): LeadPhone {
  return {
    id: "phone-1",
    phone: "5099999999",
    label: "mobile",
    source: "manual",
    status: "active",
    dead_reason: null,
    is_primary: false,
    position: 1,
    last_called_at: null,
    call_count: 0,
    ...overrides,
  };
}

describe("client file state helpers", () => {
  it("prefers the canonical primary lead phone over stale snapshot owner_phone", () => {
    const merged = mergeClientFileState(
      buildClientFile(),
      null,
      null,
      [
        buildLeadPhone({ id: "phone-1", phone: "5092222222" }),
        buildLeadPhone({ id: "phone-2", phone: "5093333333", is_primary: true }),
      ],
    );

    expect(merged?.ownerPhone).toBe("5093333333");
  });

  it("rebuilds the full address from patched address parts", () => {
    const merged = mergeClientFileState(
      buildClientFile(),
      {
        address: "6704 E 7TH AVE",
        city: "Spokane Valley",
        state: "WA",
        zip: "99212",
      },
      null,
      [],
    );

    expect(merged?.fullAddress).toBe("6704 E 7TH AVE, Spokane Valley, WA, 99212");
  });

  it("builds a client-file patch from a property response with a canonical full address", () => {
    const patch = buildClientFilePatchFromPropertyRecord({
      property: {
        address: "2018 W EUCLID AVE",
        city: "Spokane",
        state: "WA",
        zip: "99205",
        owner_phone: "5094444444",
        owner_email: "seller@example.com",
      },
    });

    expect(patch).toMatchObject({
      address: "2018 W EUCLID AVE",
      city: "Spokane",
      state: "WA",
      zip: "99205",
      fullAddress: "2018 W EUCLID AVE, Spokane, WA, 99205",
      ownerPhone: "5094444444",
      ownerEmail: "seller@example.com",
    });
  });

  it("picks the first active phone when no primary flag exists", () => {
    expect(getCanonicalLeadPhone([
      buildLeadPhone({ id: "phone-1", phone: "5091111111", position: 1 }),
      buildLeadPhone({ id: "phone-2", phone: "5092222222", position: 2 }),
    ])?.phone).toBe("5091111111");
  });
});
