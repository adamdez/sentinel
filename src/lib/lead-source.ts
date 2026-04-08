import { normalizeSource, sourceLabel } from "@/lib/source-normalization";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function vendorSourceLabel(vendor: string | null | undefined): string | null {
  if (!vendor) return null;
  const normalized = normalizeText(vendor);
  if (!normalized || normalized === "manual" || normalized === "manual_resume") return null;
  if (normalized === "propertyradar" || normalized === "propradar") return "PropRadar";
  if (normalized === "lead_house" || normalized === "leadhouse") return "LeadHouse";
  return titleCase(vendor.trim());
}

export function leadSourceBaseLabel(source: string | null | undefined): string {
  const normalized = normalizeSource(source);
  return sourceLabel(normalized);
}

export function buildLeadSourceLabel(
  source: string | null | undefined,
  vendor: string | null | undefined,
  listName: string | null | undefined,
): string {
  const vendorLabel = vendorSourceLabel(vendor);
  const trimmedListName = listName?.trim() || null;
  if (vendorLabel && trimmedListName) return `${vendorLabel} · ${trimmedListName}`;
  if (trimmedListName) return trimmedListName;
  if (vendorLabel) return vendorLabel;
  return leadSourceBaseLabel(source);
}

export function isPplLeadSource(input: {
  source?: string | null;
  sourceChannel?: string | null;
  sourceVendor?: string | null;
  intakeMethod?: string | null;
  sourceListName?: string | null;
}): boolean {
  const values = [
    input.source,
    input.sourceChannel,
    input.sourceVendor,
    input.intakeMethod,
    input.sourceListName,
  ];
  return values.some((value) => {
    const normalized = normalizeText(value);
    return (
      normalized === "ppl"
      || normalized === "lead_house"
      || normalized === "leadhouse"
      || normalized.includes("lead house")
      || normalized.includes("lead_house")
      || normalized.includes("pay per lead")
    );
  });
}

export function leadSourceSortKey(input: {
  source?: string | null;
  sourceChannel?: string | null;
  sourceVendor?: string | null;
  sourceListName?: string | null;
}): string {
  return buildLeadSourceLabel(
    input.sourceChannel ?? input.source,
    input.sourceVendor,
    input.sourceListName,
  ).toLowerCase();
}
