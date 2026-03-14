/**
 * Stub STT provider — dev/test ONLY.
 *
 * Import this file in test setup or a dev-only entry point to register
 * the "stub" provider. Never import this from production code paths.
 *
 * BOUNDARY RULE: imports only from ./stt-provider
 */

import { registerSTTProvider } from "./stt-provider";
import type { TranscriptChunk } from "./stt-provider";

const STUB_TRACE = {
  model: "stub",
  provider: "stub",
  latency_ms: 0,
  generated_at: new Date(0).toISOString(),
};

registerSTTProvider("stub", {
  name: "stub",

  async transcribe(_chunk: Buffer, _sessionId: string) {
    const chunk: TranscriptChunk = {
      text: "[stub transcript chunk]",
      speaker: "operator",
      confidence: 1.0,
      start_ms: 0,
      end_ms: 1000,
      is_final: true,
    };
    return { chunks: [chunk], trace: STUB_TRACE };
  },

  async streamSession(sessionId: string, onChunk: (c: TranscriptChunk) => void) {
    onChunk({
      text: "[stub stream open]",
      speaker: "operator",
      confidence: 1.0,
      start_ms: 0,
      end_ms: 0,
      is_final: false,
    });
    return {
      sessionId,
      stop: async () => {},
    };
  },
});
