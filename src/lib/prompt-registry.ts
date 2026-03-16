/**
 * Prompt Registry — server-side lookup module
 *
 * Provides typed access to the prompt_registry table.
 * Falls back to a static map if the database is unavailable so
 * downstream review surfaces degrade gracefully rather than crash.
 *
 * BOUNDARY:
 *   - Server-side only (never import in client components)
 *   - Reads prompt_registry table via Supabase
 *   - Never writes — writes go through /api/settings/prompt-registry
 */

import { createServerClient } from "@/lib/supabase";

// ── Types (exported for API route + UI) ───────────────────────────────────────

export type PromptStatus = "testing" | "active" | "deprecated";

export interface PromptRegistryRow {
  id:            string;
  workflow:      string;
  version:       string;
  status:        PromptStatus;
  description:   string | null;
  changelog:     string | null;
  registered_by: string | null;
  updated_by:    string | null;
  created_at:    string;
  updated_at:    string;
}

/** Compact shape used in review surfaces — omits audit fields */
export interface PromptMeta {
  workflow:    string;
  version:     string;
  status:      PromptStatus;
  description: string | null;
  changelog:   string | null;
}

// ── Static fallback map ───────────────────────────────────────────────────────
// Mirrors the seeded rows. Used when DB lookup fails.
// Keys: `${workflow}@${version}`

const STATIC_FALLBACK: Record<string, PromptMeta> = {
  "summarize@2.3.0+style@1.0.0": {
    workflow:    "summarize",
    version:     "2.3.0+style@1.0.0",
    status:      "active",
    description: "OpenAI call summarizer. 3-5 bullets: objections, motivation, property, next steps, deal temperature.",
    changelog:   "OpenAI migration + seller conversation style overlay + prior-context trust ordering.",
  },
  "summarize@2.1.0": {
    workflow:    "summarize",
    version:     "2.1.0",
    status:      "deprecated",
    description: "Legacy call summarizer. 3-5 bullets: objections, motivation, property, next steps, deal temp.",
    changelog:   "Source hierarchy enforced: operator notes first, AI summary labeled fallback.",
  },
  "summarize@2.0.0": {
    workflow:    "summarize",
    version:     "2.0.0",
    status:      "deprecated",
    description: "Legacy call summarizer with prior context block.",
    changelog:   "Added prior call context. Did not enforce trust order.",
  },
  "extract@1.0.0": {
    workflow:    "extract",
    version:     "1.0.0",
    status:      "active",
    description: "Claude qualifier. Extracts motivation_level and seller_timeline from call notes.",
    changelog:   "Initial version. Returns null on ambiguous input.",
  },
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch all rows from prompt_registry, ordered by workflow + created_at DESC.
 * Returns empty array on error (never throws).
 */
export async function getAllPromptVersions(): Promise<PromptRegistryRow[]> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("prompt_registry") as any)
      .select("*")
      .order("workflow", { ascending: true })
      .order("created_at", { ascending: false });

    if (error || !data) {
      console.warn("[prompt-registry] getAllPromptVersions failed:", error?.message);
      return [];
    }
    return data as PromptRegistryRow[];
  } catch (e) {
    console.warn("[prompt-registry] getAllPromptVersions threw:", e);
    return [];
  }
}

/**
 * Look up metadata for a specific (workflow, version) pair.
 * Falls back to static map if DB unavailable.
 * Returns null if the version is unknown everywhere.
 */
export async function getPromptMeta(
  workflow: string,
  version:  string,
): Promise<PromptMeta | null> {
  const key = `${workflow}@${version}`;
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("prompt_registry") as any)
      .select("workflow, version, status, description, changelog")
      .eq("workflow", workflow)
      .eq("version", version)
      .maybeSingle();

    if (!error && data) return data as PromptMeta;
    // Fall through to static fallback on error or miss
  } catch { /* fall through */ }

  return STATIC_FALLBACK[key] ?? null;
}

/**
 * Returns the active version for a workflow, or null if none registered.
 * Used by routes that want to confirm they are running the active version.
 */
export async function getActiveVersion(workflow: string): Promise<string | null> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("prompt_registry") as any)
      .select("version")
      .eq("workflow", workflow)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) return data.version as string;
  } catch { /* fall through */ }

  // Static fallback — find active entry for this workflow
  const active = Object.values(STATIC_FALLBACK).find(
    r => r.workflow === workflow && r.status === "active"
  );
  return active?.version ?? null;
}

/**
 * Batch-resolve a list of (workflow, version) pairs.
 * Fetches all in one query and maps to a lookup dict.
 * Returns an empty object on error.
 *
 * Usage: const meta = await batchGetPromptMeta([{workflow, version}, ...])
 *        meta["summarize@2.1.0"]  // PromptMeta | undefined
 */
export async function batchGetPromptMeta(
  pairs: Array<{ workflow: string; version: string }>
): Promise<Record<string, PromptMeta>> {
  if (pairs.length === 0) return {};

  const result: Record<string, PromptMeta> = {};

  try {
    const sb = createServerClient();
    // Build OR filter: workflow='summarize' AND version='2.1.0' OR ...
    // Simpler: fetch all rows for the relevant workflows and filter in memory
    const workflows = [...new Set(pairs.map(p => p.workflow))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("prompt_registry") as any)
      .select("workflow, version, status, description, changelog")
      .in("workflow", workflows);

    if (!error && data) {
      for (const row of data as PromptMeta[]) {
        result[`${row.workflow}@${row.version}`] = row;
      }
    }
  } catch { /* fall through to static */ }

  // Fill missing entries from static fallback
  for (const { workflow, version } of pairs) {
    const key = `${workflow}@${version}`;
    if (!result[key] && STATIC_FALLBACK[key]) {
      result[key] = STATIC_FALLBACK[key];
    }
  }

  return result;
}
