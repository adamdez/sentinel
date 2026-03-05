import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ── Configuration ─────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "8080", 10);
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;

// How often to run AI summarization (ms)
const SUMMARY_INTERVAL_MS = 30_000;
// Minimum new words before triggering a summary
const MIN_NEW_WORDS = 20;

if (!DEEPGRAM_API_KEY) console.warn("[transcription] DEEPGRAM_API_KEY not set — transcription disabled");
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) console.warn("[transcription] Supabase not configured");

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// ── AI Summarizer (Grok via xAI) ─────────────────────────────────────

async function summarizeTranscript(transcript, context) {
  if (!XAI_API_KEY || !transcript || transcript.length < 30) return null;

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [
          {
            role: "system",
            content: `You are a real-time call note assistant for a real estate wholesaler. Extract ONLY the key actionable points from the conversation transcript. Output 3-7 concise bullet points. Focus on:
- Property condition or damage mentioned
- Financial details (asking price, mortgage balance, equity, repairs needed)
- Owner motivation/situation (divorce, relocation, inheritance, financial stress)
- Owner sentiment (interested, hesitant, hostile, undecided)
- Any commitments or next steps discussed
- Names, dates, or deadlines mentioned

Keep each bullet under 15 words. Use present tense. Do NOT include filler or pleasantries.${context ? `\n\nContext: ${context}` : ""}`,
          },
          {
            role: "user",
            content: `Call transcript so far:\n\n${transcript}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error("[summarize] Grok error:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    // Parse bullet points
    const bullets = content
      .split("\n")
      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
      .filter((line) => line.length > 5);

    return bullets.length > 0 ? bullets : null;
  } catch (err) {
    console.error("[summarize] Error:", err.message);
    return null;
  }
}

// ── Save live notes to Supabase ───────────────────────────────────────

async function saveLiveNotes(callLogId, bullets) {
  if (!supabase || !callLogId) return;
  try {
    await supabase
      .from("calls_log")
      .update({ live_notes: bullets })
      .eq("id", callLogId);
  } catch (err) {
    console.error("[saveLiveNotes] Error:", err.message);
  }
}

async function saveFinalSummary(callLogId, transcript, bullets) {
  if (!supabase || !callLogId) return;
  try {
    const summaryText = bullets ? bullets.map((b) => `• ${b}`).join("\n") : null;
    await supabase
      .from("calls_log")
      .update({
        ai_summary: summaryText,
        summary_timestamp: new Date().toISOString(),
        live_notes: bullets,
      })
      .eq("id", callLogId);
    console.log(`[final] Saved summary for call ${callLogId} (${bullets?.length ?? 0} bullets)`);
  } catch (err) {
    console.error("[saveFinalSummary] Error:", err.message);
  }
}

// ── Deepgram Real-Time Connection ─────────────────────────────────────

function createDeepgramConnection(onTranscript) {
  if (!DEEPGRAM_API_KEY) return null;

  const deepgram = createDeepgramClient(DEEPGRAM_API_KEY);
  const connection = deepgram.listen.live({
    model: "nova-2",
    language: "en-US",
    smart_format: true,
    punctuate: true,
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    interim_results: false,
    utterance_end_ms: 1500,
  });

  connection.on("open", () => {
    console.log("[deepgram] Connection opened");
  });

  connection.on("Results", (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (transcript && transcript.trim().length > 0) {
      onTranscript(transcript.trim());
    }
  });

  connection.on("error", (err) => {
    console.error("[deepgram] Error:", err);
  });

  connection.on("close", () => {
    console.log("[deepgram] Connection closed");
  });

  return connection;
}

// ── HTTP Server + WebSocket ───────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "sentinel-transcription" }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({ server, path: "/media-stream" });

wss.on("connection", (ws, req) => {
  console.log(`[ws] New connection from ${req.url}`);

  // Extract callLogId from URL params
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const callLogId = url.searchParams.get("callLogId");
  console.log(`[ws] callLogId: ${callLogId}`);

  // State for this call session
  let fullTranscript = "";
  let lastSummarizedLength = 0;
  let summaryTimer = null;
  let streamSid = null;

  // Set up Deepgram connection
  const onTranscript = (text) => {
    fullTranscript += (fullTranscript ? " " : "") + text;
    console.log(`[transcript] ${text}`);
  };

  const dgConnection = createDeepgramConnection(onTranscript);

  // Periodic summarization
  summaryTimer = setInterval(async () => {
    const newWords = fullTranscript.slice(lastSummarizedLength).trim().split(/\s+/).length;
    if (newWords < MIN_NEW_WORDS) return;

    console.log(`[summary] Running summary (${fullTranscript.split(/\s+/).length} words total)...`);
    const bullets = await summarizeTranscript(fullTranscript);
    if (bullets) {
      lastSummarizedLength = fullTranscript.length;
      await saveLiveNotes(callLogId, bullets);
      console.log(`[summary] Updated: ${bullets.length} bullets`);
    }
  }, SUMMARY_INTERVAL_MS);

  // Handle Twilio Media Stream messages
  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.event) {
        case "connected":
          console.log("[twilio] Media stream connected");
          break;

        case "start":
          streamSid = msg.start?.streamSid;
          console.log(`[twilio] Stream started: ${streamSid}`);
          break;

        case "media":
          // Forward audio to Deepgram
          if (dgConnection && msg.media?.payload) {
            const audio = Buffer.from(msg.media.payload, "base64");
            try {
              dgConnection.send(audio);
            } catch {
              // Deepgram connection might not be ready yet
            }
          }
          break;

        case "stop":
          console.log("[twilio] Stream stopped");
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("[ws] Parse error:", err.message);
    }
  });

  // Cleanup on disconnect
  ws.on("close", async () => {
    console.log(`[ws] Connection closed for call ${callLogId}`);

    // Stop periodic summarization
    if (summaryTimer) clearInterval(summaryTimer);

    // Close Deepgram
    if (dgConnection) {
      try { dgConnection.finish(); } catch { /* ignore */ }
    }

    // Generate and save final summary
    if (fullTranscript.length > 30) {
      console.log(`[final] Generating final summary (${fullTranscript.split(/\s+/).length} words)...`);
      const bullets = await summarizeTranscript(fullTranscript);
      await saveFinalSummary(callLogId, fullTranscript, bullets);
    }
  });

  ws.on("error", (err) => {
    console.error("[ws] WebSocket error:", err.message);
  });
});

server.listen(PORT, () => {
  console.log(`[sentinel-transcription] Listening on port ${PORT}`);
  console.log(`[config] Deepgram: ${DEEPGRAM_API_KEY ? "configured" : "MISSING"}`);
  console.log(`[config] Supabase: ${supabase ? "configured" : "MISSING"}`);
  console.log(`[config] Grok (xAI): ${XAI_API_KEY ? "configured" : "MISSING"}`);
});
