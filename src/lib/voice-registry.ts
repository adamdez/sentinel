/**
 * Voice Registry — server-side lookup module
 *
 * Provides typed access to the voice_registry table.
 * Two entry types:
 *   "script"       — copy/talking-points for inbound, qualifying, booking, transfer
 *   "handoff_rule" — routing decision thresholds
 *
 * Falls back to static defaults if DB is unavailable.
 *
 * BOUNDARY:
 *   - Server-side only (never import in client components)
 *   - Reads voice_registry table via Supabase
 *   - Never writes — writes go through /api/settings/voice-registry
 */

import { createServerClient } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoiceRegistryType  = "script" | "handoff_rule";
export type VoiceRegistryStatus = "testing" | "active" | "deprecated";

/** Bounded vocabulary for voice workflow identifiers */
export type VoiceWorkflow =
  | "inbound_greeting"
  | "seller_qualifying"
  | "callback_booking"
  | "warm_transfer"
  | "handoff_rules";

export const VOICE_WORKFLOWS: VoiceWorkflow[] = [
  "inbound_greeting",
  "seller_qualifying",
  "callback_booking",
  "warm_transfer",
  "handoff_rules",
];

export const VOICE_WORKFLOW_LABELS: Record<VoiceWorkflow, string> = {
  inbound_greeting:  "Inbound Greeting",
  seller_qualifying: "Seller Qualifying",
  callback_booking:  "Callback Booking",
  warm_transfer:     "Warm Transfer",
  handoff_rules:     "Handoff Rules",
};

export interface VoiceRegistryRow {
  id:            string;
  workflow:      string;
  registry_type: VoiceRegistryType;
  version:       string;
  status:        VoiceRegistryStatus;
  description:   string | null;
  changelog:     string | null;
  rule_config:   HandoffRuleConfig | null;
  registered_by: string | null;
  updated_by:    string | null;
  created_at:    string;
  updated_at:    string;
}

/** Compact shape for review surfaces and threading into events */
export interface VoiceMeta {
  workflow:      string;
  registry_type: VoiceRegistryType;
  version:       string;
  status:        VoiceRegistryStatus;
  description:   string | null;
}

/**
 * Typed handoff threshold config stored in voice_registry.rule_config (JSONB).
 * All fields optional — missing fields fall back to SAFE_HANDOFF_DEFAULTS.
 */
export interface HandoffRuleConfig {
  /** Warm transfer only allowed when classify body contains warm_transfer_ready: true */
  transfer_requires_warm_ready?: boolean;
  /** Default hours ahead to schedule callbacks when no specific time given */
  callback_default_hours_ahead?: number;
  /** Max days ahead an operator can book a callback */
  max_callback_window_days?: number;
  /** If the caller matches no known lead, route to Logan (not autonomous) */
  defer_to_logan_if_lead_unknown?: boolean;
  /** Always create a follow-up task when a seller is answered (not just transferred) */
  auto_create_task_on_seller_answered?: boolean;
  /** Minimum chars required in situation_summary before commit is allowed */
  min_situation_summary_chars?: number;
  /** Whether subject_address is required before a warm transfer can proceed */
  require_subject_address_for_transfer?: boolean;
}

/** Conservative defaults used if no active handoff_rule is found in DB */
export const SAFE_HANDOFF_DEFAULTS: Required<HandoffRuleConfig> = {
  transfer_requires_warm_ready:          true,
  callback_default_hours_ahead:          24,
  max_callback_window_days:              14,
  defer_to_logan_if_lead_unknown:        true,
  auto_create_task_on_seller_answered:   true,
  min_situation_summary_chars:           20,
  require_subject_address_for_transfer:  false,
};

// ── Static fallback entries ───────────────────────────────────────────────────

const STATIC_SCRIPTS: Record<string, VoiceMeta> = {
  "inbound_greeting@1.0.0": {
    workflow:      "inbound_greeting",
    registry_type: "script",
    version:       "1.0.0",
    status:        "active",
    description:   'Confirm caller identity first: "Who am I speaking with?" Then confirm intent: "…calling about a property you may want to sell?"',
  },
  "seller_qualifying@1.0.0": {
    workflow:      "seller_qualifying",
    registry_type: "script",
    version:       "1.0.0",
    status:        "active",
    description:   "Open questions: location, occupancy, motivation. Use qual checklist. Listen, don't fill silence.",
  },
  "callback_booking@1.0.0": {
    workflow:      "callback_booking",
    registry_type: "script",
    version:       "1.0.0",
    status:        "active",
    description:   "Confirm time before logging. Verify phone number. Never promise without logging.",
  },
  "warm_transfer@1.0.0": {
    workflow:      "warm_transfer",
    registry_type: "script",
    version:       "1.0.0",
    status:        "active",
    description:   "Handoff note required: address, name, situation. Fallback always = callback booking.",
  },
};

const STATIC_HANDOFF_RULE: HandoffRuleConfig = SAFE_HANDOFF_DEFAULTS;

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Returns all rows from voice_registry, ordered by workflow + created_at DESC.
 * Never throws — returns empty array on error.
 */
export async function getAllVoiceEntries(): Promise<VoiceRegistryRow[]> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("voice_registry") as any)
      .select("*")
      .order("workflow", { ascending: true })
      .order("created_at", { ascending: false });

    if (error || !data) {
      console.warn("[voice-registry] getAllVoiceEntries failed:", error?.message);
      return [];
    }
    return data as VoiceRegistryRow[];
  } catch (e) {
    console.warn("[voice-registry] getAllVoiceEntries threw:", e);
    return [];
  }
}

/**
 * Returns the active script VoiceMeta for a given workflow.
 * Falls back to static defaults on error or miss.
 */
export async function getActiveScript(workflow: string): Promise<VoiceMeta | null> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("voice_registry") as any)
      .select("workflow, registry_type, version, status, description")
      .eq("workflow", workflow)
      .eq("registry_type", "script")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) return data as VoiceMeta;
  } catch { /* fall through */ }

  // Static fallback — find active entry for this workflow
  const key = Object.keys(STATIC_SCRIPTS).find(k => {
    const m = STATIC_SCRIPTS[k];
    return m.workflow === workflow && m.status === "active";
  });
  return key ? STATIC_SCRIPTS[key] : null;
}

/**
 * Returns the active HandoffRuleConfig, merged with SAFE_HANDOFF_DEFAULTS.
 * Any missing keys in the DB config are filled from defaults.
 * Never throws.
 */
export async function getActiveHandoffRule(): Promise<{
  version:     string;
  rule_config: Required<HandoffRuleConfig>;
}> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("voice_registry") as any)
      .select("version, rule_config")
      .eq("workflow", "handoff_rules")
      .eq("registry_type", "handoff_rule")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.rule_config) {
      return {
        version:     data.version as string,
        rule_config: { ...SAFE_HANDOFF_DEFAULTS, ...(data.rule_config as HandoffRuleConfig) },
      };
    }
  } catch { /* fall through */ }

  return { version: "1.0.0", rule_config: SAFE_HANDOFF_DEFAULTS };
}

/**
 * Resolves active script versions for all voice workflows in one query.
 * Returns a map of workflow → { version, description }.
 * Used by review surfaces to show "what was active" at a glance.
 */
export async function getActiveScriptVersionMap(): Promise<Record<string, { version: string; description: string | null }>> {
  const result: Record<string, { version: string; description: string | null }> = {};

  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("voice_registry") as any)
      .select("workflow, version, description")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (!error && data) {
      for (const row of data as { workflow: string; version: string; description: string | null }[]) {
        if (!result[row.workflow]) {
          result[row.workflow] = { version: row.version, description: row.description };
        }
      }
    }
  } catch { /* fall through */ }

  // Fill missing workflows from static fallback
  for (const [key, meta] of Object.entries(STATIC_SCRIPTS)) {
    if (meta.status === "active" && !result[meta.workflow]) {
      result[meta.workflow] = { version: meta.version, description: meta.description };
    }
  }
  if (!result["handoff_rules"]) {
    result["handoff_rules"] = { version: "1.0.0", description: "Baseline conservative handoff thresholds." };
  }

  return result;
}
