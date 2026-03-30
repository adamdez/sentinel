import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import type { TinaWorkspaceDraft } from "@/tina/types";

export interface TinaPacketIdentity {
  packetId: string;
  packetVersion: string;
  fingerprint: string;
}

function toBase36Hash(value: string): string {
  let h1 = 0xdeadbeef ^ value.length;
  let h2 = 0x41c6ce57 ^ value.length;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(36).padStart(11, "0");
}

function buildPacketIdentitySnapshot(draft: TinaWorkspaceDraft) {
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);

  return {
    profile: {
      businessName: draft.profile.businessName,
      taxYear: draft.profile.taxYear,
      laneId: lane.laneId,
      laneTitle: lane.title,
    },
    documents: (draft.documents ?? []).map((document) => ({
      id: document.id,
      name: document.name,
      category: document.category,
      requestLabel: document.requestLabel,
    })),
    authorityWork: (draft.authorityWork ?? []).map((item) => ({
      ideaId: item.ideaId,
      status: item.status,
      reviewerDecision: item.reviewerDecision,
      disclosureDecision: item.disclosureDecision,
      memo: item.memo,
      reviewerNotes: item.reviewerNotes,
      missingAuthority: item.missingAuthority,
      citations: (item.citations ?? []).map((citation) => ({
        id: citation.id,
        title: citation.title,
        url: citation.url,
        sourceClass: citation.sourceClass,
        effect: citation.effect,
        note: citation.note,
      })),
    })),
    scheduleCDraft: {
      status: draft.scheduleCDraft.status,
      summary: draft.scheduleCDraft.summary,
      nextStep: draft.scheduleCDraft.nextStep,
      fields: (draft.scheduleCDraft.fields ?? []).map((field) => ({
        id: field.id,
        lineNumber: field.lineNumber,
        label: field.label,
        amount: field.amount,
        status: field.status,
        summary: field.summary,
      })),
      notes: (draft.scheduleCDraft.notes ?? []).map((note) => ({
        id: note.id,
        title: note.title,
        summary: note.summary,
        severity: note.severity,
      })),
    },
    officialFormPacket: {
      status: draft.officialFormPacket.status,
      summary: draft.officialFormPacket.summary,
      nextStep: draft.officialFormPacket.nextStep,
      forms: (draft.officialFormPacket.forms ?? []).map((form) => ({
        id: form.id,
        formNumber: form.formNumber,
        title: form.title,
        taxYear: form.taxYear,
        revisionYear: form.revisionYear,
        status: form.status,
        summary: form.summary,
        nextStep: form.nextStep,
        lines: (form.lines ?? []).map((line) => ({
          id: line.id,
          lineNumber: line.lineNumber,
          label: line.label,
          value: line.value,
          state: line.state,
          summary: line.summary,
        })),
        supportSchedules: (form.supportSchedules ?? []).map((schedule) => ({
          id: schedule.id,
          title: schedule.title,
          summary: schedule.summary,
          rows: (schedule.rows ?? []).map((row) => ({
            id: row.id,
            label: row.label,
            amount: row.amount,
            summary: row.summary,
          })),
        })),
        relatedNoteIds: form.relatedNoteIds ?? [],
      })),
    },
    packageReadiness: {
      status: draft.packageReadiness.status,
      level: draft.packageReadiness.level,
      summary: draft.packageReadiness.summary,
      nextStep: draft.packageReadiness.nextStep,
      items: (draft.packageReadiness.items ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        severity: item.severity,
      })),
    },
    cpaHandoff: {
      status: draft.cpaHandoff.status,
      summary: draft.cpaHandoff.summary,
      nextStep: draft.cpaHandoff.nextStep,
      artifacts: (draft.cpaHandoff.artifacts ?? []).map((artifact) => ({
        id: artifact.id,
        title: artifact.title,
        status: artifact.status,
        summary: artifact.summary,
        includes: artifact.includes ?? [],
      })),
    },
  };
}

export function buildTinaPacketIdentity(draft: TinaWorkspaceDraft): TinaPacketIdentity {
  const snapshot = buildPacketIdentitySnapshot(draft);
  const fingerprint = toBase36Hash(JSON.stringify(snapshot));
  const taxYear = draft.profile.taxYear || "TAX";
  const shortFingerprint = fingerprint.slice(0, 8).toUpperCase();

  return {
    packetId: `TINA-${taxYear}-${shortFingerprint}`,
    packetVersion: `rev-${fingerprint}`,
    fingerprint,
  };
}

export function getTinaPacketFileTag(draft: TinaWorkspaceDraft): string {
  return buildTinaPacketIdentity(draft)
    .packetId.toLowerCase()
    .replace(/[^a-z0-9-]+/g, "");
}
