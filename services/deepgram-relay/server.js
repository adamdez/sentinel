/**
 * Sentinel Deepgram Relay Server
 *
 * Bridges Twilio <Stream> WebSocket audio to Deepgram live transcription,
 * then POSTs final transcript chunks back to Sentinel's webhook endpoint.
 *
 * Speaker diarization: Uses TWO Deepgram connections (one per Twilio track)
 * so operator and seller audio are transcribed independently.
 *
 * Flow:
 *   Twilio <Stream> --WS--> This relay --WS--> Deepgram Nova-3 (x2)
 *                                                   |
 *   Sentinel /api/webhooks/deepgram <--HTTP POST----'
 *
 * Env vars:
 *   DEEPGRAM_API_KEY
 *   SENTINEL_WEBHOOK_URL
 *   DEEPGRAM_WEBHOOK_SECRET
 *   PORT (default 8080)
 */

require("dotenv").config();
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = parseInt(process.env.PORT || "8080", 10);
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const SENTINEL_WEBHOOK_URL = process.env.SENTINEL_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.DEEPGRAM_WEBHOOK_SECRET;

if (!DEEPGRAM_API_KEY) {
  console.error("[FATAL] DEEPGRAM_API_KEY is required");
  process.exit(1);
}
if (!SENTINEL_WEBHOOK_URL) {
  console.error("[FATAL] SENTINEL_WEBHOOK_URL is required");
  process.exit(1);
}
if (!WEBHOOK_SECRET) {
  console.error("[FATAL] DEEPGRAM_WEBHOOK_SECRET is required");
  process.exit(1);
}

const REAL_ESTATE_KEYTERMS = [
  "ARV", "MAO", "comps", "comparable sales", "assessed value", "tax assessed",
  "fair market value", "probate", "foreclosure", "pre-foreclosure", "lien",
  "tax lien", "quitclaim", "quitclaim deed", "warranty deed", "deed",
  "title company", "title search", "cloud on title", "wholesaling", "wholesale",
  "assignment", "assignment fee", "double close", "earnest money", "EMD",
  "escrow", "closing costs", "proof of funds", "cash offer", "as-is", "rehab",
  "distressed", "code violations", "deferred maintenance", "foundation issues",
  "mold", "fire damage", "motivated seller", "absentee owner", "vacant property",
  "inherited property", "divorce", "relocation", "behind on payments",
  "tax delinquent", "Spokane", "Kootenai", "Coeur d'Alene", "Dominion", "Sentinel",
];

const server = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({ server });
const activeSessions = new Map();

wss.on("connection", (twilioWs, req) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  let sessionId = url.searchParams.get("sessionId") || `unknown-${Date.now()}`;
  let callLogId = url.searchParams.get("callLogId") || "";
  let userId = url.searchParams.get("userId") || "";

  // Two Deepgram connections: one for operator (outbound), one for seller (inbound)
  let operatorDg = null;
  let sellerDg = null;
  let streamSid = null;
  let sequenceNum = 0;
  let audioReceived = false;
  let connectionOpenedSent = false;
  let startSeen = false;

  console.log(`[Relay] Twilio stream connected - session=${sessionId}`);

  function notifyConnectionOpen() {
    if (connectionOpenedSent) return;
    connectionOpenedSent = true;
    postToSentinel({
      event: "connection.open",
      session_id: sessionId,
      user_id: userId,
      call_log_id: callLogId,
    }).catch(() => {});
  }

  function createDeepgramConnection(speaker) {
    const channelIndex = speaker === "operator" ? 0 : 1;

    const dgWs = new WebSocket(buildDeepgramUrl(), {
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
    });

    dgWs.on("open", () => {
      console.log(`[Relay] Deepgram connected (${speaker}) - session=${sessionId}`);
    });

    dgWs.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== "Results") return;

        const alternatives = msg.channel?.alternatives || [];
        if (alternatives.length === 0) return;

        const best = alternatives[0];
        if (!best.transcript || best.transcript.trim() === "") return;

        if (!(msg.is_final ?? false)) return;

        sequenceNum += 1;
        postToSentinel({
          event: "transcript",
          session_id: sessionId,
          user_id: userId,
          call_log_id: callLogId,
          sequence_num: sequenceNum,
          transcript: {
            text: best.transcript.trim(),
            channel_index: channelIndex,
            confidence: best.confidence ?? 0,
            is_final: true,
            speech_final: msg.speech_final ?? false,
            start: msg.start ?? 0,
            duration: msg.duration ?? 0,
          },
        })
          .then(() => {
            console.log(
              `[Relay] Transcript delivered - session=${sessionId} seq=${sequenceNum} speaker=${speaker}`
            );
          })
          .catch((err) => {
            console.error(`[Relay] Failed to POST transcript - session=${sessionId}:`, err.message);
          });
      } catch (err) {
        console.error(`[Relay] Failed to parse Deepgram message (${speaker}) - session=${sessionId}:`, err.message);
      }
    });

    dgWs.on("error", (err) => {
      console.error(`[Relay] Deepgram WS error (${speaker}) - session=${sessionId}:`, err.message);
    });

    dgWs.on("close", (code, reason) => {
      console.log(`[Relay] Deepgram WS closed (${speaker}) - session=${sessionId} code=${code} reason=${reason}`);
      if (speaker === "operator") operatorDg = null;
      else sellerDg = null;
    });

    return dgWs;
  }

  function ensureDeepgramConnections() {
    if (!operatorDg) operatorDg = createDeepgramConnection("operator");
    if (!sellerDg) sellerDg = createDeepgramConnection("seller");
  }

  function closeDeepgramConnection(dgWs) {
    if (dgWs && dgWs.readyState === WebSocket.OPEN) {
      dgWs.send(JSON.stringify({ type: "CloseStream" }));
      setTimeout(() => {
        if (dgWs && dgWs.readyState === WebSocket.OPEN) dgWs.close();
      }, 2000);
    }
  }

  function closeAllDeepgram() {
    closeDeepgramConnection(operatorDg);
    closeDeepgramConnection(sellerDg);
  }

  twilioWs.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.event) {
        case "connected":
          console.log(`[Relay] Twilio stream connected event - session=${sessionId}`);
          break;

        case "start": {
          startSeen = true;
          streamSid = msg.start?.streamSid ?? null;
          const customParameters = msg.start?.customParameters || {};

          if (typeof customParameters.sessionId === "string" && customParameters.sessionId.trim()) {
            sessionId = customParameters.sessionId.trim();
          }
          if (typeof customParameters.callLogId === "string" && customParameters.callLogId.trim()) {
            callLogId = customParameters.callLogId.trim();
          }
          if (typeof customParameters.userId === "string" && customParameters.userId.trim()) {
            userId = customParameters.userId.trim();
          }

          console.log(`[Relay] Twilio stream started - session=${sessionId} streamSid=${streamSid}`);
          console.log(
            `[Relay] Stream metadata - session=${sessionId} callLog=${callLogId || "none"} user=${userId || "none"}`
          );

          notifyConnectionOpen();
          ensureDeepgramConnections();
          activeSessions.set(sessionId, { twilioWs, operatorDg, sellerDg, startedAt: Date.now() });
          break;
        }

        case "media": {
          if (!audioReceived) {
            audioReceived = true;
            console.log(`[Relay] First audio packet - session=${sessionId} track=${msg.media?.track || "unknown"}`);
          }

          const track = msg.media?.track;
          const audioBuffer = Buffer.from(msg.media.payload, "base64");

          // Route audio to the correct Deepgram connection based on Twilio track
          if (track === "outbound" || track === "outbound_track") {
            // Outbound = what our side says = operator
            if (operatorDg && operatorDg.readyState === WebSocket.OPEN) {
              operatorDg.send(audioBuffer);
            }
          } else if (track === "inbound" || track === "inbound_track") {
            // Inbound = what the remote party says = seller
            if (sellerDg && sellerDg.readyState === WebSocket.OPEN) {
              sellerDg.send(audioBuffer);
            }
          } else {
            // Fallback: no track label (shouldn't happen with both_tracks)
            // Send to operator connection as default
            if (operatorDg && operatorDg.readyState === WebSocket.OPEN) {
              operatorDg.send(audioBuffer);
            }
          }
          break;
        }

        case "stop":
          console.log(`[Relay] Twilio stream stopped - session=${sessionId}`);
          closeAllDeepgram();
          break;

        default:
          break;
      }
    } catch (err) {
      console.error(`[Relay] Failed to parse Twilio message - session=${sessionId}:`, err.message);
    }
  });

  twilioWs.on("close", () => {
    console.log(`[Relay] Twilio WS closed - session=${sessionId}`);
    closeAllDeepgram();
    postToSentinel({
      event: "connection.close",
      session_id: sessionId,
      user_id: userId,
      call_log_id: callLogId,
    }).catch(() => {});
    activeSessions.delete(sessionId);
  });

  twilioWs.on("error", (err) => {
    console.error(`[Relay] Twilio WS error - session=${sessionId}:`, err.message);
  });
});

function buildDeepgramUrl() {
  const params = new URLSearchParams({
    model: "nova-3",
    language: "en-US",
    encoding: "mulaw",
    sample_rate: "8000",
    channels: "1",
    smart_format: "true",
    interim_results: "true",
    utterance_end_ms: "1000",
    vad_events: "true",
    endpointing: "300",
    punctuate: "true",
  });

  for (const term of REAL_ESTATE_KEYTERMS) {
    params.append("keyterm", term);
  }

  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

async function postToSentinel(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(SENTINEL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[Relay] Sentinel webhook returned ${res.status} - session=${payload.session_id}: ${body.substring(0, 200)}`
      );
      throw new Error(`Sentinel webhook ${res.status}`);
    }

    return res;
  } finally {
    clearTimeout(timeout);
  }
}

function shutdown(signal) {
  console.log(`[Relay] ${signal} received - shutting down ${activeSessions.size} active sessions`);

  for (const [id, session] of activeSessions) {
    try {
      if (session.operatorDg?.readyState === WebSocket.OPEN) {
        session.operatorDg.send(JSON.stringify({ type: "CloseStream" }));
        session.operatorDg.close();
      }
      if (session.sellerDg?.readyState === WebSocket.OPEN) {
        session.sellerDg.send(JSON.stringify({ type: "CloseStream" }));
        session.sellerDg.close();
      }
      if (session.twilioWs?.readyState === WebSocket.OPEN) {
        session.twilioWs.close();
      }
    } catch (err) {
      console.error(`[Relay] Error closing session ${id}:`, err.message);
    }
  }

  server.close(() => {
    console.log("[Relay] Server closed");
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Relay] Deepgram relay listening on 0.0.0.0:${PORT}`);
  console.log(`[Relay] Webhook target: ${SENTINEL_WEBHOOK_URL}`);
  console.log("[Relay] Deepgram model: nova-3, encoding: mulaw, 8kHz, dual-connection speaker diarization");
});
