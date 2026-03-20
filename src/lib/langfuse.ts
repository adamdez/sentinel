/**
 * Langfuse Observability Client
 *
 * Wraps the Langfuse SDK to provide trace/span/generation tracking
 * for all Sentinel agent runs. Every agent invocation gets a Langfuse
 * trace linked to the control plane run ID.
 *
 * Blueprint Section 4.1: "Nothing durable writes without traceability."
 *
 * Setup:
 *   LANGFUSE_PUBLIC_KEY — from Langfuse dashboard
 *   LANGFUSE_SECRET_KEY — from Langfuse dashboard
 *   LANGFUSE_BASE_URL   — defaults to https://cloud.langfuse.com
 *
 * If LANGFUSE_SECRET_KEY is not set, all functions are no-ops.
 * This allows the system to run without Langfuse during development.
 */

import { Langfuse } from "langfuse";

// ── Singleton Client ────────────────────────────────────────────────

let _client: Langfuse | null = null;

function getClient(): Langfuse | null {
  if (_client) return _client;

  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;

  if (!secretKey || !publicKey) {
    return null; // Langfuse not configured — all calls are no-ops
  }

  _client = new Langfuse({
    secretKey,
    publicKey,
    baseUrl: process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
    // Flush on shutdown
    flushAt: 5,
    flushInterval: 5000,
  });

  return _client;
}

/**
 * Check if Langfuse is configured and available.
 */
export function isLangfuseConfigured(): boolean {
  return !!process.env.LANGFUSE_SECRET_KEY && !!process.env.LANGFUSE_PUBLIC_KEY;
}

// ── Trace Interface ─────────────────────────────────────────────────

export interface TraceInput {
  /** Control plane run ID — links Langfuse trace to agent_runs table */
  runId: string;
  /** Agent name (e.g., "follow-up", "research", "qa") */
  agentName: string;
  /** What triggered this run */
  triggerType: string;
  /** Lead ID if applicable */
  leadId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface SpanInput {
  /** Parent trace or span ID */
  traceId: string;
  /** Span name (e.g., "fetch_lead_data", "generate_draft", "submit_proposal") */
  name: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface GenerationInput {
  /** Parent trace ID */
  traceId: string;
  /** Generation name (e.g., "draft_follow_up_sms", "analyze_call") */
  name: string;
  /** Model used */
  model: string;
  /** Input to the model */
  input: unknown;
  /** Output from the model */
  output?: unknown;
  /** Token usage */
  usage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ── Trace Operations ────────────────────────────────────────────────

/**
 * Start a new Langfuse trace for an agent run.
 * Returns the trace ID (same as runId for linking).
 */
export function startTrace(input: TraceInput): string {
  const client = getClient();
  if (!client) return input.runId;

  client.trace({
    id: input.runId,
    name: `agent.${input.agentName}`,
    userId: "system",
    metadata: {
      agentName: input.agentName,
      triggerType: input.triggerType,
      leadId: input.leadId,
      ...input.metadata,
    },
    tags: [input.agentName, input.triggerType],
  });

  return input.runId;
}

/**
 * Create a span within a trace (for sub-operations like data fetching, scoring).
 * Returns a span object with an end() method.
 */
export function startSpan(input: SpanInput): { end: (output?: Record<string, unknown>) => void } {
  const client = getClient();
  if (!client) return { end: () => {} };

  const span = client.span({
    traceId: input.traceId,
    name: input.name,
    metadata: input.metadata,
  });

  return {
    end: (output?: Record<string, unknown>) => {
      span.end({
        output,
      });
    },
  };
}

/**
 * Log an LLM generation (prompt + completion) within a trace.
 */
export function logGeneration(input: GenerationInput): void {
  const client = getClient();
  if (!client) return;

  client.generation({
    traceId: input.traceId,
    name: input.name,
    model: input.model,
    input: input.input,
    output: input.output,
    usage: input.usage,
    metadata: input.metadata,
  });
}

/**
 * End a trace with final status and output.
 */
export function endTrace(
  traceId: string,
  status: "completed" | "failed" | "cancelled",
  output?: Record<string, unknown>,
): void {
  const client = getClient();
  if (!client) return;

  client.trace({
    id: traceId,
    output,
    metadata: { finalStatus: status },
  });
}

/**
 * Score a trace (e.g., quality rating from QA agent).
 */
export function scoreTrace(
  traceId: string,
  name: string,
  value: number,
  comment?: string,
): void {
  const client = getClient();
  if (!client) return;

  client.score({
    traceId,
    name,
    value,
    comment,
  });
}

/**
 * Flush pending events to Langfuse.
 * Call this at the end of cron jobs / serverless functions.
 */
export async function flushLangfuse(): Promise<void> {
  const client = getClient();
  if (!client) return;

  await client.flushAsync();
}

// ── Convenience: Wrap an entire agent run ────────────────────────────

/**
 * Higher-order wrapper for agent execution.
 * Automatically creates trace, handles errors, and flushes.
 *
 * Usage:
 *   const result = await withLangfuseTrace(
 *     { runId, agentName: "follow-up", triggerType: "cron" },
 *     async (traceId) => {
 *       // your agent logic here
 *       logGeneration({ traceId, name: "draft", model: "claude-sonnet-4-6", input: prompt, output: response });
 *       return { drafted: true };
 *     }
 *   );
 */
export async function withLangfuseTrace<T>(
  input: TraceInput,
  fn: (traceId: string) => Promise<T>,
): Promise<T> {
  const traceId = startTrace(input);

  try {
    const result = await fn(traceId);
    endTrace(traceId, "completed", { result: result as unknown as Record<string, unknown> });
    await flushLangfuse();
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    endTrace(traceId, "failed", { error: msg });
    await flushLangfuse();
    throw error;
  }
}
