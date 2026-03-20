import OpenAI from "openai";
import type { AssembledPrompt } from "./prompt-cache";

export type DialerAiLane =
  | "pre_call_brief"
  | "summarize"
  | "draft_note"
  | "qa_notes"
  | "inbound_assist"
  | "objection_strategy";

export interface DialerAiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DialerAiCompletionInput {
  lane: DialerAiLane;
  messages: DialerAiMessage[];
  temperature?: number;
}

/** Extended input that accepts a pre-assembled layered prompt. */
export interface DialerAiLayeredInput {
  lane: DialerAiLane;
  assembled: AssembledPrompt;
  temperature?: number;
}

export interface DialerAiCompletionOutput {
  text: string;
  provider: "openai";
  model: string;
  /** Present when called via completeDialerAiLayered — layer byte sizes for cache analysis */
  layerSizes?: { stable: number; semiStable: number; dynamic: number };
}

const DEFAULT_FAST_MODEL = "gpt-5-mini";
const DEFAULT_HEAVY_MODEL = "gpt-5.4";

function resolveProvider(): "openai" {
  const provider = (process.env.DIALER_AI_PROVIDER ?? "openai").toLowerCase();
  if (provider !== "openai") {
    throw new Error(`Unsupported DIALER_AI_PROVIDER "${provider}". Only "openai" is supported in this migration.`);
  }
  return "openai";
}

function resolveModelForLane(lane: DialerAiLane): string {
  const fast = process.env.DIALER_AI_MODEL_FAST ?? DEFAULT_FAST_MODEL;
  const heavy = process.env.DIALER_AI_MODEL_HEAVY ?? DEFAULT_HEAVY_MODEL;

  switch (lane) {
    case "pre_call_brief":
      return process.env.DIALER_AI_MODEL_PRE_CALL_BRIEF ?? heavy;
    case "summarize":
      return process.env.DIALER_AI_MODEL_SUMMARIZE ?? fast;
    case "draft_note":
      return process.env.DIALER_AI_MODEL_DRAFT_NOTE ?? fast;
    case "qa_notes":
      return process.env.DIALER_AI_MODEL_QA_NOTES ?? fast;
    case "inbound_assist":
      return process.env.DIALER_AI_MODEL_INBOUND_ASSIST ?? fast;
    case "objection_strategy":
      return process.env.DIALER_AI_MODEL_OBJECTION_STRATEGY ?? fast;
    default:
      return fast;
  }
}

function extractOutputText(response: unknown): string {
  const r = response as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof r.output_text === "string" && r.output_text.length > 0) {
    return r.output_text;
  }

  const chunks: string[] = [];
  for (const item of r.output ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && typeof c.text === "string") {
        chunks.push(c.text);
      }
    }
  }
  return chunks.join("").trim();
}

export function getDialerOpenAiApiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

export async function completeDialerAi(input: DialerAiCompletionInput): Promise<DialerAiCompletionOutput> {
  const provider = resolveProvider();
  const apiKey = getDialerOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = resolveModelForLane(input.lane);
  const client = new OpenAI({ apiKey });

  // Use Responses API so GPT-5 family model support stays aligned with OpenAI.
  const response = await client.responses.create({
    model,
    temperature: input.temperature ?? 0,
    // Responses API uses "developer" instead of "system".
    // Keep route-level prompts unchanged; map here centrally.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: input.messages.map((m) => ({
      role: m.role === "system" ? "developer" : m.role,
      content: [{ type: "input_text", text: m.content }],
    })) as any,
  });

  return {
    text: extractOutputText(response),
    provider,
    model,
  };
}

/**
 * Complete using a pre-assembled 3-layer prompt.
 *
 * The assembled prompt's systemMessage is already ordered for cache optimization:
 * stable base → semi-stable context → per-call dynamic.
 *
 * OpenAI automatically caches the longest matching prefix of identical tokens
 * across requests (for prompts > 1024 tokens). By keeping stable content first,
 * repeated calls for the same lead hit the cache on Layers 1+2.
 */
export async function completeDialerAiLayered(input: DialerAiLayeredInput): Promise<DialerAiCompletionOutput> {
  const provider = resolveProvider();
  const apiKey = getDialerOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = resolveModelForLane(input.lane);
  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model,
    temperature: input.temperature ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: [
      {
        role: "developer" as const,
        content: [{ type: "input_text" as const, text: input.assembled.systemMessage }],
      },
      {
        role: "user" as const,
        content: [{ type: "input_text" as const, text: input.assembled.userMessage }],
      },
    ] as any,
  });

  return {
    text: extractOutputText(response),
    provider,
    model,
    layerSizes: input.assembled.layerSizes,
  };
}
