/**
 * Sentinel Durable Workflow Engine
 *
 * Lightweight workflow orchestration for multi-step processes that need:
 * - Persistence across serverless function boundaries
 * - Retry on failure
 * - Step-by-step progress tracking
 * - Timeout handling
 * - Human-in-the-loop approval gates
 *
 * This is NOT a replacement for Trigger.dev or Mastra — it's a minimal
 * engine that runs within Vercel's serverless constraints (max 120s per step).
 *
 * Architecture:
 * - Workflows defined as arrays of steps
 * - State stored in Supabase (workflow_runs table)
 * - Each step is a function that returns { output, nextStep? }
 * - Steps can pause for human approval (await_approval gate)
 * - Cron resumes paused workflows
 *
 * Write path: workflow_runs is control plane domain — never writes to CRM directly.
 * Steps that need CRM writes must go through the canonical write path.
 */

import { createServerClient } from "@/lib/supabase";

// ── Types ───────────────────────────────────────────────────────────

export interface WorkflowStep {
  name: string;
  handler: (context: WorkflowContext) => Promise<StepResult>;
  timeout?: number; // ms, default 30000
  retries?: number; // default 1
}

export interface StepResult {
  output: Record<string, unknown>;
  nextStep?: string; // Override next step (for branching)
  pause?: boolean; // Pause for human approval
  pauseReason?: string;
}

export interface WorkflowContext {
  runId: string;
  workflowName: string;
  inputs: Record<string, unknown>;
  stepOutputs: Record<string, Record<string, unknown>>; // outputs from previous steps
  currentStep: string;
  attempt: number;
}

export interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
  onComplete?: (context: WorkflowContext) => Promise<void>;
  onFail?: (context: WorkflowContext, error: string) => Promise<void>;
}

export interface WorkflowRun {
  id: string;
  workflow_name: string;
  status: string;
  current_step: string;
  inputs: Record<string, unknown>;
  step_outputs: Record<string, Record<string, unknown>>;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

// ── Workflow Registry ───────────────────────────────────────────────

const REGISTRY: Map<string, WorkflowDefinition> = new Map();

export function registerWorkflow(def: WorkflowDefinition): void {
  REGISTRY.set(def.name, def);
}

export function getWorkflow(name: string): WorkflowDefinition | undefined {
  return REGISTRY.get(name);
}

// ── Workflow Lifecycle ──────────────────────────────────────────────

/**
 * Start a new workflow run.
 */
export async function startWorkflow(
  workflowName: string,
  inputs: Record<string, unknown>,
): Promise<string> {
  const def = REGISTRY.get(workflowName);
  if (!def) throw new Error(`Workflow "${workflowName}" not registered`);
  if (def.steps.length === 0) throw new Error(`Workflow "${workflowName}" has no steps`);

  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("workflow_runs") as any)
    .insert({
      workflow_name: workflowName,
      status: "running",
      current_step: def.steps[0].name,
      inputs,
      step_outputs: {},
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to start workflow: ${error.message}`);

  // Execute first step
  executeStep(data.id, workflowName).catch((err) => {
    console.error(`[workflow] Failed to execute first step of ${workflowName}:`, err);
  });

  return data.id;
}

/**
 * Execute the current step of a workflow run.
 */
export async function executeStep(runId: string, workflowName?: string): Promise<void> {
  const sb = createServerClient();

  // Get run state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: run } = await (sb.from("workflow_runs") as any)
    .select("*")
    .eq("id", runId)
    .single();

  if (!run) throw new Error(`Workflow run ${runId} not found`);
  if (run.status !== "running" && run.status !== "retry_scheduled") return; // Already completed/failed/paused

  const name = workflowName ?? run.workflow_name;
  const def = REGISTRY.get(name);
  if (!def) throw new Error(`Workflow "${name}" not registered`);

  const stepDef = def.steps.find((s) => s.name === run.current_step);
  if (!stepDef) {
    await failRun(runId, `Step "${run.current_step}" not found in workflow definition`);
    return;
  }

  const context: WorkflowContext = {
    runId,
    workflowName: name,
    inputs: run.inputs,
    stepOutputs: run.step_outputs ?? {},
    currentStep: run.current_step,
    attempt: 1,
  };

  try {
    const result = await Promise.race([
      stepDef.handler(context),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Step timeout")), stepDef.timeout ?? 30000),
      ),
    ]);

    // Store step output
    const updatedOutputs = { ...run.step_outputs, [run.current_step]: result.output };

    if (result.pause) {
      // Pause for human approval
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("workflow_runs") as any)
        .update({
          status: "awaiting_approval",
          step_outputs: updatedOutputs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return;
    }

    // Determine next step
    const currentIdx = def.steps.findIndex((s) => s.name === run.current_step);
    let nextStepName: string | null = null;

    if (result.nextStep) {
      nextStepName = result.nextStep;
    } else if (currentIdx < def.steps.length - 1) {
      nextStepName = def.steps[currentIdx + 1].name;
    }

    if (nextStepName) {
      // Move to next step
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("workflow_runs") as any)
        .update({
          current_step: nextStepName,
          step_outputs: updatedOutputs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);

      // Execute next step
      await executeStep(runId, name);
    } else {
      // Workflow complete
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("workflow_runs") as any)
        .update({
          status: "completed",
          step_outputs: updatedOutputs,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      if (def.onComplete) {
        await def.onComplete({ ...context, stepOutputs: updatedOutputs });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Retry logic — cap at 3 retries regardless of step config to prevent runaway loops
    const MAX_RETRIES = 3;
    const stepMaxRetries = Math.min(stepDef.retries ?? 1, MAX_RETRIES);
    const attempts = (run.step_outputs?.[`${run.current_step}_attempts`] as number) ?? 0;

    if (attempts < stepMaxRetries) {
      const nextAttempt = attempts + 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("workflow_runs") as any)
        .update({
          status: "retry_scheduled",
          step_outputs: {
            ...run.step_outputs,
            [`${run.current_step}_attempts`]: nextAttempt,
            [`${run.current_step}_last_error`]: msg,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);

      console.warn(
        `[workflow] Step "${run.current_step}" failed (attempt ${nextAttempt}/${stepMaxRetries}), retrying in 2s: ${msg}`,
      );

      // Retry after brief delay — on failure, write terminal state instead of swallowing
      setTimeout(() => {
        // Re-set status to running before executing so executeStep doesn't bail on status check
        const sbRetry = createServerClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sbRetry.from("workflow_runs") as any)
          .update({ status: "running", updated_at: new Date().toISOString() })
          .eq("id", runId)
          .then(() => executeStep(runId, name))
          .catch(async (retryErr: unknown) => {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.error(
              `[workflow] Retry of step "${run.current_step}" failed fatally: ${retryMsg}`,
            );
            await failRun(runId, `Retry failed: ${retryMsg} (after ${nextAttempt} attempts)`);
            if (def.onFail) {
              await def.onFail(context, retryMsg).catch(() => {});
            }
          });
      }, 2000);
    } else {
      const finalMsg = `${msg} (exhausted ${stepMaxRetries} retries)`;
      await failRun(runId, finalMsg);
      if (def.onFail) {
        await def.onFail(context, finalMsg);
      }
    }
  }
}

/**
 * Resume a paused workflow (after human approval).
 */
export async function resumeWorkflow(runId: string): Promise<void> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: run } = await (sb.from("workflow_runs") as any)
    .select("workflow_name, status, current_step")
    .eq("id", runId)
    .single();

  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== "awaiting_approval") throw new Error(`Run ${runId} is not awaiting approval`);

  const def = REGISTRY.get(run.workflow_name);
  if (!def) throw new Error(`Workflow "${run.workflow_name}" not registered`);

  // Move to next step
  const currentIdx = def.steps.findIndex((s) => s.name === run.current_step);
  const nextStep = currentIdx < def.steps.length - 1 ? def.steps[currentIdx + 1].name : null;

  if (nextStep) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("workflow_runs") as any)
      .update({
        status: "running",
        current_step: nextStep,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await executeStep(runId, run.workflow_name);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("workflow_runs") as any)
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }
}

async function failRun(runId: string, error: string): Promise<void> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("workflow_runs") as any)
    .update({
      status: "failed",
      error,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

/**
 * List workflow runs with optional filters.
 */
export async function listWorkflowRuns(filters?: {
  workflowName?: string;
  status?: string;
  limit?: number;
}): Promise<WorkflowRun[]> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("workflow_runs") as any)
    .select("*")
    .order("started_at", { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.workflowName) query = query.eq("workflow_name", filters.workflowName);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data } = await query;
  return data ?? [];
}
