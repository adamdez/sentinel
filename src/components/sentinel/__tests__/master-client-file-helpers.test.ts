import { describe, expect, it } from "vitest";
import {
  CLOSEOUT_PRESET_GROUPS,
  CLOSEOUT_PRESETS,
  clientFileFromLead,
  clientFileFromProspect,
  clientFileFromRaw,
  closeoutSuccessMessage,
  closeoutNextActionText,
  deriveSkipTraceUiState,
  OUTCOME_PRESET_DEFAULTS,
  resolveCloseoutPresetDateTimeLocal,
  routeForCloseoutAction,
} from "@/components/sentinel/master-client-file-helpers";

describe("client file pin state adapters", () => {
  it("preserves pin state from LeadRow", () => {
    const clientFile = clientFileFromLead({
      id: "lead-1",
      propertyId: "prop-1",
      apn: "123",
      county: "Spokane",
      address: "123 Main St",
      city: "Spokane",
      state: "WA",
      zip: "99201",
      ownerName: "Jane Seller",
      ownerPhone: null,
      ownerEmail: null,
      ownerBadge: null,
      distressSignals: [],
      status: "lead",
      assignedTo: null,
      assignedName: null,
      score: { composite: 33, motivation: 28, equityVelocity: 20, urgency: 12, historicalConversion: 8, aiBoost: 0, label: "bronze" },
      predictivePriority: 33,
      estimatedValue: null,
      equityPercent: null,
      bedrooms: null,
      bathrooms: null,
      sqft: null,
      propertyType: null,
      yearBuilt: null,
      lotSize: null,
      loanBalance: null,
      lastSalePrice: null,
      lastSaleDate: null,
      foreclosureStage: null,
      defaultAmount: null,
      delinquentAmount: null,
      isVacant: false,
      followUpDate: null,
      lastContactAt: null,
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
      offerStatus: "hidden",
      offerPrepSnapshot: { enabled: false, status: "not_started", confidence: "low", checklistComplete: false, blockers: [], notes: null, updatedAt: null },
      offerPrepHealth: "not_started",
      promotedAt: "2026-03-27T10:00:00Z",
      source: "manual",
      sourceChannel: "manual",
      sourceVendor: null,
      sourceListName: null,
      sourcePullDate: null,
      sourceCampaign: null,
      intakeMethod: null,
      rawSourceRef: null,
      duplicateStatus: null,
      receivedAt: null,
      nicheTag: null,
      importBatchId: null,
      outreachType: null,
      assignedAt: null,
      skipTraceStatus: null,
      outboundStatus: null,
      outboundAttemptCount: null,
      outboundFirstCallAt: null,
      outboundLastCallAt: null,
      firstContactAt: null,
      wrongNumber: false,
      doNotCall: false,
      badRecord: false,
      tags: [],
      complianceClean: true,
      notes: null,
      totalCalls: 0,
      liveAnswers: 0,
      voicemailsLeft: 0,
      callSequenceStep: 1,
      nextCallScheduledAt: null,
      dispositionCode: null,
      ownerFlags: {},
      appointmentAt: null,
      offerAmount: null,
      contractAt: null,
      assignmentFeeProjected: null,
      conversionGclid: null,
      attribution: null,
      sellerSituationSummaryShort: null,
      recommendedCallAngle: null,
      topFact1: null,
      topFact2: null,
      topFact3: null,
      opportunityScore: null,
      contactabilityScore: null,
      confidenceScore: null,
      dossierUrl: null,
      pinned: true,
      pinnedAt: "2026-03-27T11:00:00Z",
      pinnedBy: "user-1",
    } as any);

    expect(clientFile.pinned).toBe(true);
    expect(clientFile.pinnedAt).toBe("2026-03-27T11:00:00Z");
    expect(clientFile.pinnedBy).toBe("user-1");
  });

  it("preserves pin state from prospect rows", () => {
    const clientFile = clientFileFromProspect({
      id: "lead-2",
      property_id: "prop-2",
      status: "prospect",
      priority: 10,
      source: "manual",
      tags: [],
      notes: null,
      promoted_at: null,
      assigned_to: null,
      motivation_level: null,
      seller_timeline: null,
      condition_level: null,
      decision_maker_confirmed: false,
      price_expectation: null,
      qualification_route: null,
      occupancy_score: null,
      equity_flexibility_score: null,
      qualification_score_total: null,
      created_at: "2026-03-27T10:00:00Z",
      apn: "456",
      county: "Spokane",
      address: "456 Pine St",
      city: "Spokane",
      state: "WA",
      zip: "99202",
      owner_name: "Prospect Seller",
      owner_phone: null,
      owner_email: null,
      estimated_value: null,
      equity_percent: null,
      property_type: null,
      bedrooms: null,
      bathrooms: null,
      sqft: null,
      year_built: null,
      lot_size: null,
      owner_flags: {},
      available_equity: null,
      total_loan_balance: null,
      last_sale_price: null,
      last_sale_date: null,
      foreclosure_stage: null,
      default_amount: null,
      delinquent_amount: null,
      is_vacant: false,
      is_absentee: false,
      is_free_clear: false,
      is_high_equity: false,
      is_cash_buyer: false,
      radar_id: null,
      enriched: false,
      composite_score: 10,
      motivation_score: 9,
      deal_score: 8,
      score_label: "bronze",
      model_version: null,
      ai_boost: 0,
      factors: [],
      _prediction: null,
      pinned: true,
      pinned_at: "2026-03-27T12:00:00Z",
      pinned_by: "user-2",
    } as any);

    expect(clientFile.pinned).toBe(true);
    expect(clientFile.pinnedAt).toBe("2026-03-27T12:00:00Z");
    expect(clientFile.pinnedBy).toBe("user-2");
  });

  it("preserves pin state from raw lead records", () => {
    const clientFile = clientFileFromRaw(
      {
        id: "lead-3",
        property_id: "prop-3",
        status: "lead",
        source: "manual",
        tags: [],
        notes: null,
        promoted_at: "2026-03-27T10:00:00Z",
        last_contact_at: null,
        follow_up_date: null,
        next_call_scheduled_at: null,
        call_sequence_step: 1,
        total_calls: 0,
        live_answers: 0,
        voicemails_left: 0,
        disposition_code: null,
        priority: 20,
        pinned: true,
        pinned_at: "2026-03-27T13:00:00Z",
        pinned_by: "user-3",
      } as any,
      {
        apn: "789",
        county: "Spokane",
        address: "789 Cedar St",
        city: "Spokane",
        state: "WA",
        zip: "99203",
        owner_name: "Raw Seller",
        owner_phone: null,
        owner_email: null,
        owner_flags: {},
      } as any,
    );

    expect(clientFile.pinned).toBe(true);
    expect(clientFile.pinnedAt).toBe("2026-03-27T13:00:00Z");
    expect(clientFile.pinnedBy).toBe("user-3");
  });

  it("marks completed skip trace with persisted phone as skipped", () => {
    const result = deriveSkipTraceUiState({
      clientFile: {
        id: "lead-skip",
        propertyId: "prop-skip",
        apn: "1",
        county: "Spokane",
        address: "123 Main",
        city: "Spokane",
        state: "WA",
        zip: "99201",
        fullAddress: "123 Main, Spokane, WA 99201",
        ownerName: "Seller",
        ownerPhone: "+15095550123",
        ownerEmail: null,
        status: "lead",
        pinned: false,
        pinnedAt: null,
        pinnedBy: null,
        assignedTo: null,
        source: "manual",
        sourceListName: null,
        sourceVendor: null,
        tags: [],
        notes: null,
        promotedAt: null,
        lastContactAt: null,
        followUpDate: null,
        motivationLevel: null,
        sellerTimeline: null,
        conditionLevel: null,
        decisionMakerConfirmed: false,
        priceExpectation: null,
        qualificationRoute: null,
        occupancyScore: null,
        equityFlexibilityScore: null,
        qualificationScoreTotal: null,
        offerStatus: "none",
        complianceClean: true,
        compositeScore: 0,
        motivationScore: 0,
        dealScore: 0,
        scoreLabel: "unscored",
        aiBoost: 0,
        factors: [],
        modelVersion: null,
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        sqft: null,
        yearBuilt: null,
        lotSize: null,
        estimatedValue: null,
        equityPercent: null,
        availableEquity: null,
        totalLoanBalance: null,
        lastSalePrice: null,
        lastSaleDate: null,
        foreclosureStage: null,
        defaultAmount: null,
        delinquentAmount: null,
        isVacant: false,
        isAbsentee: false,
        isFreeClear: false,
        isHighEquity: false,
        isCashBuyer: false,
        ownerFlags: {},
        radarId: null,
        enriched: false,
        appointmentAt: null,
        offerAmount: null,
        contractAt: null,
        assignmentFeeProjected: null,
        attribution: null,
        nextCallScheduledAt: null,
        nextAction: null,
        nextActionDueAt: null,
        callSequenceStep: 0,
        totalCalls: 0,
        liveAnswers: 0,
        voicemailsLeft: 0,
        dispositionCode: null,
        skipTraceStatus: "completed",
        skipTraceCompletedAt: "2026-04-07T16:45:26.428Z",
        skipTraceLastError: null,
        prediction: null,
        monetizabilityScore: null,
        dispoFrictionLevel: null,
        decisionMakerNote: null,
        sellerSituationSummaryShort: null,
        recommendedCallAngle: null,
        topFact1: null,
        topFact2: null,
        topFact3: null,
        opportunityScore: null,
        contactabilityScore: null,
        confidenceScore: null,
        dossierUrl: null,
      },
    });

    expect(result.status).toBe("skipped");
  });

  it("defaults not interested to mark dead instead of nurture", () => {
    expect(OUTCOME_PRESET_DEFAULTS.not_interested).toBe("mark_dead");
    expect(OUTCOME_PRESET_DEFAULTS.do_not_call).toBe("mark_dead");
    expect(OUTCOME_PRESET_DEFAULTS.wrong_number).toBe("mark_dead");
    expect(OUTCOME_PRESET_DEFAULTS.disconnected).toBe("mark_dead");
  });

  it("maps closeout actions to explicit dead and active routes", () => {
    expect(routeForCloseoutAction("mark_dead")).toBe("dead");
    expect(routeForCloseoutAction("move_active")).toBe("follow_up");
    expect(routeForCloseoutAction("nurture_check_in")).toBe("nurture");
  });

  it("uses explicit success labels for terminal and active closeouts", () => {
    expect(closeoutSuccessMessage("mark_dead")).toBe("Marked Dead");
    expect(closeoutSuccessMessage("move_active")).toBe("Moved to Active");
  });

  it("defines grouped closeout presets for retry, field, stage, and terminal flows", () => {
    expect(CLOSEOUT_PRESET_GROUPS.map((group) => group.id)).toEqual([
      "retry_call",
      "field_follow_up",
      "stage_transitions",
      "terminal",
    ]);
    expect(CLOSEOUT_PRESET_GROUPS.find((group) => group.id === "stage_transitions")?.presetIds).toEqual([
      "move_active",
      "nurture_30_days",
      "nurture_90_days",
      "nurture_6_months",
    ]);
  });

  it("uses nurture-specific next action text for nurture presets", () => {
    expect(closeoutNextActionText("nurture_check_in", "nurture_30_days")).toBe("Nurture check-in in 30 days");
    expect(closeoutNextActionText("nurture_check_in", "nurture_90_days")).toBe("Nurture check-in in 90 days");
    expect(closeoutNextActionText("nurture_check_in", "nurture_6_months")).toBe("Nurture check-in in 6 months");
  });

  it("resolves a six-month nurture preset using a calendar-month offset", () => {
    const nurtureSixMonths = CLOSEOUT_PRESETS.find((preset) => preset.id === "nurture_6_months");
    expect(nurtureSixMonths).toBeTruthy();
    expect(resolveCloseoutPresetDateTimeLocal(nurtureSixMonths!)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
