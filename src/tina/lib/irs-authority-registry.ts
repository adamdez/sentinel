import registryManifest from "@/tina/data/irs-authority-registry.json";
import type { TinaFilingLaneId } from "@/tina/types";

export type TinaIrsAuthorityDocumentType =
  | "hub_page"
  | "topic_page"
  | "forms_page"
  | "instructions"
  | "about_form"
  | "publication"
  | "change_feed"
  | "calendar"
  | "subscription";

export type TinaIrsAuthorityUse =
  | "core_runtime"
  | "conditional_runtime"
  | "supporting_reference"
  | "annual_watch";

export interface TinaIrsAuthoritySource {
  id: string;
  title: string;
  url: string;
  documentType: TinaIrsAuthorityDocumentType;
  use: TinaIrsAuthorityUse;
  taxYear: string | null;
  lanes: TinaFilingLaneId[];
  triggers: string[];
  summary: string;
}

export interface TinaIrsAuthorityRegistryStatus {
  level: "ready" | "blocked";
  summary: string;
  nextStep: string;
}

interface TinaIrsAuthorityRegistryManifest {
  version: number;
  verifiedAt: string;
  supportedTaxYear: string;
  supportedLaneId: TinaFilingLaneId;
  sources: TinaIrsAuthoritySource[];
}

const REGISTRY_MANIFEST = registryManifest as TinaIrsAuthorityRegistryManifest;

export const TINA_IRS_AUTHORITY_REGISTRY_VERSION = REGISTRY_MANIFEST.version;
export const TINA_IRS_AUTHORITY_REGISTRY_VERIFIED_AT = REGISTRY_MANIFEST.verifiedAt;
export const TINA_IRS_AUTHORITY_SUPPORTED_TAX_YEAR = REGISTRY_MANIFEST.supportedTaxYear;

const SCHEDULE_C_SINGLE_MEMBER_LLC_LANE = REGISTRY_MANIFEST.supportedLaneId;
const REGISTRY = REGISTRY_MANIFEST.sources;

function matchesLane(source: TinaIrsAuthoritySource, laneId?: TinaFilingLaneId): boolean {
  return !laneId || source.lanes.includes(laneId);
}

function shouldIncludeUse(
  source: TinaIrsAuthoritySource,
  options?: { includeAnnualWatch?: boolean; includeSupportingReference?: boolean }
): boolean {
  if (source.use === "annual_watch") {
    return options?.includeAnnualWatch === true;
  }

  if (source.use === "supporting_reference") {
    return options?.includeSupportingReference === true;
  }

  return true;
}

export function listTinaIrsAuthoritySources(options?: {
  laneId?: TinaFilingLaneId;
  includeAnnualWatch?: boolean;
  includeSupportingReference?: boolean;
}): TinaIrsAuthoritySource[] {
  return REGISTRY.filter(
    (source) => matchesLane(source, options?.laneId) && shouldIncludeUse(source, options)
  );
}

export function listTinaIrsAnnualWatchSources(
  laneId: TinaFilingLaneId = SCHEDULE_C_SINGLE_MEMBER_LLC_LANE
): TinaIrsAuthoritySource[] {
  return REGISTRY.filter((source) => source.use === "annual_watch" && source.lanes.includes(laneId));
}

export function getTinaIrsAuthoritySource(id: string): TinaIrsAuthoritySource | null {
  return REGISTRY.find((source) => source.id === id) ?? null;
}

export function getTinaIrsAuthorityRegistryStatus(
  laneId: TinaFilingLaneId,
  taxYear: string
): TinaIrsAuthorityRegistryStatus {
  const normalizedTaxYear = taxYear.trim();

  if (laneId !== SCHEDULE_C_SINGLE_MEMBER_LLC_LANE) {
    return {
      level: "blocked",
      summary:
        "Tina does not have a curated IRS authority registry for this filing lane yet.",
      nextStep:
        "Keep this lane out of IRS-facing export claims until Tina has a lane-specific authority registry.",
    };
  }

  if (!/^\d{4}$/.test(normalizedTaxYear)) {
    return {
      level: "ready",
      summary:
        "Tina's current IRS authority registry is ready to use once the packet tax year is explicit.",
      nextStep:
        "Keep the packet in review flow until the tax year is explicit enough for final IRS-facing checks.",
    };
  }

  if (normalizedTaxYear !== TINA_IRS_AUTHORITY_SUPPORTED_TAX_YEAR) {
    return {
      level: "blocked",
      summary: `Tina's current IRS authority registry and official-form support are certified for tax year ${TINA_IRS_AUTHORITY_SUPPORTED_TAX_YEAR}, not ${normalizedTaxYear}.`,
      nextStep:
        "Keep this packet in review mode until Tina has the IRS sources and year-specific form support for that tax year.",
    };
  }

  return {
    level: "ready",
    summary:
      "Tina's current IRS authority registry matches the supported Schedule C lane and tax year.",
    nextStep:
      "Tina can keep using the current IRS registry for runtime support and annual watch checks.",
  };
}

export function describeTinaIrsAuthorityRegistry(): string[] {
  return [
    `Tina's current IRS authority registry is verified against official IRS pages as of ${TINA_IRS_AUTHORITY_REGISTRY_VERIFIED_AT}.`,
    "The live supported federal lane is the 2025 Schedule C owner-return path, with conditional IRS watchers for Schedule SE, Form 4562, Form 8829, Form 8995, and estimated-tax guidance.",
    "Annual watch sources stay separate from runtime sources so Tina can block stale exports when IRS updates land.",
  ];
}
