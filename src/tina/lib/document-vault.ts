import type { TinaStoredDocumentCategory } from "@/tina/types";

export const TINA_DOCUMENT_BUCKET = "tina-documents";
export const TINA_MAX_FILE_BYTES = 25 * 1024 * 1024;

export function sanitizeTinaFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

export function normalizeTinaDocumentCategory(value: unknown): TinaStoredDocumentCategory {
  return value === "prior_return" ? "prior_return" : "supporting_document";
}

export function normalizeTinaRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || null;
}

export function normalizeTinaRequestLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

export function isTinaDocumentOwnedByUser(storagePath: string, userId: string): boolean {
  return storagePath.startsWith(`${userId}/`);
}
