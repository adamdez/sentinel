import { buildTinaPacketIdentity } from "@/tina/lib/packet-identity";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

export const TINA_PACKET_VERSIONS_LIMIT = 12;

export type TinaPacketVersionOrigin =
  | "cpa_packet_export"
  | "official_form_export"
  | "official_form_pdf_export"
  | "review_book_export"
  | "review_bundle_export"
  | "review_bundle_package"
  | "review_packet_html_export";

export type TinaPacketReviewDecision =
  | "unreviewed"
  | "reference_only"
  | "needs_follow_up"
  | "approved_for_handoff";

export interface TinaStoredPacketReviewEvent {
  at: string;
  decision: TinaPacketReviewDecision;
  reviewerName: string;
  reviewerNote: string;
}

export interface TinaStoredPacketReviewState {
  decision: TinaPacketReviewDecision;
  reviewerName: string;
  reviewerNote: string;
  reviewedAt: string | null;
  events: TinaStoredPacketReviewEvent[];
}

export interface TinaStoredPacketVersion {
  packetId: string;
  packetVersion: string;
  fingerprint: string;
  createdAt: string;
  lastStoredAt: string;
  workspaceSavedAt: string | null;
  origins: TinaPacketVersionOrigin[];
  review: TinaStoredPacketReviewState;
  draft: TinaWorkspaceDraft;
}

export interface TinaStoredPacketVersionSummary {
  packetId: string;
  packetVersion: string;
  fingerprint: string;
  createdAt: string;
  lastStoredAt: string;
  workspaceSavedAt: string | null;
  origins: TinaPacketVersionOrigin[];
  businessName: string;
  taxYear: string;
  packageSummary: string;
  packageLevel: TinaWorkspaceDraft["packageReadiness"]["level"];
  confirmedAt: string | null;
  reviewDecision: TinaPacketReviewDecision;
  reviewedAt: string | null;
  reviewerName: string;
}

function normalizePacketReviewDecision(value: unknown): TinaPacketReviewDecision {
  switch (value) {
    case "reference_only":
    case "needs_follow_up":
    case "approved_for_handoff":
    case "unreviewed":
      return value;
    default:
      return "unreviewed";
  }
}

function createDefaultPacketReviewState(): TinaStoredPacketReviewState {
  return {
    decision: "unreviewed",
    reviewerName: "",
    reviewerNote: "",
    reviewedAt: null,
    events: [],
  };
}

function parsePacketReviewState(value: unknown): TinaStoredPacketReviewState {
  if (typeof value !== "object" || value === null) {
    return createDefaultPacketReviewState();
  }

  const raw = value as Partial<TinaStoredPacketReviewState> & { events?: unknown };
  const events = Array.isArray(raw.events)
    ? raw.events
        .map((event) => {
          if (typeof event !== "object" || event === null) return null;
          const record = event as Partial<TinaStoredPacketReviewEvent>;
          return {
            at: typeof record.at === "string" ? record.at : new Date(0).toISOString(),
            decision: normalizePacketReviewDecision(record.decision),
            reviewerName: typeof record.reviewerName === "string" ? record.reviewerName : "",
            reviewerNote: typeof record.reviewerNote === "string" ? record.reviewerNote : "",
          } satisfies TinaStoredPacketReviewEvent;
        })
        .filter((event): event is TinaStoredPacketReviewEvent => event !== null)
    : [];

  return {
    decision: normalizePacketReviewDecision(raw.decision),
    reviewerName: typeof raw.reviewerName === "string" ? raw.reviewerName : "",
    reviewerNote: typeof raw.reviewerNote === "string" ? raw.reviewerNote : "",
    reviewedAt: typeof raw.reviewedAt === "string" ? raw.reviewedAt : null,
    events,
  };
}

function parseStoredPacketVersion(value: unknown): TinaStoredPacketVersion | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaStoredPacketVersion> & { draft?: unknown };
  if (
    typeof raw.packetId !== "string" ||
    typeof raw.packetVersion !== "string" ||
    typeof raw.fingerprint !== "string"
  ) {
    return null;
  }

  const draft = parseTinaWorkspaceDraft(raw.draft ? JSON.stringify(raw.draft) : null);
  const origins = Array.isArray(raw.origins)
    ? raw.origins
        .map((origin) => normalizePacketOrigin(origin))
        .filter((origin): origin is TinaPacketVersionOrigin => origin !== null)
    : [];

  return {
    packetId: raw.packetId,
    packetVersion: raw.packetVersion,
    fingerprint: raw.fingerprint,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : draft.savedAt ?? new Date(0).toISOString(),
    lastStoredAt:
      typeof raw.lastStoredAt === "string"
        ? raw.lastStoredAt
        : typeof raw.createdAt === "string"
          ? raw.createdAt
          : draft.savedAt ?? new Date(0).toISOString(),
    workspaceSavedAt: typeof raw.workspaceSavedAt === "string" ? raw.workspaceSavedAt : null,
    origins,
    review: parsePacketReviewState(raw.review),
    draft,
  } satisfies TinaStoredPacketVersion;
}

function normalizePacketOrigin(value: unknown): TinaPacketVersionOrigin | null {
  switch (value) {
    case "cpa_packet_export":
    case "official_form_export":
    case "official_form_pdf_export":
    case "review_book_export":
    case "review_bundle_export":
    case "review_bundle_package":
    case "review_packet_html_export":
      return value;
    default:
      return null;
  }
}

export function parseTinaStoredPacketVersion(value: unknown): TinaStoredPacketVersion | null {
  return parseStoredPacketVersion(value);
}

export function createTinaStoredPacketVersion(
  draft: TinaWorkspaceDraft,
  origin: TinaPacketVersionOrigin,
  savedAt = new Date().toISOString()
): TinaStoredPacketVersion {
  const packetIdentity = buildTinaPacketIdentity(draft);

  return {
    packetId: packetIdentity.packetId,
    packetVersion: packetIdentity.packetVersion,
    fingerprint: packetIdentity.fingerprint,
    createdAt: savedAt,
    lastStoredAt: savedAt,
    workspaceSavedAt: draft.savedAt,
    origins: [origin],
    review: createDefaultPacketReviewState(),
    draft,
  };
}

export function updateTinaStoredPacketVersionReview(
  packet: TinaStoredPacketVersion,
  input: {
    decision: TinaPacketReviewDecision;
    reviewerName: string;
    reviewerNote: string;
    reviewedAt?: string;
  }
): TinaStoredPacketVersion {
  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  const reviewerName = input.reviewerName.trim();
  const reviewerNote = input.reviewerNote.trim();

  return {
    ...packet,
    review: {
      decision: input.decision,
      reviewerName,
      reviewerNote,
      reviewedAt,
      events: [
        {
          at: reviewedAt,
          decision: input.decision,
          reviewerName,
          reviewerNote,
        },
        ...packet.review.events,
      ].slice(0, 10),
    },
  };
}

export function summarizeTinaStoredPacketVersion(
  packet: TinaStoredPacketVersion
): TinaStoredPacketVersionSummary {
  return {
    packetId: packet.packetId,
    packetVersion: packet.packetVersion,
    fingerprint: packet.fingerprint,
    createdAt: packet.createdAt,
    lastStoredAt: packet.lastStoredAt,
    workspaceSavedAt: packet.workspaceSavedAt,
    origins: [...packet.origins],
    businessName: packet.draft.profile.businessName || "Unnamed business",
    taxYear: packet.draft.profile.taxYear || "tax-year",
    packageSummary: packet.draft.packageReadiness.summary,
    packageLevel: packet.draft.packageReadiness.level,
    confirmedAt: packet.draft.finalSignoff.confirmedAt,
    reviewDecision: packet.review.decision,
    reviewedAt: packet.review.reviewedAt,
    reviewerName: packet.review.reviewerName,
  };
}

function comparePacketStoredAt(a: TinaStoredPacketVersion, b: TinaStoredPacketVersion): number {
  return Date.parse(b.lastStoredAt) - Date.parse(a.lastStoredAt);
}

export function parseTinaStoredPacketVersions(value: unknown): TinaStoredPacketVersion[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => parseStoredPacketVersion(item))
    .filter((item): item is TinaStoredPacketVersion => item !== null)
    .sort(comparePacketStoredAt)
    .slice(0, TINA_PACKET_VERSIONS_LIMIT);
}

export function upsertTinaStoredPacketVersions(
  existing: TinaStoredPacketVersion[],
  next: TinaStoredPacketVersion
): TinaStoredPacketVersion[] {
  const match = existing.find((item) => item.fingerprint === next.fingerprint);
  const withoutMatch = existing.filter((item) => item.fingerprint !== next.fingerprint);

  const merged: TinaStoredPacketVersion = match
    ? {
        ...match,
        packetId: next.packetId,
        packetVersion: next.packetVersion,
        lastStoredAt: next.lastStoredAt,
        workspaceSavedAt: next.workspaceSavedAt,
        origins: Array.from(new Set([...match.origins, ...next.origins])),
        draft: next.draft,
      }
    : next;

  return [merged, ...withoutMatch]
    .sort(comparePacketStoredAt)
    .slice(0, TINA_PACKET_VERSIONS_LIMIT);
}
