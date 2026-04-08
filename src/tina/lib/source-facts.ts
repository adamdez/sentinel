import type {
  TinaDocumentReading,
  TinaSourceFact,
  TinaStoredDocument,
} from "@/tina/types";

const EXCLUDED_READING_FACT_LABELS = new Set(["Paper type", "Data rows found"]);

function normalizeFactValue(label: string, value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  if (label === "Ownership percentage clue") {
    const match = trimmed.match(/(\d+(?:\.\d+)?)\s*%/);
    return match ? `${match[1]}%` : trimmed;
  }

  if (label === "Carryover amount clue") {
    const amountMatch = trimmed.match(/-?\$?\s?[\d,]+(?:\.\d{1,2})?/);
    return amountMatch ? amountMatch[0].replace(/\s+/g, "") : trimmed;
  }

  if (label === "Asset placed-in-service clue") {
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10);
    }
  }

  return trimmed;
}

function slugifySourceFact(label: string, index: number): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base ? `${base}-${index + 1}` : `source-fact-${index + 1}`;
}

export function deriveTinaSourceFactsFromReading(
  document: TinaStoredDocument,
  reading: TinaDocumentReading
): TinaSourceFact[] {
  return reading.facts
    .filter((fact) => !EXCLUDED_READING_FACT_LABELS.has(fact.label))
    .map((fact, index) => ({
      id: `${document.id}-${slugifySourceFact(fact.label, index)}`,
      sourceDocumentId: document.id,
      label: fact.label,
      value: normalizeFactValue(fact.label, fact.value),
      confidence: fact.confidence,
      capturedAt: reading.lastReadAt,
    }));
}

export function findTinaSourceFactsForDocument(
  sourceFacts: TinaSourceFact[],
  documentId: string
): TinaSourceFact[] {
  return sourceFacts.filter((fact) => fact.sourceDocumentId === documentId);
}
