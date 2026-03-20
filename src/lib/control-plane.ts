/**
 * Control Plane Service Layer
 *
 * Shared utilities for agent run tracking, review queue submission,
 * and feature flag checking. Used by all agents and the cron routes.
 *
 * Blueprint Section 4.1: "Nothing durable writes without traceability."
 * Blueprint Section 4.4: "Agents write proposals to review queues or draft tables."
 */

import { createServerClient } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────────────

export interface CreateRunInput {
  agentName: string;
  triggerType: "cron" | "manual" | "event" | "webhook";
  triggerRef?: string;
  leadId?: string;
  inputs?: Record<string, unknown>;
  promptVersion?: string;
  model?: string;
}

export interface CompleteRunInput {
  runId: string;
  status: "completed" | "failed" | "cancelled";
  outputs?: Record<string, unknown>;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
}

export interface SubmitProposalInput {
  runId: string;
  agentName: string;
  entityType: string;
  entityId?: string;
  action: string;
  proposal: Record<string, unknown>;
  rationale?: string;
  priority?: number;
  expiresAt?: string;
}

export interface AgentRun {
  id: string;
  agent_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
}

export interface FeatureFlag {
  flag_key: string;
  enabled: boolean;
  mode: string;
  metadata: Record<string, unknown>;
}

// ─── Run Lifecycle ──────────────────────────────────────────────────

/**
 * Create a new agent run. Returns the run ID for tracing.
 * Call this at the start of every agent invocation.
 */
export async function createAgentRun(input: CreateRunInput): Promise<string> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("agent_runs") as any)
    .insert({
      agent_name: input.agentName,
      trigger_type: input.triggerType,
      trigger_ref: input.triggerRef ?? null,
      lead_id: input.leadId ?? null,
      inputs: input.inputs ?? {},
      prompt_version: input.promptVersion ?? null,
      model: input.model ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create agent run: ${error.message}`);
  return data.id;
}

/**
 * Complete an agent run. Call this when the agent finishes (success or failure).
 */
export async function completeAgentRun(input: CompleteRunInput): Promise<void> {
  const sb = createServerClient();
  const durationMs =
    Date.now() - Date.parse((await getRunStartedAt(input.runId)) ?? new Date().toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("agent_runs") as any)
    .update({
      status: input.status,
      outputs: input.outputs ?? {},
      error: input.error ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      cost_cents: input.costCents ?? null,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.runId);

  if (error) {
    console.error(`[control-plane] Failed to complete run ${input.runId}:`, error.message);
  }
}

async function getRunStartedAt(runId: string): Promise<string | null> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("agent_runs") as any)
    .select("started_at")
    .eq("id", runId)
    .single();
  return data?.started_at ?? null;
}

// ─── Review Queue ───────────────────────────────────────────────────

/**
 * Submit a proposal to the review queue. Agents call this when they
 * want to propose a CRM write that requires operator approval.
 */
export async function submitProposal(input: SubmitProposalInput): Promise<string> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("review_queue") as any)
    .insert({
      run_id: input.runId,
      agent_name: input.agentName,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      proposal: input.proposal,
      rationale: input.rationale ?? null,
      priority: input.priority ?? 5,
      expires_at: input.expiresAt ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to submit proposal: ${error.message}`);
  return data.id;
}

// ─── Feature Flags ──────────────────────────────────────────────────

/**
 * Check whether an agent is enabled and what mode it should run in.
 * Returns null if the flag doesn't exist (treat as disabled).
 */
export async function getFeatureFlag(flagKey: string): Promise<FeatureFlag | null> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("feature_flags") as any)
    .select("flag_key, enabled, mode, metadata")
    .eq("flag_key", flagKey)
    .maybeSingle();

  if (error) {
    console.error(`[control-plane] Failed to read flag ${flagKey}:`, error.message);
    return null;
  }

  return data;
}

/**
 * Check if an agent is enabled. Returns false if flag doesn't exist.
 */
export async function isAgentEnabled(agentName: string): Promise<boolean> {
  const flag = await getFeatureFlag(`agent.${agentName}.enabled`);
  return flag?.enabled ?? false;
}

/**
 * Get the run mode for an agent. Returns 'off' if not found.
 */
export async function getAgentMode(agentName: string): Promise<string> {
  const flag = await getFeatureFlag(`agent.${agentName}.enabled`);
  return flag?.mode ?? "off";
}
