/**
 * STT Provider abstraction — PR2
 *
 * Pure interface and registry. Zero concrete providers in this file.
 * Concrete providers (PR4+) call registerSTTProvider() at boot time.
 *
 * BOUNDARY RULES:
 *   - This file imports ONLY from ./types
 *   - Never import from @/lib/supabase or any CRM module
 *   - Never auto-import stt-stub.ts — callers import it explicitly
 */

import type { TraceMetadata } from "./types";

// ─────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────

export interface TranscriptChunk {
  text: string;
  speaker: "operator" | "seller";
  confidence: number;      // 0.00–1.00
  start_ms: number;
  end_ms: number;
  is_final: boolean;
}

export interface STTSessionHandle {
  sessionId: string;
  stop(): Promise<void>;
}

export interface TranscriptResult {
  chunks: TranscriptChunk[];
  trace: TraceMetadata;
}

export interface STTProvider {
  readonly name: STTProviderName;
  transcribe(audioChunk: Buffer, sessionId: string): Promise<TranscriptResult>;
  streamSession(
    sessionId: string,
    onChunk: (chunk: TranscriptChunk) => void,
  ): Promise<STTSessionHandle>;
}

export type STTProviderName = "stub" | "deepgram" | "assemblyai" | "whisper";

// ─────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────

const _registry = new Map<STTProviderName, STTProvider>();

export function registerSTTProvider(name: STTProviderName, provider: STTProvider): void {
  _registry.set(name, provider);
}

/**
 * Retrieves a registered provider by name.
 * Throws if the provider has not been registered — callers must import
 * the provider module before calling this.
 */
export function getSTTProvider(name: STTProviderName): STTProvider {
  const p = _registry.get(name);
  if (!p) {
    throw new Error(
      `[Dialer/stt] Provider "${name}" not registered. Import the provider module to register it.`,
    );
  }
  return p;
}

/**
 * Returns the provider named by the STT_PROVIDER env var, or null if
 * no provider is configured / registered.
 */
export function getActiveSTTProvider(): STTProvider | null {
  const name = process.env.STT_PROVIDER as STTProviderName | undefined;
  if (!name) return null;
  return _registry.get(name) ?? null;
}
