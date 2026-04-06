import OpenAI from "openai";
import { logGeneration } from "@/lib/langfuse";

const DEFAULT_EXECUTIVE_MODEL = "gpt-5.4";

function readEnvSecret(key: string): string {
  const value = process.env[key]?.trim() || "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function extractOutputText(response: unknown): string {
  const typed = response as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof typed.output_text === "string" && typed.output_text.length > 0) {
    return typed.output_text;
  }

  const chunks: string[] = [];
  for (const item of typed.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (
        (content.type === "output_text" || content.type === "text") &&
        typeof content.text === "string"
      ) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("").trim();
}

function reasoningEffortForModel(model: string): "medium" | "high" {
  return model.includes("mini") ? "medium" : "high";
}

export async function analyzeWithOpenAIReasoning(opts: {
  prompt: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  traceId?: string;
  generationName?: string;
}): Promise<string> {
  const apiKey = readEnvSecret("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const {
    prompt,
    systemPrompt,
    temperature = 0.2,
    maxTokens = 8192,
    model = DEFAULT_EXECUTIVE_MODEL,
    timeoutMs,
    maxRetries,
  } = opts;

  const client = new OpenAI({
    apiKey,
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
  });

  const response = await client.responses.create({
    model,
    reasoning: { effort: reasoningEffortForModel(model) },
    temperature,
    max_output_tokens: maxTokens,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: [
      {
        role: "developer" as const,
        content: [{ type: "input_text" as const, text: systemPrompt }],
      },
      {
        role: "user" as const,
        content: [{ type: "input_text" as const, text: prompt }],
      },
    ] as any,
  });

  const output = extractOutputText(response);

  if (opts.traceId) {
    logGeneration({
      traceId: opts.traceId,
      name: opts.generationName ?? "analyzeWithOpenAIReasoning",
      model,
      input: { system: systemPrompt.slice(0, 500), prompt: prompt.slice(0, 1000) },
      output: output.slice(0, 1000),
      metadata: {
        temperature,
        maxTokens,
        timeoutMs,
        maxRetries,
      },
    });
  }

  return output;
}
