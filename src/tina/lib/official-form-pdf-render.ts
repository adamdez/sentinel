import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { canExportTinaOfficialFormPacket } from "@/tina/lib/official-form-coverage";
import {
  buildTinaOfficialFormPdfPayload,
  getTinaOfficialFormPdfFileName,
} from "@/tina/lib/official-form-pdf";
import type { TinaWorkspaceDraft } from "@/tina/types";

interface TinaPythonCommandCandidate {
  command: string;
  argsPrefix: string[];
}

interface TinaPdfRendererResult {
  fileName: string;
  mimeType: "application/pdf";
  bytes: Buffer;
}

function dedupeCandidates(
  candidates: TinaPythonCommandCandidate[]
): TinaPythonCommandCandidate[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = `${candidate.command}::${candidate.argsPrefix.join(" ")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getTinaOfficialFormPythonCandidates(
  platform: NodeJS.Platform = process.platform,
  override = process.env.TINA_PYTHON_BIN?.trim() || null
): TinaPythonCommandCandidate[] {
  const candidates: TinaPythonCommandCandidate[] = [];

  if (override) {
    candidates.push({ command: override, argsPrefix: [] });
  }

  candidates.push({ command: "python", argsPrefix: [] });

  if (platform === "win32") {
    candidates.push({ command: "py", argsPrefix: ["-3"] });
  }

  candidates.push({ command: "python3", argsPrefix: [] });

  return dedupeCandidates(candidates);
}

function runPythonRenderer(
  candidate: TinaPythonCommandCandidate,
  scriptPath: string,
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(candidate.command, [...candidate.argsPrefix, scriptPath, inputPath, outputPath], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const commandLabel = [candidate.command, ...candidate.argsPrefix].join(" ");
      reject(new Error(stderr || `${commandLabel} exited with code ${code}`));
    });
  });
}

async function runPythonRendererWithFallbacks(
  scriptPath: string,
  inputPath: string,
  outputPath: string
): Promise<void> {
  const candidates = getTinaOfficialFormPythonCandidates();
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      await runPythonRenderer(candidate, scriptPath, inputPath, outputPath);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown renderer error";

      failures.push(`${[candidate.command, ...candidate.argsPrefix].join(" ")}: ${message}`);
    }
  }

  throw new Error(
    failures.length > 0
      ? `Tina could not render the PDF packet. ${failures.join(" | ")}`
      : "Tina could not render the PDF packet."
  );
}

export async function renderTinaOfficialFormPdf(
  draft: TinaWorkspaceDraft
): Promise<TinaPdfRendererResult> {
  if (!canExportTinaOfficialFormPacket(draft)) {
    throw new Error("Federal business form packet is not export-ready yet.");
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "tina-official-form-"));
  const inputPath = path.join(workDir, "packet.json");
  const outputPath = path.join(workDir, "packet.pdf");
  const scriptPath = path.join(process.cwd(), "scripts", "tina_render_official_form_packet.py");

  try {
    const payload = buildTinaOfficialFormPdfPayload(draft);
    await writeFile(inputPath, JSON.stringify(payload, null, 2), "utf8");
    await runPythonRendererWithFallbacks(scriptPath, inputPath, outputPath);

    return {
      fileName: getTinaOfficialFormPdfFileName(draft),
      mimeType: "application/pdf",
      bytes: await readFile(outputPath),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
