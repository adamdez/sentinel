import type {
  TinaDocumentReading,
  TinaSourceFact,
  TinaStoredDocument,
} from "@/tina/types";

const EXCLUDED_READING_FACT_LABELS = new Set(["Paper type", "Data rows found"]);

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
      value: fact.value,
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
