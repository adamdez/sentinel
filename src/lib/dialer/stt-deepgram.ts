/**
 * Deepgram STT provider — WI-1
 *
 * Concrete implementation of the STT provider abstraction using Deepgram.
 * Import this file to register the "deepgram" provider with the STT registry.
 *
 * Uses @deepgram/sdk v5 API.
 *
 * BOUNDARY RULES:
 *   - Imports from ./stt-provider (provider abstraction)
 *   - Imports from @/lib/deepgram-client (Deepgram SDK wrapper)
 *   - NEVER imports from @/lib/supabase or any CRM module
 *   - NEVER imports from ./note-manager (note writes are the caller's job)
 */

import { registerSTTProvider } from "./stt-provider";
import type { TranscriptChunk, TranscriptResult, STTSessionHandle } from "./stt-provider";
import {
  getDeepgramClient,
  createLiveSession,
  isDeepgramConfigured,
  PRERECORDED_OPTIONS,
} from "@/lib/deepgram-client";
import type { DeepgramTranscriptEvent } from "@/lib/deepgram-client";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function channelToSpeaker(channelIndex: number): "operator" | "seller" {
  // Channel 0 = operator (outbound leg), Channel 1 = seller (inbound leg)
  return channelIndex === 0 ? "operator" : "seller";
}

function deepgramEventToChunk(event: DeepgramTranscriptEvent): TranscriptChunk {
  return {
    text: event.transcript,
    speaker: channelToSpeaker(event.channel_index),
    confidence: event.confidence,
    start_ms: Math.round(event.start * 1000),
    end_ms: Math.round((event.start + event.duration) * 1000),
    is_final: event.is_final,
  };
}

// ─────────────────────────────────────────────────────────────
// Provider registration
// ─────────────────────────────────────────────────────────────

/**
 * Guard: only register the provider if Deepgram is configured.
 * This prevents boot-time errors when the API key is not set.
 */
if (isDeepgramConfigured()) {
  registerSTTProvider("deepgram", {
    name: "deepgram",

    /**
     * Single-shot transcription of an audio buffer.
     * Uses Deepgram's pre-recorded transcription endpoint (SDK v5).
     */
    async transcribe(audioChunk: Buffer, _sessionId: string): Promise<TranscriptResult> {
      const client = getDeepgramClient();
      const startTime = Date.now();

      // SDK v5: client.listen.v1.media.transcribeFile(uploadable, options)
      // HttpResponsePromise<T> extends Promise<T> — await returns the response directly
      const result = await client.listen.v1.media.transcribeFile(
        audioChunk,
        PRERECORDED_OPTIONS,
      );

      const latency = Date.now() - startTime;

      const chunks: TranscriptChunk[] = [];

      // Process each channel's results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channelResults = (result as any)?.results?.channels ?? [];
      for (let chIdx = 0; chIdx < channelResults.length; chIdx++) {
        const channel = channelResults[chIdx];
        const alternatives = channel?.alternatives ?? [];
        if (alternatives.length === 0) continue;

        const best = alternatives[0];
        if (!best.transcript || best.transcript.trim() === "") continue;

        // Extract word-level timing for start/end
        const words = best.words ?? [];
        const startMs = words.length > 0 ? Math.round(words[0].start * 1000) : 0;
        const endMs = words.length > 0
          ? Math.round(words[words.length - 1].end * 1000)
          : 0;

        chunks.push({
          text: best.transcript,
          speaker: channelToSpeaker(chIdx),
          confidence: best.confidence ?? 0,
          start_ms: startMs,
          end_ms: endMs,
          is_final: true,
        });
      }

      return {
        chunks,
        trace: {
          model: "nova-3",
          provider: "deepgram",
          latency_ms: latency,
          generated_at: new Date().toISOString(),
        },
      };
    },

    /**
     * Creates a live streaming transcription session (SDK v5).
     * Returns a handle that emits transcript chunks via the onChunk callback.
     */
    async streamSession(
      sessionId: string,
      onChunk: (chunk: TranscriptChunk) => void,
    ): Promise<STTSessionHandle> {
      const socket = await createLiveSession(
        {
          onTranscript: (event: DeepgramTranscriptEvent) => {
            const chunk = deepgramEventToChunk(event);
            // Only emit chunks that have actual text
            if (chunk.text.trim()) {
              onChunk(chunk);
            }
          },
          onError: (err: Error) => {
            console.error(`[Deepgram/stream] Session ${sessionId} error:`, err.message);
          },
          onClose: () => {
            console.log(`[Deepgram/stream] Session ${sessionId} closed`);
          },
          onOpen: () => {
            console.log(`[Deepgram/stream] Session ${sessionId} opened`);
          },
        },
        { sessionId },
      );

      return {
        sessionId,
        stop: async () => {
          try {
            socket.close();
          } catch (err) {
            console.warn(`[Deepgram/stream] Error closing session ${sessionId}:`, err);
          }
        },
      };
    },
  });

  console.log("[Deepgram] STT provider registered");
} else {
  console.log("[Deepgram] DEEPGRAM_API_KEY not set — provider not registered");
}
