/**
 * Absentee-landlord dossier — derivation logic
 *
 * Given artifacts captured for an absentee-landlord lead, this module
 * derives a structured operator brief with landlord-specific signal categories.
 *
 * Design rules:
 *   - All derivation is deterministic keyword + type matching against artifact notes
 *   - Confidence labels are tied directly to source type + evidence quality
 *   - Every derived signal is traceable back to at least one artifact
 *   - No direct write to lead fields — output feeds the reviewable dossier contract
 *
 * Brief fields (v1):
 *   mailingMismatch       — assessor-confirmed out-of-state/different mailing address
 *   ownershipTenure       — ownership duration signal if detectable
 *   tenantContext         — tenant-occupied clues (rental listing, PM record, etc.)
 *   fatigueIndicators     — management fatigue signals (long tenure, deferred maintenance, PM switch)
 *   burdenContext         — tax delinquency, code violations, financial friction signals
 *   callAngle             — suggested opening context based on available signals
 *
 * BOUNDARY: zero imports. Pure TypeScript logic only.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AbsenteeDossierConfidence = "confirmed" | "strong" | "probable" | "possible";

export interface AbsenteeDossierSignal {
  label:       string;
  detail:      string;
  confidence:  AbsenteeDossierConfidence;
  sourceLabel: string;
  sourceUrl?:  string;
}

export interface AbsenteeDossierBrief {
  dossierType:          "absentee_landlord";

  // Mailing address mismatch — out-of-area owner
  mailingMismatch:      AbsenteeDossierSignal | null;

  // How long the owner has held the property (if capturable from notes)
  ownershipTenure:      AbsenteeDossierSignal | null;

  // Tenant / occupancy context
  tenantContext:        AbsenteeDossierSignal | null;

  // Management fatigue indicators (long tenure + signs of stress)
  fatigueIndicators:    AbsenteeDossierSignal[];

  // Financial / burden signals (tax delinquency, code violations)
  burdenContext:        AbsenteeDossierSignal[];

  // Suggested call angle based on which signals are present
  callAngle:            string;

  // Verification items still needed before calling
  verificationChecklist: Array<{ item: string; sourceLabel: string }>;

  // All artifacts that contributed to this brief
  sourceArtifactCount:  number;
}

// ─────────────────────────────────────────────────────────────
// Input shape
// ─────────────────────────────────────────────────────────────

export interface AbsentiArtifactInput {
  id:             string;
  source_type:    string;
  source_label:   string | null;
  source_url:     string | null;
  extracted_notes: string | null;
  captured_at:    string;
}

// ─────────────────────────────────────────────────────────────
// Keyword sets
// ─────────────────────────────────────────────────────────────

const MAILING_MISMATCH_KW = [
  "mailing address", "mail to", "different address", "out of state", "out-of-state",
  "owner address", "mailing differs", "absentee", "non-owner", "owner not local",
];

const TENANT_KW = [
  "tenant", "renter", "occupied", "lease", "month-to-month", "rental", "for rent",
  "listed for rent", "management company", "property manager", "pm manages",
];

const FATIGUE_KW = [
  "years", "decades", "long-term", "longtime", "long time", "tired", "ready to sell",
  "doesn't want to deal", "wants out", "deferred", "neglected", "not maintaining",
  "self-managed", "switching management", "frustrated", "done with it",
];

const BURDEN_KW = [
  "delinquent", "delinquency", "tax lien", "back taxes", "owed", "violation",
  "code violation", "citation", "fines", "judgment", "behind on taxes",
];

const OWNERSHIP_YEAR_PATTERNS = [
  /(\d{4})\s*[\-–]\s*present/i,
  /owned\s+since\s+(\d{4})/i,
  /purchased\s+in\s+(\d{4})/i,
  /(\d{4})\s+purchase/i,
  /(\d+)\s+year[s]?\s+(?:of\s+)?ownership/i,
  /(\d+)\s+year[s]?\s+ago/i,
];

function hasKeyword(text: string, keywords: string[]): string | null {
  const lower = text.toLowerCase();
  return keywords.find((kw) => lower.includes(kw)) ?? null;
}

function extractOwnershipYear(text: string): number | null {
  for (const pat of OWNERSHIP_YEAR_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      const val = parseInt(m[1], 10);
      if (val > 1900 && val <= new Date().getFullYear()) return val;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Signal derivers
// ─────────────────────────────────────────────────────────────

function deriveMailing(artifacts: AbsentiArtifactInput[]): AbsenteeDossierSignal | null {
  // Explicit mailing mismatch source type gets highest confidence
  const explicit = artifacts.find((a) => a.source_type === "mailing_address_mismatch");
  if (explicit) {
    return {
      label:       "Mailing address mismatch confirmed",
      detail:      explicit.extracted_notes
        ?? "Assessor record shows owner mailing address differs from property address.",
      confidence:  "confirmed",
      sourceLabel: explicit.source_label ?? "Assessor mailing record",
      sourceUrl:   explicit.source_url ?? undefined,
    };
  }

  // Fallback: keyword in any artifact notes
  const kw = artifacts.find((a) =>
    a.extracted_notes && hasKeyword(a.extracted_notes, MAILING_MISMATCH_KW)
  );
  if (kw) {
    const matched = hasKeyword(kw.extracted_notes!, MAILING_MISMATCH_KW)!;
    return {
      label:       "Out-of-area owner (probable)",
      detail:      `Notes mention "${matched}" — suggests owner does not live at the property. Keyword match; verify with assessor record.`,
      confidence:  "probable",
      sourceLabel: kw.source_label ?? kw.source_type,
      sourceUrl:   kw.source_url ?? undefined,
    };
  }

  return null;
}

function deriveTenure(artifacts: AbsentiArtifactInput[], nowYear: number): AbsenteeDossierSignal | null {
  for (const a of artifacts) {
    if (!a.extracted_notes) continue;
    const year = extractOwnershipYear(a.extracted_notes);
    if (year) {
      const years = nowYear - year;
      const confidence: AbsenteeDossierConfidence = years >= 10 ? "strong" : "probable";
      return {
        label:       `~${years} year ownership`,
        detail:      `Estimated ownership since ${year} (${years} years). ${years >= 15 ? "Long-tenure owners are statistically more open to fatigue-based conversations." : "Moderate tenure — worth exploring management fatigue."}`,
        confidence,
        sourceLabel: a.source_label ?? a.source_type,
        sourceUrl:   a.source_url ?? undefined,
      };
    }
    // Try plain year-range keywords if no structured match
    if (hasKeyword(a.extracted_notes, ["years", "decades", "long-term", "longtime"])) {
      return {
        label:       "Long-term ownership indicated",
        detail:      "Notes suggest long-term ownership. Extract the purchase year from assessor records for a more precise tenure estimate.",
        confidence:  "possible",
        sourceLabel: a.source_label ?? a.source_type,
      };
    }
  }
  return null;
}

function deriveTenantContext(artifacts: AbsentiArtifactInput[]): AbsenteeDossierSignal | null {
  // Rental listing or PM record = high confidence
  const explicit = artifacts.find((a) =>
    a.source_type === "rental_listing" || a.source_type === "property_management_record"
  );
  if (explicit) {
    const isPM  = explicit.source_type === "property_management_record";
    return {
      label:       isPM ? "Property manager confirmed" : "Active rental listing found",
      detail:      explicit.extracted_notes
        ?? (isPM
          ? "A property management company is handling this property. Seller may want to exit the landlord role entirely."
          : "Property is currently listed for rent. Confirms tenant-occupied status and ongoing landlord obligations."),
      confidence:  "confirmed",
      sourceLabel: explicit.source_label ?? explicit.source_type,
      sourceUrl:   explicit.source_url ?? undefined,
    };
  }

  // Keyword fallback
  const kw = artifacts.find((a) =>
    a.extracted_notes && hasKeyword(a.extracted_notes, TENANT_KW)
  );
  if (kw) {
    const matched = hasKeyword(kw.extracted_notes!, TENANT_KW)!;
    return {
      label:       "Tenant-occupied (probable)",
      detail:      `Notes mention "${matched}" — suggests active tenant or rental use. Confirm current lease status before calling.`,
      confidence:  "probable",
      sourceLabel: kw.source_label ?? kw.source_type,
      sourceUrl:   kw.source_url ?? undefined,
    };
  }

  return null;
}

function deriveFatigue(artifacts: AbsentiArtifactInput[]): AbsenteeDossierSignal[] {
  const signals: AbsenteeDossierSignal[] = [];

  for (const a of artifacts) {
    if (!a.extracted_notes) continue;
    const matched = hasKeyword(a.extracted_notes, FATIGUE_KW);
    if (!matched) continue;
    // Avoid duplicating the same signal from different artifacts
    const alreadyCovered = signals.some((s) => s.label.toLowerCase().includes(matched));
    if (alreadyCovered) continue;

    signals.push({
      label:       `Fatigue signal: "${matched}"`,
      detail:      `Notes mention "${matched}" — a potential management or ownership fatigue indicator. Use as a conversation opener, not a leading statement.`,
      confidence:  "possible",
      sourceLabel: a.source_label ?? a.source_type,
      sourceUrl:   a.source_url ?? undefined,
    });

    if (signals.length >= 3) break; // cap at 3 to avoid noise
  }

  return signals;
}

function deriveBurden(artifacts: AbsentiArtifactInput[]): AbsenteeDossierSignal[] {
  const signals: AbsenteeDossierSignal[] = [];

  const taxRecord = artifacts.find((a) => a.source_type === "tax_delinquency");
  if (taxRecord) {
    signals.push({
      label:       "Tax delinquency on record",
      detail:      taxRecord.extracted_notes
        ?? "County tax delinquency record found. Clear financial burden signal — owner is behind on property taxes.",
      confidence:  "confirmed",
      sourceLabel: taxRecord.source_label ?? "Tax delinquency record",
      sourceUrl:   taxRecord.source_url ?? undefined,
    });
  }

  for (const a of artifacts) {
    if (!a.extracted_notes) continue;
    if (a.source_type === "tax_delinquency") continue; // already handled
    const matched = hasKeyword(a.extracted_notes, BURDEN_KW);
    if (!matched) continue;
    signals.push({
      label:       `Burden signal: "${matched}"`,
      detail:      `Notes mention "${matched}" — indicates financial or compliance burden. Verify specifics before referencing in a call.`,
      confidence:  "probable",
      sourceLabel: a.source_label ?? a.source_type,
      sourceUrl:   a.source_url ?? undefined,
    });
    if (signals.length >= 3) break;
  }

  return signals;
}

function buildCallAngle(
  mailing:  AbsenteeDossierSignal | null,
  tenant:   AbsenteeDossierSignal | null,
  fatigue:  AbsenteeDossierSignal[],
  burden:   AbsenteeDossierSignal[],
): string {
  const parts: string[] = [];

  if (burden.length > 0 && burden[0].confidence === "confirmed") {
    parts.push("Open with financial relief framing — tax or code burden has been confirmed.");
  }
  if (tenant && tenant.confidence === "confirmed") {
    parts.push("Acknowledge the tenant-management reality — ask how the current lease situation is going.");
  } else if (tenant) {
    parts.push("Probe occupancy early — ask if the property is currently rented.");
  }
  if (mailing && (mailing.confidence === "confirmed" || mailing.confidence === "strong")) {
    parts.push("Mention the out-of-area context naturally — managing remotely is a genuine pain point.");
  }
  if (fatigue.length > 0) {
    parts.push("Listen for fatigue language — don't lead with it, but reflect it back if the seller uses it.");
  }
  if (parts.length === 0) {
    parts.push("Standard absentee opening: confirm ownership, ask how management of the property has been going.");
  }

  return parts.join(" ");
}

function buildVerificationChecklist(
  artifacts: AbsentiArtifactInput[],
  mailing:   AbsenteeDossierSignal | null,
  tenant:    AbsenteeDossierSignal | null,
  tenure:    AbsenteeDossierSignal | null,
): Array<{ item: string; sourceLabel: string }> {
  const checklist: Array<{ item: string; sourceLabel: string }> = [];

  if (!mailing || mailing.confidence !== "confirmed") {
    checklist.push({
      item:        "Verify mailing address mismatch via assessor record",
      sourceLabel: "Assessor",
    });
  }
  if (!tenant || tenant.confidence !== "confirmed") {
    checklist.push({
      item:        "Confirm current occupancy status (tenant-occupied vs. vacant)",
      sourceLabel: "Rental listing or direct inquiry",
    });
  }
  if (!tenure) {
    checklist.push({
      item:        "Check purchase year via assessor or deed record",
      sourceLabel: "Assessor / deed",
    });
  }

  const hasTaxCheck = artifacts.some((a) => a.source_type === "tax_delinquency");
  if (!hasTaxCheck) {
    checklist.push({
      item:        "Check county tax records for delinquency",
      sourceLabel: "County treasurer",
    });
  }

  return checklist;
}

// ─────────────────────────────────────────────────────────────
// Main deriver
// ─────────────────────────────────────────────────────────────

export function deriveAbsenteeDossierBrief(
  artifacts: AbsentiArtifactInput[],
  nowYear   = new Date().getFullYear(),
): AbsenteeDossierBrief {
  const mailing  = deriveMailing(artifacts);
  const tenure   = deriveTenure(artifacts, nowYear);
  const tenant   = deriveTenantContext(artifacts);
  const fatigue  = deriveFatigue(artifacts);
  const burden   = deriveBurden(artifacts);
  const angle    = buildCallAngle(mailing, tenant, fatigue, burden);
  const checklist = buildVerificationChecklist(artifacts, mailing, tenant, tenure);

  return {
    dossierType:          "absentee_landlord",
    mailingMismatch:       mailing,
    ownershipTenure:       tenure,
    tenantContext:         tenant,
    fatigueIndicators:     fatigue,
    burdenContext:         burden,
    callAngle:             angle,
    verificationChecklist: checklist,
    sourceArtifactCount:   artifacts.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Confidence display
// ─────────────────────────────────────────────────────────────

export const ABSENTEE_CONFIDENCE_DISPLAY: Record<AbsenteeDossierConfidence, { label: string; className: string }> = {
  confirmed: { label: "Confirmed",  className: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-400" },
  strong:    { label: "Strong",     className: "border-cyan/25 bg-cyan/[0.06] text-cyan/80" },
  probable:  { label: "Probable",   className: "border-yellow-500/25 bg-yellow-500/[0.06] text-yellow-400/70" },
  possible:  { label: "Possible",   className: "border-white/[0.10] bg-white/[0.02] text-muted-foreground/40" },
};
