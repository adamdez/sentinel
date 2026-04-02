export type TinaResearchSourceClass =
  | "primary_authority"
  | "secondary_analysis"
  | "internal_signal"
  | "community_lead"
  | "low_trust_lead"
  | "unknown";

export type TinaResearchDecisionBucket =
  | "authoritative_and_usable"
  | "usable_with_disclosure"
  | "interesting_but_unsupported"
  | "reject";

export interface TinaResearchSourceAssessment {
  sourceClass: TinaResearchSourceClass;
  allowDiscovery: boolean;
  allowAuthoritySupport: boolean;
  summary: string;
}

export interface TinaTaxIdeaEvaluationInput {
  sourceClasses: TinaResearchSourceClass[];
  hasPrimaryAuthority: boolean;
  hasSubstantialAuthority: boolean;
  hasReasonableBasis: boolean;
  needsDisclosure: boolean;
  isTaxShelterLike: boolean;
  isFrivolous: boolean;
}

export interface TinaTaxIdeaDecision {
  bucket: TinaResearchDecisionBucket;
  allowReturnImpact: boolean;
  requireHumanReview: boolean;
  requirePrimaryAuthority: boolean;
  summary: string;
  nextStep: string;
}

const PRIMARY_AUTHORITY_DOMAINS = [
  "irs.gov",
  "treasury.gov",
  "dor.wa.gov",
  "ecfr.gov",
  "federalregister.gov",
  "govinfo.gov",
  "congress.gov",
  "uscode.house.gov",
  "uscourts.gov",
  "supremecourt.gov",
  "ustaxcourt.gov",
];

const SECONDARY_ANALYSIS_DOMAINS = [
  "thetaxadviser.com",
  "journalofaccountancy.com",
  "taxfoundation.org",
  "bdo.com",
  "deloitte.com",
  "ey.com",
  "kpmg.com",
  "pwc.com",
];

const COMMUNITY_LEAD_DOMAINS = [
  "reddit.com",
  "x.com",
  "twitter.com",
  "news.ycombinator.com",
];

const LOW_TRUST_LEAD_DOMAINS = [
  "4chan.org",
  "boards.4chan.org",
  "8kun.top",
  "pastebin.com",
];

function normalizeUrlHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function classifyTinaResearchSource(url: string): TinaResearchSourceAssessment {
  const host = normalizeUrlHost(url);

  if (!host) {
    return {
      sourceClass: "unknown",
      allowDiscovery: false,
      allowAuthoritySupport: false,
      summary: "Tina could not confidently classify this source yet.",
    };
  }

  if (PRIMARY_AUTHORITY_DOMAINS.some((domain) => matchesDomain(host, domain))) {
    return {
      sourceClass: "primary_authority",
      allowDiscovery: true,
      allowAuthoritySupport: true,
      summary: "This source can support authority review when the content is relevant and current.",
    };
  }

  if (SECONDARY_ANALYSIS_DOMAINS.some((domain) => matchesDomain(host, domain))) {
    return {
      sourceClass: "secondary_analysis",
      allowDiscovery: true,
      allowAuthoritySupport: false,
      summary: "This source is useful for research and framing, but not as final filing authority.",
    };
  }

  if (host === "tina.internal") {
    return {
      sourceClass: "internal_signal",
      allowDiscovery: true,
      allowAuthoritySupport: false,
      summary: "This lead came from Tina's own organizer answers or extracted paper facts.",
    };
  }

  if (COMMUNITY_LEAD_DOMAINS.some((domain) => matchesDomain(host, domain))) {
    return {
      sourceClass: "community_lead",
      allowDiscovery: true,
      allowAuthoritySupport: false,
      summary: "This source may surface ideas, but Tina must validate them with primary authority before using them.",
    };
  }

  if (LOW_TRUST_LEAD_DOMAINS.some((domain) => matchesDomain(host, domain))) {
    return {
      sourceClass: "low_trust_lead",
      allowDiscovery: true,
      allowAuthoritySupport: false,
      summary: "This source is discovery-only and should be treated as very low trust.",
    };
  }

  return {
    sourceClass: "unknown",
    allowDiscovery: true,
    allowAuthoritySupport: false,
    summary: "Tina may inspect this source for ideas, but it does not count as filing authority by default.",
  };
}

export function evaluateTinaTaxIdea(input: TinaTaxIdeaEvaluationInput): TinaTaxIdeaDecision {
  const hasOnlyLowTrustInputs =
    input.sourceClasses.length > 0 &&
    input.sourceClasses.every((sourceClass) => sourceClass === "low_trust_lead");
  const hasAnyDiscoveryInput = input.sourceClasses.some(
    (sourceClass) =>
      sourceClass === "internal_signal" ||
      sourceClass === "community_lead" ||
      sourceClass === "low_trust_lead" ||
      sourceClass === "secondary_analysis"
  );

  if (input.isFrivolous) {
    return {
      bucket: "reject",
      allowReturnImpact: false,
      requireHumanReview: true,
      requirePrimaryAuthority: true,
      summary: "This idea should be rejected because it looks frivolous or plainly unsafe.",
      nextStep: "Keep it out of the return and do not spend more model effort on it.",
    };
  }

  if (input.isTaxShelterLike) {
    return {
      bucket: "interesting_but_unsupported",
      allowReturnImpact: false,
      requireHumanReview: true,
      requirePrimaryAuthority: true,
      summary:
        "This idea has shelter-like characteristics, so Tina should not let it change return values automatically.",
      nextStep:
        "Route this to elevated human review with primary authority support before any return-impact decision.",
    };
  }

  if (input.hasPrimaryAuthority && input.hasSubstantialAuthority && !input.needsDisclosure) {
    return {
      bucket: "authoritative_and_usable",
      allowReturnImpact: true,
      requireHumanReview: true,
      requirePrimaryAuthority: true,
      summary: "This idea is supported strongly enough to move into Tina's filing workflow.",
      nextStep: "Attach the primary authority, explain why it fits the taxpayer's facts, and route it through review.",
    };
  }

  if (
    input.hasPrimaryAuthority &&
    input.hasReasonableBasis &&
    input.needsDisclosure &&
    !input.isTaxShelterLike
  ) {
    return {
      bucket: "usable_with_disclosure",
      allowReturnImpact: true,
      requireHumanReview: true,
      requirePrimaryAuthority: true,
      summary: "This idea may be usable, but only with elevated review and disclosure handling.",
      nextStep: "Prepare the authority memo, confirm disclosure handling, and require explicit human approval.",
    };
  }

  if (hasOnlyLowTrustInputs || (hasAnyDiscoveryInput && !input.hasPrimaryAuthority)) {
    return {
      bucket: "interesting_but_unsupported",
      allowReturnImpact: false,
      requireHumanReview: true,
      requirePrimaryAuthority: true,
      summary: "This idea is worth researching, but it is not ready to touch the return.",
      nextStep: "Keep it in Tina's idea queue until primary authority proves or kills it.",
    };
  }

  return {
    bucket: "reject",
    allowReturnImpact: false,
    requireHumanReview: true,
    requirePrimaryAuthority: true,
    summary: "This idea should stay out of the return because the support is too weak or incomplete.",
    nextStep: "Do not use it unless Tina later finds primary authority that changes the result.",
  };
}

export function describeTinaResearchPolicy(): string[] {
  return [
    "Tina may search widely for ideas, including community sources, but those ideas start as untrusted leads.",
    "Only primary authority can move a tax idea into Tina's filing workflow.",
    "Anything that needs disclosure, sits near the edge, or lacks strong support must go through human review.",
    "Low-trust sources may inspire research, but they never count as filing support.",
  ];
}
