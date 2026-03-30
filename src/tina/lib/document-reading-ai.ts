import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  TinaDocumentReading,
  TinaDocumentReadingFact,
  TinaStoredDocument,
} from "@/tina/types";

const TINA_DOCUMENT_READING_MODEL = process.env.TINA_AI_MODEL_READING ?? "gpt-5.4";
const TINA_ALLOWED_FACT_LABELS = [
  "Business name",
  "Tax year",
  "Return type hint",
  "LLC tax treatment clue",
  "LLC election clue",
  "Community property clue",
  "State clue",
  "Accounting method clue",
  "Revenue clue",
  "Net income clue",
  "Payroll clue",
  "Sales tax clue",
  "Partial file warning",
] as const;

const TinaAiDocumentReadingSchema = z.object({
  summary: z.string().min(1).max(240),
  nextStep: z.string().min(1).max(240),
  facts: z
    .array(
      z.object({
        label: z.enum(TINA_ALLOWED_FACT_LABELS),
        value: z.string().min(1).max(160),
        confidence: z.enum(["high", "medium", "low"]),
      })
    )
    .max(6),
  detailLines: z.array(z.string().min(1).max(200)).max(5),
});

type TinaAiDocumentReadingResult = z.infer<typeof TinaAiDocumentReadingSchema>;

function buildWaitingForAiReading(
  document: TinaStoredDocument,
  reason: string
): TinaDocumentReading {
  return {
    documentId: document.id,
    status: "waiting_for_ai",
    kind:
      document.mimeType.startsWith("image/") ||
      /\.(png|jpe?g|heic)$/i.test(document.name)
        ? "image"
        : document.mimeType.includes("word") || /\.(doc|docx)$/i.test(document.name)
          ? "word"
          : "pdf",
    summary: `Tina saved ${(document.requestLabel ?? document.name).toLowerCase()} and knows it needs a deeper read.`,
    nextStep: reason,
    facts: [],
    detailLines: [
      "This paper is safely saved in Tina's vault.",
      "Tina will use AI reading here when that service is available.",
    ],
    rowCount: null,
    headers: [],
    sheetNames: [],
    lastReadAt: new Date().toISOString(),
  };
}

function buildErrorReading(document: TinaStoredDocument): TinaDocumentReading {
  return {
    ...buildWaitingForAiReading(
      document,
      "Tina could not finish the deeper read this time. You can try again in a moment."
    ),
    status: "error",
    summary: "Tina tried to read this paper but hit a snag.",
  };
}

function sanitizeFactId(label: string, index: number): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base ? `${base}-${index + 1}` : `fact-${index + 1}`;
}

function toReadingFacts(result: TinaAiDocumentReadingResult): TinaDocumentReadingFact[] {
  return result.facts.map((fact, index) => ({
    id: sanitizeFactId(fact.label, index),
    label: fact.label,
    value: fact.value,
    confidence: fact.confidence,
  }));
}

function buildPrompt(document: TinaStoredDocument): string {
  const label = document.requestLabel ?? document.name;

  return [
    "You are Tina's tax-intake document reader.",
    "Read the file and extract only facts that are directly visible in it.",
    "Do not guess, do not make up tax positions, and do not invent missing values.",
    "Use plain language because the owner should be able to understand the result.",
    "Focus on facts that help bootstrap a business tax workspace.",
    "If a paper clearly shows how an LLC files federally, an LLC election, or a spouse/community-property owner path, capture that with the LLC-specific fact labels.",
    `Only use these fact labels when they apply: ${TINA_ALLOWED_FACT_LABELS.join(", ")}.`,
    `This paper was added for: ${label}.`,
  ].join(" ");
}

function buildFileInput(document: TinaStoredDocument, file: File) {
  if (document.mimeType.startsWith("image/") || /\.(png|jpe?g|heic)$/i.test(document.name)) {
    return file.arrayBuffer().then((buffer) => ({
      type: "input_image" as const,
      detail: "high" as const,
      image_url: `data:${document.mimeType};base64,${Buffer.from(buffer).toString("base64")}`,
    }));
  }

  return {
    type: "input_file" as const,
    upload: true as const,
    file,
  };
}

export async function readTinaDocumentWithAi(
  document: TinaStoredDocument,
  file: File
): Promise<TinaDocumentReading> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildWaitingForAiReading(
      document,
      "Spreadsheet reading is live today. Deeper reading with AI will start working here when the API key is available."
    );
  }

  const client = new OpenAI({ apiKey });
  const now = new Date().toISOString();
  let uploadedFileId: string | null = null;

  try {
    const inputAsset = await buildFileInput(document, file);
    const content =
      "upload" in inputAsset
        ? (() => {
            return client.files
              .create({
                file: inputAsset.file,
                purpose: "user_data",
                expires_after: {
                  anchor: "created_at",
                  seconds: 60 * 60,
                },
              })
              .then((uploaded) => {
                uploadedFileId = uploaded.id;
                return {
                  type: "input_file" as const,
                  file_id: uploaded.id,
                };
              });
          })()
        : Promise.resolve(inputAsset);

    const resolvedContent = await content;

    const response = await client.responses.parse({
      model: TINA_DOCUMENT_READING_MODEL,
      reasoning: { effort: "high" },
      text: {
        format: zodTextFormat(TinaAiDocumentReadingSchema, "tina_document_reading"),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: [
        {
          role: "developer" as const,
          content: [
            {
              type: "input_text" as const,
              text: buildPrompt(document),
            },
          ],
        },
        {
          role: "user" as const,
          content: [
            resolvedContent,
            {
              type: "input_text" as const,
              text: "Return a short summary, the next step, and a few grounded facts from the file.",
            },
          ],
        },
      ] as any,
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      return buildErrorReading(document);
    }

    return {
      documentId: document.id,
      status: "complete",
      kind:
        document.mimeType.startsWith("image/") || /\.(png|jpe?g|heic)$/i.test(document.name)
          ? "image"
          : document.mimeType.includes("word") || /\.(doc|docx)$/i.test(document.name)
            ? "word"
            : "pdf",
      summary: parsed.summary,
      nextStep: parsed.nextStep,
      facts: toReadingFacts(parsed),
      detailLines: parsed.detailLines,
      rowCount: null,
      headers: [],
      sheetNames: [],
      lastReadAt: now,
    };
  } catch {
    return buildErrorReading(document);
  } finally {
    if (uploadedFileId) {
      try {
        await client.files.delete(uploadedFileId);
      } catch {
        // Best effort cleanup only.
      }
    }
  }
}
