import { describe, expect, it } from "vitest";
import {
  filterTinaPacketHistory,
  summarizeTinaPacketHistory,
} from "@/tina/lib/packet-history";
import type { TinaStoredPacketVersionSummary } from "@/tina/lib/packet-versions";

const PACKETS: TinaStoredPacketVersionSummary[] = [
  {
    packetId: "TINA-2025-AAAA1111",
    packetVersion: "rev-00000000001",
    fingerprint: "fp-1",
    createdAt: "2026-03-27T12:00:00.000Z",
    lastStoredAt: "2026-03-27T12:00:00.000Z",
    workspaceSavedAt: "2026-03-27T11:55:00.000Z",
    origins: ["review_bundle_package"],
    businessName: "Acorn Studio",
    taxYear: "2025",
    packageSummary: "Blocked on one missing paper.",
    packageLevel: "blocked",
    confirmedAt: null,
    reviewDecision: "unreviewed",
    reviewedAt: null,
    reviewerName: "",
  },
  {
    packetId: "TINA-2025-BBBB2222",
    packetVersion: "rev-00000000002",
    fingerprint: "fp-2",
    createdAt: "2026-03-27T12:10:00.000Z",
    lastStoredAt: "2026-03-27T12:10:00.000Z",
    workspaceSavedAt: "2026-03-27T12:05:00.000Z",
    origins: ["review_packet_html_export", "cpa_packet_export"],
    businessName: "Blue Pine Books",
    taxYear: "2025",
    packageSummary: "Ready for CPA handoff.",
    packageLevel: "ready_for_cpa",
    confirmedAt: "2026-03-27T12:09:00.000Z",
    reviewDecision: "approved_for_handoff",
    reviewedAt: "2026-03-27T12:12:00.000Z",
    reviewerName: "Pat",
  },
  {
    packetId: "TINA-2025-CCCC3333",
    packetVersion: "rev-00000000003",
    fingerprint: "fp-3",
    createdAt: "2026-03-27T12:20:00.000Z",
    lastStoredAt: "2026-03-27T12:20:00.000Z",
    workspaceSavedAt: "2026-03-27T12:15:00.000Z",
    origins: ["official_form_pdf_export"],
    businessName: "Cedar Trail Design",
    taxYear: "2025",
    packageSummary: "Needs a closer look at payroll separation.",
    packageLevel: "needs_review",
    confirmedAt: null,
    reviewDecision: "needs_follow_up",
    reviewedAt: "2026-03-27T12:22:00.000Z",
    reviewerName: "Morgan",
  },
];

describe("packet history helpers", () => {
  it("summarizes review states across saved packets", () => {
    const summary = summarizeTinaPacketHistory(PACKETS);

    expect(summary.totalCount).toBe(3);
    expect(summary.reviewedCount).toBe(2);
    expect(summary.approvedCount).toBe(1);
    expect(summary.followUpCount).toBe(1);
    expect(summary.unreviewedCount).toBe(1);
  });

  it("filters by review decision and search query", () => {
    expect(filterTinaPacketHistory(PACKETS, { reviewFilter: "approved_for_handoff" })).toEqual([
      PACKETS[1],
    ]);

    expect(filterTinaPacketHistory(PACKETS, { query: "payroll" })).toEqual([PACKETS[2]]);
    expect(filterTinaPacketHistory(PACKETS, { query: "pat" })).toEqual([PACKETS[1]]);
  });
});
