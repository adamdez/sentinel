/**
 * Gold Datasets — Agent Test Fixtures
 *
 * Provides known-good input/output pairs for each agent.
 * Used for:
 * 1. Regression testing after prompt changes
 * 2. Validating agent outputs before production enable
 * 3. Scoring prompt quality over time
 *
 * Each dataset is a function that returns { input, expectedOutput, validationFn }.
 */

// ── Follow-Up Agent ─────────────────────────────────────────────────

export const followUpGoldDataset = [
  {
    name: "stale_seller_wa_call_only",
    input: {
      leadId: "test-lead-001",
      leadName: "Margaret Thompson",
      address: "4215 N Monroe St, Spokane WA 99205",
      phone: "+15091234567",
      email: null,
      status: "prospect",
      lastContactDays: 7,
      totalCalls: 2,
      liveAnswers: 1,
      state: "WA",
      sellerSituation: "Inherited property from mother. Lives in Seattle. Property vacant 6 months.",
      recommendedCallAngle: "Lead with empathy about managing inherited property from distance",
      topFacts: ["inherited_property", "out_of_state_owner", "vacant_6_months"],
    },
    expectedOutput: {
      channel: "call", // WA = call only
      urgencyScore: 7,
      shouldHaveDraft: true,
      draftShouldMention: ["inherited", "property", "mother"],
      draftShouldNotMention: ["wholesaling", "assignment", "investor"],
    },
    validate(output: Record<string, unknown>): { pass: boolean; reason: string } {
      if (output.channel !== "call") return { pass: false, reason: "WA leads must use call channel" };
      if (!output.body || typeof output.body !== "string") return { pass: false, reason: "Missing draft body" };
      const body = (output.body as string).toLowerCase();
      if (body.includes("wholesale") || body.includes("assignment")) {
        return { pass: false, reason: "Draft mentions wholesale terminology — violates tone rules" };
      }
      return { pass: true, reason: "OK" };
    },
  },
  {
    name: "stale_seller_id_auto_channel",
    input: {
      leadId: "test-lead-002",
      leadName: "Robert Chen",
      address: "1892 E Best Ave, Coeur d'Alene ID 83814",
      phone: "+12081234567",
      email: "rchen@email.com",
      status: "lead",
      lastContactDays: 10,
      totalCalls: 3,
      liveAnswers: 0,
      state: "ID",
      sellerSituation: "Tired landlord. 3 bad tenants in 2 years. Ready to be done.",
      recommendedCallAngle: "Acknowledge landlord fatigue. Position as exit strategy.",
      topFacts: ["tired_landlord", "multiple_evictions", "high_equity"],
    },
    expectedOutput: {
      channel: "sms", // ID + 0 live answers = try SMS
      urgencyScore: 6,
      shouldHaveDraft: true,
    },
    validate(output: Record<string, unknown>): { pass: boolean; reason: string } {
      // ID leads can use any channel
      if (!["call", "sms", "email"].includes(output.channel as string)) {
        return { pass: false, reason: "Invalid channel" };
      }
      return { pass: true, reason: "OK" };
    },
  },
];

// ── QA Agent ────────────────────────────────────────────────────────

export const qaGoldDataset = [
  {
    name: "good_call_nepq_approach",
    input: {
      callId: "test-call-001",
      transcript: `Logan: Hey Margaret, this is Logan with Dominion Home Deals. How are you doing today?
Margaret: I'm okay. I got your letter about the house on Monroe.
Logan: Oh great, yeah. What's going on with that property?
Margaret: Well, my mom passed away last year and I inherited it. I live in Seattle so it's been sitting there.
Logan: I'm sorry to hear about your mom. That's a tough situation, managing a property from that far away. How long has it been sitting vacant?
Margaret: About six months now. The neighbors are starting to complain about the yard.
Logan: Yeah, I can imagine that adds stress on top of everything else. What would it mean for you to not have to worry about that property anymore?
Margaret: Honestly it would be such a relief. I just don't know what it's worth.
Logan: That makes total sense. Well, here's what I can do — I can come take a look at the property this week and put together a fair offer for you. No obligation, no pressure. Would that work?
Margaret: That would be great actually.`,
      duration: 240,
      disposition: "appointment",
    },
    expectedOutput: {
      overallScore: 8, // min 7 for good call
      nepqAdherence: "strong",
      shouldFlagIssues: false,
      strengths: ["empathy", "situation_questions", "low_pressure_close"],
    },
    validate(output: Record<string, unknown>): { pass: boolean; reason: string } {
      const score = output.overallScore as number;
      if (score < 6) return { pass: false, reason: `Score ${score} too low for clearly good call` };
      if (score > 10) return { pass: false, reason: `Score ${score} exceeds max` };
      return { pass: true, reason: "OK" };
    },
  },
  {
    name: "bad_call_pushy_pitch",
    input: {
      callId: "test-call-002",
      transcript: `Logan: Hi this is Logan, I buy houses in Spokane. Is this Robert?
Robert: Yeah, what do you want?
Logan: I'm calling because we can close on your property in 7 days cash. We've bought 50 houses this year. What's your asking price?
Robert: I haven't decided to sell.
Logan: Well the market is going down so now is the best time. We can offer you 70% of market value and close next week. What do you say?
Robert: That sounds low. I'm not interested.
Logan: Okay but you're going to regret it when prices drop another 10%. Let me send you our offer.
Robert: Don't call me again. *click*`,
      duration: 60,
      disposition: "not_interested",
    },
    expectedOutput: {
      overallScore: 2, // max 3 for pushy call
      nepqAdherence: "poor",
      shouldFlagIssues: true,
      issues: ["no_rapport", "price_anchoring", "pressure_tactics", "market_scare"],
    },
    validate(output: Record<string, unknown>): { pass: boolean; reason: string } {
      const score = output.overallScore as number;
      if (score > 4) return { pass: false, reason: `Score ${score} too high for clearly bad call` };
      const flagged = output.shouldFlagIssues ?? output.flagged;
      if (!flagged) return { pass: false, reason: "Should flag quality issues on pushy call" };
      return { pass: true, reason: "OK" };
    },
  },
];

// ── Dispo Agent ─────────────────────────────────────────────────────

export const dispoGoldDataset = [
  {
    name: "strong_fix_flip_candidate",
    input: {
      dealId: "test-deal-001",
      propertyAddress: "2847 E 5th Ave, Spokane WA 99202",
      arv: 285000,
      repairEstimate: 42000,
      contractPrice: 155000,
      assignmentFee: 12000,
      propertyType: "SFR",
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1650,
      yearBuilt: 1955,
      condition: "Needs new roof, kitchen update, cosmetic throughout",
      neighborhood: "East Central Spokane",
    },
    expectedOutput: {
      buyerType: "fix_and_flip",
      shouldMatchBuyers: true,
      minBuyersToContact: 3,
    },
    validate(output: Record<string, unknown>): { pass: boolean; reason: string } {
      if (!output.buyerType) return { pass: false, reason: "Missing buyer type classification" };
      return { pass: true, reason: "OK" };
    },
  },
];

// ── Research Agent ──────────────────────────────────────────────────

export const researchGoldDataset = [
  {
    name: "spokane_inherited_property",
    input: {
      leadId: "test-lead-003",
      ownerName: "Margaret Thompson",
      propertyAddress: "4215 N Monroe St, Spokane WA 99205",
      county: "Spokane",
      state: "WA",
    },
    expectedOutput: {
      shouldCreateArtifacts: true,
      shouldExtractFacts: true,
      minFactCount: 2,
      factFieldsShouldInclude: ["property_records", "owner_background"],
    },
    validate(output: Record<string, unknown>): { pass: boolean; reason: string } {
      const artifacts = output.artifactsCreated as number ?? 0;
      if (artifacts === 0) return { pass: false, reason: "No artifacts created" };
      return { pass: true, reason: "OK" };
    },
  },
];

// ── Exception Agent ─────────────────────────────────────────────────

export const exceptionGoldDataset = [
  {
    name: "lead_missing_next_action",
    input: {
      leadId: "test-lead-004",
      status: "prospect",
      nextAction: null,
      lastContactDays: 3,
      createdDays: 14,
    },
    expectedOutput: {
      shouldFlag: true,
      severity: "high",
      exceptionType: "missing_next_action",
    },
    validate(output: Record<string, unknown>): { pass: boolean; reason: string } {
      if (!output.shouldFlag) return { pass: false, reason: "Should flag prospect with no next_action" };
      return { pass: true, reason: "OK" };
    },
  },
];

// ── Ads Monitor Agent ───────────────────────────────────────────────

export const adsMonitorGoldDataset = [
  {
    name: "high_cpl_campaign",
    input: {
      campaignId: "test-campaign-001",
      campaignName: "Spokane Cash Buyers",
      spend7d: 850,
      leads7d: 2,
      costPerLead: 425,
      targetCpl: 150,
      impressionShare: 0.35,
      clickThroughRate: 0.028,
    },
    expectedOutput: {
      shouldAlert: true,
      alertSeverity: "high",
      recommendation: "pause_or_restructure",
    },
    validate(output: Record<string, unknown>): { pass: boolean; reason: string } {
      if (!output.shouldAlert) return { pass: false, reason: "Should alert on CPL 3x over target" };
      return { pass: true, reason: "OK" };
    },
  },
];

// ── Export all datasets ─────────────────────────────────────────────

export const ALL_GOLD_DATASETS = {
  "follow-up": followUpGoldDataset,
  "qa": qaGoldDataset,
  "dispo": dispoGoldDataset,
  "research": researchGoldDataset,
  "exception": exceptionGoldDataset,
  "ads-monitor": adsMonitorGoldDataset,
};

/**
 * Run all gold dataset validations for an agent.
 * Returns pass/fail results for each test case.
 */
export function validateAgentOutput(
  agentName: string,
  testName: string,
  output: Record<string, unknown>,
): { pass: boolean; reason: string } | null {
  const dataset = ALL_GOLD_DATASETS[agentName as keyof typeof ALL_GOLD_DATASETS];
  if (!dataset) return null;

  const testCase = dataset.find((t) => t.name === testName);
  if (!testCase) return null;

  return testCase.validate(output);
}
