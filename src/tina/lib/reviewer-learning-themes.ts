import type { TinaReviewerLearningTheme } from "@/tina/lib/acceleration-contracts";

export const TINA_REVIEWER_LEARNING_THEME_CONFIG: Record<
  TinaReviewerLearningTheme,
  {
    label: string;
    ownerEngines: string[];
    fixtureId: string | null;
    recommendedChange: string;
    queuedConfidenceImpact: string;
    anchoredConfidenceImpact: string;
    queuedTargetBehavior: string;
    anchoredTargetBehavior: string;
  }
> = {
  ownership_transition: {
    label: "ownership-transition proof",
    ownerEngines: [
      "start-path",
      "entity-record-matrix",
      "entity-economics-readiness",
      "entity-return-runbook",
    ],
    fixtureId: "buyout-year",
    recommendedChange:
      "Keep ownership-transition files under reviewer control until owner, buyout, and former-owner payment proof is coherent.",
    queuedConfidenceImpact:
      "Downgrade route and entity-treatment posture to reviewer-controlled until ownership-transition proof is settled.",
    anchoredConfidenceImpact:
      "When ownership-transition proof is coherent and approved, Tina can preserve that pattern as a reusable trust anchor.",
    queuedTargetBehavior:
      "Buyout-year and other ownership-transition files should stay reviewer-controlled until the owner/economics story is coherent.",
    anchoredTargetBehavior:
      "Approved ownership-transition patterns should stay stable without laundering away real buyout or former-owner facts.",
  },
  sales_tax_authority: {
    label: "sales-tax authority posture",
    ownerEngines: [
      "authority-position-matrix",
      "planning-action-board",
      "tax-planning-memo",
      "disclosure-readiness",
    ],
    fixtureId: "sales-tax-authority",
    recommendedChange:
      "Only advance sales-tax exclusion planning when authority work is reviewer-backed and disclosure posture is clear.",
    queuedConfidenceImpact:
      "Keep sales-tax treatment and planning claims under reviewer control until authority support is explicit.",
    anchoredConfidenceImpact:
      "Reviewer-backed sales-tax positions can be promoted more confidently when the same fact pattern recurs.",
    queuedTargetBehavior:
      "Sales-tax files should not move into advance/use posture without reviewer-backed authority support.",
    anchoredTargetBehavior:
      "Authority-backed sales-tax files should keep their stronger planning and treatment posture in future runs.",
  },
  depreciation_assets: {
    label: "depreciation and asset support",
    ownerEngines: [
      "companion-form-calculations",
      "attachment-schedules",
      "official-form-execution",
    ],
    fixtureId: "heavy-depreciation-year",
    recommendedChange:
      "Require asset rollforward, placed-in-service, and Form 4562 support before depreciation posture sounds ready.",
    queuedConfidenceImpact:
      "Downgrade depreciation execution and companion-form posture until asset history is explicit.",
    anchoredConfidenceImpact:
      "Reviewer-approved asset support can keep future depreciation years from starting at zero confidence.",
    queuedTargetBehavior:
      "Heavy depreciation files should stay provisional until the asset history and Form 4562 support are coherent.",
    anchoredTargetBehavior:
      "Asset-heavy files with reviewer-approved support should remain stable through the execution stack.",
  },
  inventory_cogs: {
    label: "inventory and COGS support",
    ownerEngines: ["books-reconciliation", "attachment-schedules", "official-form-execution"],
    fixtureId: "inventory-heavy-retailer",
    recommendedChange:
      "Require count support and a COGS rollforward before inventory-heavy files sound execution-ready.",
    queuedConfidenceImpact:
      "Keep inventory-heavy files provisional until counts, rollforwards, and method support reconcile.",
    anchoredConfidenceImpact:
      "Reviewer-approved inventory support can keep retail files from relitigating the same COGS posture each run.",
    queuedTargetBehavior:
      "Inventory-heavy retailer files should not sound reviewer-ready without count and rollforward support.",
    anchoredTargetBehavior:
      "Approved retail inventory patterns should persist as stable execution assumptions when facts match.",
  },
  worker_classification: {
    label: "worker classification posture",
    ownerEngines: ["books-reconstruction", "tax-treatment-policy", "treatment-judgment"],
    fixtureId: "payroll-contractor-overlap",
    recommendedChange:
      "Hold payroll and contractor overlap under review until worker classification and reclasses reconcile cleanly.",
    queuedConfidenceImpact:
      "Downgrade treatment confidence when payroll and 1099 labor still overlap or reclassify unpredictably.",
    anchoredConfidenceImpact:
      "Reviewer-approved worker-classification resolutions can tighten future labor files faster.",
    queuedTargetBehavior:
      "Payroll-plus-contractor overlap files should stay review-heavy until the labor boundary is explicit.",
    anchoredTargetBehavior:
      "Approved labor-boundary resolutions should stay reusable for similar future crew files.",
  },
  related_party: {
    label: "related-party and intercompany treatment",
    ownerEngines: ["books-reconstruction", "treatment-judgment", "authority-position-matrix"],
    fixtureId: "related-party-payments",
    recommendedChange:
      "Escalate related-party and intercompany flows until agreements, purpose, and treatment are explicit.",
    queuedConfidenceImpact:
      "Keep related-party treatment and evidence posture under reviewer control until the business purpose is explicit.",
    anchoredConfidenceImpact:
      "Reviewer-approved related-party handling can stabilize future similar flows when the agreements match.",
    queuedTargetBehavior:
      "Related-party payment files should not sound ordinary until the agreements and treatment posture are explicit.",
    anchoredTargetBehavior:
      "Approved related-party handling should remain reusable for matching agreement-driven facts.",
  },
  mixed_use: {
    label: "mixed-use allocation support",
    ownerEngines: ["tax-treatment-policy", "attachment-schedules", "books-reconstruction"],
    fixtureId: "mixed-use-home-office-vehicle",
    recommendedChange:
      "Keep mixed-use travel, home-office, and vehicle claims provisional until business-use allocation is defensible.",
    queuedConfidenceImpact:
      "Downgrade mixed-use deductions to reviewer-controlled posture until allocation support is explicit.",
    anchoredConfidenceImpact:
      "Reviewer-approved mixed-use allocations can become reusable support patterns when the records match.",
    queuedTargetBehavior:
      "Mixed-use home-office and vehicle files should stay provisional until allocation support is defensible.",
    anchoredTargetBehavior:
      "Approved mixed-use allocation patterns should remain stable in future matching files.",
  },
  snapshot_drift: {
    label: "snapshot drift governance",
    ownerEngines: ["case-memory-ledger", "package-state", "confidence-calibration"],
    fixtureId: "drifted-package",
    recommendedChange:
      "Invalidate reviewer anchors everywhere when post-signoff drift changes the live package story.",
    queuedConfidenceImpact:
      "Treat prior reviewer approval as stale until Tina captures a new immutable snapshot and reruns signoff.",
    anchoredConfidenceImpact:
      "Stable reviewer anchors can safely keep future packet truth compact when no drift exists.",
    queuedTargetBehavior:
      "Drifted packages should reopen reviewer signoff and surface stale-trust warnings across every reviewer artifact.",
    anchoredTargetBehavior:
      "Stable approved anchors should stay durable until the live package actually changes.",
  },
  unknown_route: {
    label: "route conflict handling",
    ownerEngines: ["unknown-pattern-engine", "start-path", "federal-return-classification"],
    fixtureId: "prior-return-drift",
    recommendedChange:
      "Preserve competing lane hypotheses when current election or route papers conflict with older return history.",
    queuedConfidenceImpact:
      "Keep route and reviewer-acceptance posture under reviewer control while competing lane hypotheses remain live.",
    anchoredConfidenceImpact:
      "Reviewer-approved route resolutions can help Tina recognize the same cross-year election drift sooner.",
    queuedTargetBehavior:
      "Prior-return drift and election-conflict files should preserve competing lane hypotheses instead of collapsing to the nearest route.",
    anchoredTargetBehavior:
      "Approved route resolutions should remain reusable when the same election conflict pattern appears again.",
  },
  general_review_control: {
    label: "general reviewer control",
    ownerEngines: [
      "confidence-calibration",
      "reviewer-acceptance-forecast",
      "planning-action-board",
    ],
    fixtureId: null,
    recommendedChange:
      "Keep reviewer-controlled posture until override reasons are absorbed into policy and regression coverage.",
    queuedConfidenceImpact:
      "Do not widen Tina's certainty language until the reviewer-driven lesson is absorbed into policy.",
    anchoredConfidenceImpact:
      "Reviewer-approved patterns can become compact reusable guardrails even when the theme is broad.",
    queuedTargetBehavior:
      "Unclassified reviewer overrides should still stay visible and preserve reviewer-controlled posture.",
    anchoredTargetBehavior:
      "Approved broad reviewer lessons should remain visible as reusable trust anchors.",
  },
};

export const TINA_REVIEWER_THEME_BENCHMARK_SCENARIOS: Record<
  TinaReviewerLearningTheme,
  string[]
> = {
  ownership_transition: ["midyear-ownership-change", "basisless-distributions"],
  sales_tax_authority: ["multi-state-entity-registration"],
  depreciation_assets: ["capitalization-vs-expense", "disposed-assets-no-basis"],
  inventory_cogs: ["inventory-with-weak-tracking"],
  worker_classification: ["contractor-vs-employee", "missing-w9-1099"],
  related_party: ["personal-helpers-through-business"],
  mixed_use: ["mixed-use-vehicles", "mixed-personal-business-spend"],
  snapshot_drift: ["prior-returns-vs-current-books-drift"],
  unknown_route: [
    "single-member-llc-unclear-tax",
    "late-missing-s-election",
    "entity-changed-books-never-caught-up",
  ],
  general_review_control: ["years-of-missed-filings"],
};

export function inferTinaReviewerLearningTheme(text: string): TinaReviewerLearningTheme {
  const normalized = text.toLowerCase();

  if (
    normalized.includes("drift") ||
    normalized.includes("stale") ||
    normalized.includes("signoff") ||
    normalized.includes("fingerprint")
  ) {
    return "snapshot_drift";
  }

  if (
    normalized.includes("ownership") ||
    normalized.includes("member") ||
    normalized.includes("partner") ||
    normalized.includes("buyout") ||
    normalized.includes("redemption") ||
    normalized.includes("former owner") ||
    normalized.includes("owner payment") ||
    normalized.includes("capital")
  ) {
    return "ownership_transition";
  }

  if (
    normalized.includes("route") ||
    normalized.includes("election") ||
    normalized.includes("2553") ||
    normalized.includes("1120") ||
    normalized.includes("1065") ||
    normalized.includes("schedule c") ||
    normalized.includes("lane")
  ) {
    return "unknown_route";
  }

  if (
    normalized.includes("sales tax") ||
    normalized.includes("marketplace") ||
    normalized.includes("remittance")
  ) {
    return "sales_tax_authority";
  }

  if (
    normalized.includes("depreciation") ||
    normalized.includes("asset") ||
    normalized.includes("section 179") ||
    normalized.includes("4562")
  ) {
    return "depreciation_assets";
  }

  if (
    normalized.includes("inventory") ||
    normalized.includes("cogs") ||
    normalized.includes("cost of goods")
  ) {
    return "inventory_cogs";
  }

  if (
    normalized.includes("payroll") ||
    normalized.includes("1099") ||
    normalized.includes("contractor") ||
    normalized.includes("w-2") ||
    normalized.includes("worker")
  ) {
    return "worker_classification";
  }

  if (
    normalized.includes("related-party") ||
    normalized.includes("related party") ||
    normalized.includes("intercompany") ||
    normalized.includes("family management")
  ) {
    return "related_party";
  }

  if (
    normalized.includes("mixed use") ||
    normalized.includes("home office") ||
    normalized.includes("vehicle") ||
    normalized.includes("mileage") ||
    normalized.includes("travel")
  ) {
    return "mixed_use";
  }

  return "general_review_control";
}
