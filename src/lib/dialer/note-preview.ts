import type { LeadNoteTimelineItem, LeadNotesPreview, LeadNotesPreviewItem } from "./types";

const NOTE_SCAFFOLD_PATTERN = /^(?:(?:Timeline|Motivation|Decision maker|Asking price|Condition):\s*)+$/i;

function trimNoteContent(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value : "";
  const cleanedLines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !NOTE_SCAFFOLD_PATTERN.test(line));

  const cleaned = cleanedLines.join("\n").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function previewRank(item: LeadNoteTimelineItem): number {
  if (item.sourceType === "operator_note") return 0;
  if (item.sourceType === "call_summary") return 1;
  if (item.sourceType === "ai_summary" && item.isConfirmed) return 2;
  return 3;
}

function previewGroupKey(item: LeadNoteTimelineItem): string {
  return item.callLogId ?? item.sessionId ?? item.id;
}

function toPreviewItem(item: LeadNoteTimelineItem, content: string): LeadNotesPreviewItem {
  return {
    id: item.id,
    sourceType: item.sourceType,
    sourceLabel: item.sourceLabel,
    content,
    createdAt: item.createdAt,
    callLogId: item.callLogId,
    sessionId: item.sessionId,
    isAiGenerated: item.isAiGenerated,
    isConfirmed: item.isConfirmed,
  };
}

export function buildLeadNotesPreview(
  noteTimeline: LeadNoteTimelineItem[],
  limit = 3,
): LeadNotesPreview {
  const grouped = new Map<string, { item: LeadNoteTimelineItem; content: string }>();

  for (const item of noteTimeline) {
    const content = trimNoteContent(item.content);
    if (!content) continue;

    const key = previewGroupKey(item);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { item, content });
      continue;
    }

    const nextRank = previewRank(item);
    const currentRank = previewRank(existing.item);
    const nextTime = new Date(item.createdAt).getTime();
    const currentTime = new Date(existing.item.createdAt).getTime();
    if (nextRank < currentRank || (nextRank === currentRank && nextTime > currentTime)) {
      grouped.set(key, { item, content });
    }
  }

  const items = Array.from(grouped.values())
    .sort((left, right) => {
      const rankDiff = previewRank(left.item) - previewRank(right.item);
      if (rankDiff !== 0) return rankDiff;
      return new Date(right.item.createdAt).getTime() - new Date(left.item.createdAt).getTime();
    })
    .slice(0, Math.max(1, limit))
    .map(({ item, content }) => toPreviewItem(item, content));

  return { items };
}

export function splitPreviewContent(content: string, maxLines = 3): string[] {
  return content
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[\-\u2022*\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, maxLines);
}
