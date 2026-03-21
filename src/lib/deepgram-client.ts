/**
 * Deepgram SDK wrapper — WI-1
 *
 * Provides a configured Deepgram client for real-time transcription
 * during dialer calls. Pre-built with real estate vocabulary boosting.
 *
 * Uses @deepgram/sdk v5 API.
 *
 * BOUNDARY RULES:
 *   - This file does NOT import from any dialer module or CRM module
 *   - It is a pure provider wrapper — dialer code calls this; this never calls dialer code
 *   - All Deepgram-specific configuration lives here
 *
 * Env: DEEPGRAM_API_KEY (required)
 */

import { DeepgramClient } from "@deepgram/sdk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DeepgramLiveSocket = any;

// ─────────────────────────────────────────────────────────────
// Real estate vocabulary boosting
// ─────────────────────────────────────────────────────────────

/**
 * Domain-specific keywords for Deepgram's vocabulary boosting.
 * These improve accuracy for real estate wholesaling conversations.
 */
export const REAL_ESTATE_KEYWORDS = [
  // Valuation / Comps
  "ARV",
  "MAO",
  "comps",
  "comparable sales",
  "assessed value",
  "tax assessed",
  "fair market value",
  // Legal / Title
  "probate",
  "foreclosure",
  "pre-foreclosure",
  "lien",
  "tax lien",
  "quitclaim",
  "quitclaim deed",
  "warranty deed",
  "deed",
  "title company",
  "title search",
  "cloud on title",
  // Transaction
  "wholesaling",
  "wholesale",
  "assignment",
  "assignment fee",
  "double close",
  "earnest money",
  "EMD",
  "escrow",
  "closing costs",
  "proof of funds",
  "cash offer",
  "as-is",
  // Property condition
  "rehab",
  "distressed",
  "code violations",
  "deferred maintenance",
  "foundation issues",
  "mold",
  "fire damage",
  // Seller situation
  "motivated seller",
  "absentee owner",
  "vacant property",
  "inherited property",
  "divorce",
  "relocation",
  "behind on payments",
  "tax delinquent",
  // Spokane / regional
  "Spokane",
  "Kootenai",
  "Coeur d'Alene",
  // Company
  "Dominion",
  "Sentinel",
];

// ─────────────────────────────────────────────────────────────
// Client singleton
// ─────────────────────────────────────────────────────────────

let _client: DeepgramClient | null = null;

/**
 * Returns a singleton Deepgram client (SDK v5).
 * Throws if DEEPGRAM_API_KEY is not set.
 */
export function getDeepgramClient(): DeepgramClient {
  if (_client) return _client;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[Deepgram] DEEPGRAM_API_KEY is not set. Transcription is unavailable.",
    );
  }

  _client = new DeepgramClient({ apiKey });
  return _client;
}

/**
 * Returns true if Deepgram is configured (API key is present).
 */
export function isDeepgramConfigured(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}

// ─────────────────────────────────────────────────────────────
// Live transcription connect args (SDK v5 shape)
// Optimized for Twilio media streams (mulaw, 8kHz, stereo).
// ─────────────────────────────────────────────────────────────

/**
 * Builds the connect args for a live transcription session.
 * Requires the API key for the Authorization header (SDK v5 passes it this way).
 *
 * NOTE: SDK v5 ConnectArgs uses string-typed booleans ("true"/"false")
 * for most parameters, and string-typed numbers for numeric params.
 */
export function buildLiveConnectArgs(apiKey: string) {
  return {
    Authorization: `Token ${apiKey}`,
    model: "nova-3" as const,
    language: "en-US",
    encoding: "mulaw" as const,
    sample_rate: "8000",
    channels: "2",
    multichannel: "true",
    smart_format: "true",
    interim_results: "true",
    utterance_end_ms: "1000",
    vad_events: "true",
    endpointing: "300",
    punctuate: "true",
    keywords: REAL_ESTATE_KEYWORDS.map((kw) => `${kw}:2`).join(","),
  };
}

// ─────────────────────────────────────────────────────────────
// Live transcription session
// ─────────────────────────────────────────────────────────────

export interface DeepgramSessionCallbacks {
  onTranscript: (data: DeepgramTranscriptEvent) => void;
  onError: (error: Error) => void;
  onClose: () => void;
  onOpen: () => void;
}

export interface DeepgramTranscriptEvent {
  /** The transcribed text */
  transcript: string;
  /** Which audio channel (0 = operator, 1 = seller) */
  channel_index: number;
  /** Deepgram's confidence score 0.0-1.0 */
  confidence: number;
  /** Whether this is a final (non-interim) result */
  is_final: boolean;
  /** Whether this is at the end of an utterance (speech_final) */
  speech_final: boolean;
  /** Start time in seconds */
  start: number;
  /** Duration in seconds */
  duration: number;
}

/**
 * Creates a live transcription WebSocket session with Deepgram (SDK v5).
 *
 * Returns a V1Socket that can receive audio chunks via sendMedia()
 * and emits transcript events via callbacks.
 */
export async function createLiveSession(
  callbacks: DeepgramSessionCallbacks,
  sessionMetadata?: { sessionId?: string; callLogId?: string },
): Promise<DeepgramLiveSocket> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("[Deepgram] DEEPGRAM_API_KEY is not set.");
  }

  const client = getDeepgramClient();
  const connectArgs = buildLiveConnectArgs(apiKey);

  const socket = await client.listen.v1.connect(connectArgs);

  socket.on("open", () => {
    console.log(
      "[Deepgram] Live session opened",
      sessionMetadata?.sessionId ? `session=${sessionMetadata.sessionId}` : "",
    );
    callbacks.onOpen();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket.on("message", (data: any) => {
    // SDK v5 message handler receives union of Results | Metadata | UtteranceEnd | SpeechStarted
    if (!data || data.type !== "Results") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = data as any;
    const alternatives = results.channel?.alternatives ?? [];
    const channelIndex = Array.isArray(results.channel_index) ? results.channel_index[0] ?? 0 : 0;

    if (alternatives.length === 0) return;

    const best = alternatives[0];
    if (!best.transcript || best.transcript.trim() === "") return;

    const event: DeepgramTranscriptEvent = {
      transcript: best.transcript,
      channel_index: channelIndex,
      confidence: best.confidence ?? 0,
      is_final: results.is_final ?? false,
      speech_final: results.speech_final ?? false,
      start: results.start ?? 0,
      duration: results.duration ?? 0,
    };

    callbacks.onTranscript(event);
  });

  socket.on("error", (err: Error) => {
    console.error(
      "[Deepgram] Live session error:",
      err,
      sessionMetadata?.sessionId ? `session=${sessionMetadata.sessionId}` : "",
    );
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  });

  socket.on("close", () => {
    console.log(
      "[Deepgram] Live session closed",
      sessionMetadata?.sessionId ? `session=${sessionMetadata.sessionId}` : "",
    );
    callbacks.onClose();
  });

  // Initiate the WebSocket connection
  socket.connect();

  return socket;
}

/**
 * Pre-recorded transcription options (SDK v5).
 * Used by the STT provider for single-shot transcription of audio buffers.
 */
export const PRERECORDED_OPTIONS = {
  model: "nova-3" as const,
  language: "en-US",
  smart_format: true,
  punctuate: true,
  multichannel: true,
  channels: 2,
  keywords: REAL_ESTATE_KEYWORDS.map((kw) => `${kw}:2`).join(","),
} as const;

/**
 * Builds the Twilio <Stream> WebSocket URL for Deepgram transcription.
 *
 * Twilio's <Stream> sends audio to a WebSocket server. This URL points
 * to our media-stream relay endpoint that bridges Twilio audio to Deepgram.
 *
 * The relay server is expected to be deployed separately (e.g. on Fly.io
 * or as a standalone Node process) since Next.js does not support
 * WebSocket endpoints natively.
 *
 * @param siteUrl - Base URL of the transcription WebSocket relay server
 * @param sessionId - Dialer session ID for correlating transcripts
 * @param callLogId - calls_log ID for reference
 */
export function buildTwilioStreamUrl(
  siteUrl: string,
  sessionId: string,
  callLogId?: string,
): string {
  const params = new URLSearchParams({ sessionId });
  if (callLogId) params.set("callLogId", callLogId);
  // Use the dedicated transcription relay URL if configured,
  // otherwise fall back to the site URL
  const base = process.env.TRANSCRIPTION_WS_URL || `wss://${siteUrl.replace(/^https?:\/\//, "")}/api/transcription/stream`;
  return `${base}?${params.toString()}`;
}
