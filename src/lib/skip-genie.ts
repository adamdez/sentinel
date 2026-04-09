function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function containsSkipGenie(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").includes("skipgenie");
}

export interface SkipGenieMarkerInput {
  ownerFlags?: Record<string, unknown> | null | undefined;
  sourceVendor?: string | null | undefined;
  sourceListName?: string | null | undefined;
}

export interface SkipGenieMarkerState {
  visible: true;
  title: string;
  importedAt: string | null;
}

export function deriveSkipGenieMarker(input: SkipGenieMarkerInput): SkipGenieMarkerState | null {
  const ownerFlags = asObject(input.ownerFlags) ?? {};
  const marker = asObject(ownerFlags.skip_genie);
  const prospecting = asObject(ownerFlags.prospecting_intake);

  const importedAt =
    asString(marker?.imported_at)
    ?? asString(marker?.enriched_at)
    ?? asString(marker?.processed_at)
    ?? null;
  const status = asString(marker?.status)?.toLowerCase() ?? null;

  if (status === "enriched" || status === "processed" || importedAt) {
    return {
      visible: true,
      title: importedAt
        ? `Imported from Skip Genie on ${importedAt.slice(0, 10)}`
        : "Imported from Skip Genie",
      importedAt,
    };
  }

  const sourceCandidates = [
    input.sourceVendor,
    input.sourceListName,
    asString(marker?.source_vendor),
    asString(marker?.source_list_name),
    asString(prospecting?.source_vendor),
    asString(prospecting?.source_list_name),
  ];

  if (sourceCandidates.some((value) => containsSkipGenie(value))) {
    return {
      visible: true,
      title: "Imported from Skip Genie",
      importedAt,
    };
  }

  return null;
}

export function hasSkipGenieMarker(input: SkipGenieMarkerInput): boolean {
  return deriveSkipGenieMarker(input) != null;
}
