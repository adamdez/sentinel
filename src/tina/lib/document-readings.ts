import type { TinaDocumentReading } from "@/tina/types";

export function findTinaDocumentReading(
  readings: TinaDocumentReading[],
  documentId: string
): TinaDocumentReading | null {
  return readings.find((reading) => reading.documentId === documentId) ?? null;
}
