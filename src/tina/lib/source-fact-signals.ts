import type { TinaBusinessTaxProfile, TinaSourceFact } from "@/tina/types";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function labelsMatch(left: string, right: string): boolean {
  return normalize(left) === normalize(right);
}

export function findTinaSourceFactsByLabel(
  sourceFacts: TinaSourceFact[],
  label: string
): TinaSourceFact[] {
  return sourceFacts.filter((fact) => labelsMatch(fact.label, label));
}

export function hasTinaSourceFactLabel(sourceFacts: TinaSourceFact[], label: string): boolean {
  return findTinaSourceFactsByLabel(sourceFacts, label).length > 0;
}

export function hasTinaSourceFactLabelValue(
  sourceFacts: TinaSourceFact[],
  label: string,
  needle: string
): boolean {
  const normalizedNeedle = normalize(needle);
  return sourceFacts.some(
    (fact) => labelsMatch(fact.label, label) && normalize(fact.value).includes(normalizedNeedle)
  );
}

export function findTinaFixedAssetSourceFacts(sourceFacts: TinaSourceFact[]): TinaSourceFact[] {
  return sourceFacts.filter((fact) =>
    ["Fixed asset clue", "Repair clue", "Small equipment clue"].some((label) =>
      labelsMatch(fact.label, label)
    )
  );
}

export function hasTinaPayrollSignal(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[]
): boolean {
  return profile.hasPayroll || hasTinaSourceFactLabel(sourceFacts, "Payroll clue");
}

export function hasTinaContractorSignal(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[]
): boolean {
  return profile.paysContractors || hasTinaSourceFactLabel(sourceFacts, "Contractor clue");
}

export function hasTinaInventorySignal(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[]
): boolean {
  return profile.hasInventory || hasTinaSourceFactLabel(sourceFacts, "Inventory clue");
}

export function hasTinaFixedAssetSignal(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[]
): boolean {
  return profile.hasFixedAssets || findTinaFixedAssetSourceFacts(sourceFacts).length > 0;
}

export function hasTinaSalesTaxSignal(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[]
): boolean {
  return profile.collectsSalesTax || hasTinaSourceFactLabel(sourceFacts, "Sales tax clue");
}

export function hasTinaIdahoSignal(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[]
): boolean {
  return profile.hasIdahoActivity || hasTinaSourceFactLabelValue(sourceFacts, "State clue", "Idaho");
}
