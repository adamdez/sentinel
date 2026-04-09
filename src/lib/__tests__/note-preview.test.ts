import { describe, expect, it } from "vitest";
import { buildLeadNotesPreview } from "@/lib/dialer/note-preview";
import type { LeadNoteTimelineItem } from "@/lib/dialer/types";

function makeItem(overrides: Partial<LeadNoteTimelineItem>): LeadNoteTimelineItem {
  return {
    id: overrides.id ?? "note-1",
    sourceType: overrides.sourceType ?? "operator_note",
    sourceLabel: overrides.sourceLabel ?? "Operator note",
    content: overrides.content ?? "Seller wants to move this month",
    createdAt: overrides.createdAt ?? "2026-04-09T18:05:00.000Z",
    leadId: overrides.leadId ?? "lead-1",
    sessionId: overrides.sessionId ?? "session-1",
    callLogId: overrides.callLogId ?? "call-1",
    isAiGenerated: overrides.isAiGenerated ?? false,
    isConfirmed: overrides.isConfirmed ?? true,
    disposition: overrides.disposition ?? "completed",
    durationSec: overrides.durationSec ?? 120,
  };
}

describe("buildLeadNotesPreview", () => {
  it("prefers operator-authored notes over AI notes from the same call", () => {
    const preview = buildLeadNotesPreview([
      makeItem({
        id: "ai-1",
        sourceType: "ai_summary",
        sourceLabel: "AI call summary",
        content: "AI summary text",
        isAiGenerated: true,
        isConfirmed: false,
      }),
      makeItem({
        id: "op-1",
        sourceType: "operator_note",
        content: "Operator-confirmed note",
      }),
    ]);

    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]).toMatchObject({
      id: "op-1",
      content: "Operator-confirmed note",
      sourceType: "operator_note",
    });
  });

  it("drops legacy scaffold-only placeholder notes", () => {
    const preview = buildLeadNotesPreview([
      makeItem({
        id: "placeholder-1",
        content: "Timeline:\nMotivation:\nDecision maker:\nAsking price:\nCondition:",
      }),
    ]);

    expect(preview.items).toEqual([]);
  });

  it("keeps confirmed auto notes ahead of unconfirmed AI summaries", () => {
    const preview = buildLeadNotesPreview([
      makeItem({
        id: "ai-unconfirmed",
        sourceType: "ai_summary",
        sourceLabel: "AI call summary",
        content: "Unconfirmed AI note",
        isAiGenerated: true,
        isConfirmed: false,
        sessionId: "session-2",
        callLogId: "call-2",
      }),
      makeItem({
        id: "ai-confirmed",
        sourceType: "ai_summary",
        sourceLabel: "AI note (confirmed)",
        content: "Confirmed timestamp bullet",
        isAiGenerated: true,
        isConfirmed: true,
        sessionId: "session-1",
        callLogId: "call-1",
      }),
    ]);

    expect(preview.items.map((item) => item.id)).toEqual([
      "ai-confirmed",
      "ai-unconfirmed",
    ]);
  });
});
