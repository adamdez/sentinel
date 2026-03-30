import { createDefaultTinaWorkspaceDraft, parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import {
  createTinaStoredPacketVersion,
  parseTinaStoredPacketVersions,
  summarizeTinaStoredPacketVersion,
  updateTinaStoredPacketVersionReview,
  type TinaPacketReviewDecision,
  type TinaPacketVersionOrigin,
  type TinaStoredPacketVersion,
  type TinaStoredPacketVersionSummary,
  upsertTinaStoredPacketVersions,
} from "@/tina/lib/packet-versions";
import { revalidateTinaCompletedDerivedWorkspace } from "@/tina/lib/reconcile-workspace";
import type { TinaWorkspaceDraft } from "@/tina/types";

export const TINA_WORKSPACE_PREFERENCES_KEY = "tina_workspace_v1";
export const TINA_PACKET_VERSIONS_PREFERENCES_KEY = "tina_packet_versions_v1";

type TinaProfilePreferences = Record<string, unknown>;
type TinaSupabaseClient = {
  from: (table: string) => unknown;
};

function extractTinaPreferencesErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    return typeof message === "string" ? message : null;
  }

  return null;
}

function isRetryableTinaPreferencesError(error: unknown): boolean {
  const message = extractTinaPreferencesErrorMessage(error);
  if (!message) return false;

  return /(timeout|timed out|temporarily unavailable|connection reset|econnreset|etimedout|network)/i.test(
    message
  );
}

function getTinaPreferencesRetryDelaysMs(): number[] {
  return process.env.NODE_ENV === "test" ? [0, 0] : [250, 1000, 2000];
}

async function waitForTinaPreferencesRetry(ms: number): Promise<void> {
  if (ms <= 0) return;

  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTinaPreferencesRetry<T>(action: () => Promise<T>): Promise<T> {
  const retryDelays = getTinaPreferencesRetryDelaysMs();

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (!isRetryableTinaPreferencesError(error) || attempt === retryDelays.length) {
        throw error;
      }

      await waitForTinaPreferencesRetry(retryDelays[attempt] ?? 0);
    }
  }

  throw new Error("Tina preference retry loop exited unexpectedly.");
}

async function loadRawPreferences(
  sb: TinaSupabaseClient,
  userId: string
): Promise<TinaProfilePreferences> {
  return withTinaPreferencesRetry(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await ((sb.from("user_profiles") as any)
      .select("preferences")
      .eq("id", userId)
      .single() as Promise<{
      data?: { preferences?: TinaProfilePreferences | null } | null;
      error?: { message?: string } | null;
    }>);

    if (error) {
      throw new Error(error.message || "Failed to load Tina profile preferences.");
    }

    return (data?.preferences as TinaProfilePreferences | null) ?? {};
  });
}

async function saveRawPreferences(
  sb: TinaSupabaseClient,
  userId: string,
  preferences: TinaProfilePreferences
): Promise<void> {
  await withTinaPreferencesRetry(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((sb.from("user_profiles") as any)
      .update({ preferences })
      .eq("id", userId) as Promise<{
      error?: { message?: string } | null;
    }>);

    if (error) {
      throw new Error(error.message || "Failed to save Tina profile preferences.");
    }
  });
}

export function getTinaWorkspaceDraftFromPreferences(
  preferences: TinaProfilePreferences
): TinaWorkspaceDraft {
  const rawDraft = preferences[TINA_WORKSPACE_PREFERENCES_KEY];
  return revalidateTinaCompletedDerivedWorkspace(
    parseTinaWorkspaceDraft(rawDraft ? JSON.stringify(rawDraft) : null)
  );
}

export function getTinaStoredPacketVersionSummariesFromPreferences(
  preferences: TinaProfilePreferences
): TinaStoredPacketVersionSummary[] {
  return parseTinaStoredPacketVersions(preferences[TINA_PACKET_VERSIONS_PREFERENCES_KEY]).map(
    (packet) => summarizeTinaStoredPacketVersion(packet)
  );
}

export function getTinaStoredPacketVersionFromPreferences(
  preferences: TinaProfilePreferences,
  fingerprint: string
): TinaStoredPacketVersion | null {
  return (
    parseTinaStoredPacketVersions(preferences[TINA_PACKET_VERSIONS_PREFERENCES_KEY]).find(
      (packet) => packet.fingerprint === fingerprint
    ) ?? null
  );
}

export function createTinaWorkspaceDraftFromStoredPacket(
  packet: TinaStoredPacketVersion,
  restoredAt = new Date().toISOString()
): TinaWorkspaceDraft {
  return parseTinaWorkspaceDraft(
    JSON.stringify({
      ...packet.draft,
      savedAt: restoredAt,
    })
  );
}

export async function loadTinaWorkspaceState(
  sb: TinaSupabaseClient,
  userId: string
): Promise<{ draft: TinaWorkspaceDraft; packetVersions: TinaStoredPacketVersionSummary[] }> {
  const preferences = await loadRawPreferences(sb, userId);

  return {
    draft: getTinaWorkspaceDraftFromPreferences(preferences),
    packetVersions: getTinaStoredPacketVersionSummariesFromPreferences(preferences),
  };
}

export async function loadTinaStoredPacketVersion(
  sb: TinaSupabaseClient,
  userId: string,
  fingerprint: string
): Promise<TinaStoredPacketVersion | null> {
  const preferences = await loadRawPreferences(sb, userId);
  return getTinaStoredPacketVersionFromPreferences(preferences, fingerprint);
}

export async function saveTinaWorkspaceState(
  sb: TinaSupabaseClient,
  userId: string,
  draft: TinaWorkspaceDraft
): Promise<{
  draft: TinaWorkspaceDraft;
  packetVersions: TinaStoredPacketVersionSummary[];
  saveAccepted: boolean;
}> {
  const preferences = await loadRawPreferences(sb, userId);
  const currentDraft = getTinaWorkspaceDraftFromPreferences(preferences);
  const packetVersions = getTinaStoredPacketVersionSummariesFromPreferences(preferences);

  if (draft.version < currentDraft.version) {
    return {
      draft: currentDraft,
      packetVersions,
      saveAccepted: false,
    };
  }

  const now = new Date().toISOString();
  const nextVersion =
    currentDraft.savedAt === null ? Math.max(draft.version, 1) : Math.max(currentDraft.version + 1, 1);
  const safeDraft = revalidateTinaCompletedDerivedWorkspace({
    ...createDefaultTinaWorkspaceDraft(),
    ...draft,
    version: nextVersion,
    savedAt: now,
  });
  const nextPreferences = {
    ...preferences,
    [TINA_WORKSPACE_PREFERENCES_KEY]: safeDraft,
  };

  await saveRawPreferences(sb, userId, nextPreferences);

  return {
    draft: safeDraft,
    packetVersions: getTinaStoredPacketVersionSummariesFromPreferences(nextPreferences),
    saveAccepted: true,
  };
}

export async function persistTinaPacketVersion(
  sb: TinaSupabaseClient,
  userId: string,
  draft: TinaWorkspaceDraft,
  origin: TinaPacketVersionOrigin
): Promise<{
  packet: TinaStoredPacketVersion;
  packetVersions: TinaStoredPacketVersionSummary[];
}> {
  const preferences = await loadRawPreferences(sb, userId);
  const existing = parseTinaStoredPacketVersions(preferences[TINA_PACKET_VERSIONS_PREFERENCES_KEY]);
  const packet = createTinaStoredPacketVersion(draft, origin);
  const storedPackets = upsertTinaStoredPacketVersions(existing, packet);
  const nextPreferences = {
    ...preferences,
    [TINA_PACKET_VERSIONS_PREFERENCES_KEY]: storedPackets,
  };

  await saveRawPreferences(sb, userId, nextPreferences);

  const persistedPacket =
    storedPackets.find((item) => item.fingerprint === packet.fingerprint) ?? packet;

  return {
    packet: persistedPacket,
    packetVersions: storedPackets.map((item) => summarizeTinaStoredPacketVersion(item)),
  };
}

export async function reviewTinaStoredPacketVersion(
  sb: TinaSupabaseClient,
  userId: string,
  fingerprint: string,
  input: {
    decision: TinaPacketReviewDecision;
    reviewerName: string;
    reviewerNote: string;
  }
): Promise<{
  packet: TinaStoredPacketVersion | null;
  packetVersions: TinaStoredPacketVersionSummary[];
}> {
  const preferences = await loadRawPreferences(sb, userId);
  const existing = parseTinaStoredPacketVersions(preferences[TINA_PACKET_VERSIONS_PREFERENCES_KEY]);
  const match = existing.find((item) => item.fingerprint === fingerprint) ?? null;

  if (!match) {
    return {
      packet: null,
      packetVersions: existing.map((item) => summarizeTinaStoredPacketVersion(item)),
    };
  }

  const updatedPacket = updateTinaStoredPacketVersionReview(match, input);
  const storedPackets = existing.map((item) =>
    item.fingerprint === fingerprint ? updatedPacket : item
  );
  const nextPreferences = {
    ...preferences,
    [TINA_PACKET_VERSIONS_PREFERENCES_KEY]: storedPackets,
  };

  await saveRawPreferences(sb, userId, nextPreferences);

  return {
    packet: updatedPacket,
    packetVersions: storedPackets.map((item) => summarizeTinaStoredPacketVersion(item)),
  };
}

export async function restoreTinaWorkspaceFromPacketVersion(
  sb: TinaSupabaseClient,
  userId: string,
  fingerprint: string
): Promise<{
  draft: TinaWorkspaceDraft | null;
  packet: TinaStoredPacketVersion | null;
  packetVersions: TinaStoredPacketVersionSummary[];
}> {
  const preferences = await loadRawPreferences(sb, userId);
  const storedPackets = parseTinaStoredPacketVersions(preferences[TINA_PACKET_VERSIONS_PREFERENCES_KEY]);
  const packet = storedPackets.find((item) => item.fingerprint === fingerprint) ?? null;

  if (!packet) {
    return {
      draft: null,
      packet: null,
      packetVersions: storedPackets.map((item) => summarizeTinaStoredPacketVersion(item)),
    };
  }

  const draft = revalidateTinaCompletedDerivedWorkspace(
    createTinaWorkspaceDraftFromStoredPacket(packet)
  );
  const nextPreferences = {
    ...preferences,
    [TINA_WORKSPACE_PREFERENCES_KEY]: draft,
  };

  await saveRawPreferences(sb, userId, nextPreferences);

  return {
    draft,
    packet,
    packetVersions: storedPackets.map((item) => summarizeTinaStoredPacketVersion(item)),
  };
}
