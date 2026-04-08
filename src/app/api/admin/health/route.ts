import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/admin/health
 *
 * Pings every external service Sentinel depends on and returns status.
 * Used by the health dashboard and the morning cron to alert on failures.
 *
 * Returns: { services: ServiceCheck[], summary: { ok, degraded, down } }
 */

interface ServiceCheck {
  name: string;
  status: "ok" | "degraded" | "down" | "unconfigured";
  latencyMs: number | null;
  error?: string;
  detail?: string;
}

async function checkService(
  name: string,
  fn: () => Promise<{ ok: boolean; detail?: string }>,
): Promise<ServiceCheck> {
  const t0 = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<{ ok: boolean; detail: string }>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout (10s)")), 10000),
      ),
    ]);
    return {
      name,
      status: result.ok ? "ok" : "degraded",
      latencyMs: Date.now() - t0,
      detail: result.detail,
    };
  } catch (err) {
    return {
      name,
      status: "down",
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function unconfigured(name: string, envVar: string): ServiceCheck {
  return { name, status: "unconfigured", latencyMs: null, detail: `${envVar} not set` };
}

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  // Allow cron access via CRON_SECRET or authenticated user
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const checks: Promise<ServiceCheck>[] = [];

  // ── 1. Supabase (database) ────────────────────────────────────────
  checks.push(
    checkService("Supabase", async () => {
      const { error } = await sb.from("leads").select("id", { count: "exact", head: true }).limit(1);
      return { ok: !error, detail: error ? error.message : "Connected" };
    }),
  );

  // ── 2. Twilio ─────────────────────────────────────────────────────
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    checks.push(
      checkService("Twilio", async () => {
        const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
        const auth = process.env.TWILIO_AUTH_TOKEN!.trim();
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
          { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}` } },
        );
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        const data = await res.json();
        return { ok: data.status === "active", detail: `Account: ${data.status}` };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Twilio", "TWILIO_ACCOUNT_SID")));
  }

  // ── 3. Twilio TwiML App ───────────────────────────────────────────
  if (process.env.TWILIO_TWIML_APP_SID && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    checks.push(
      checkService("Twilio TwiML App", async () => {
        const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
        const auth = process.env.TWILIO_AUTH_TOKEN!.trim();
        const appSid = process.env.TWILIO_TWIML_APP_SID!.trim();
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Applications/${appSid}.json`,
          { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}` } },
        );
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        const data = await res.json();
        const voiceUrl = data.voice_url ?? "";
        const correctDomain = voiceUrl.includes("sentinel.dominionhomedeals.com");
        return {
          ok: correctDomain,
          detail: correctDomain ? `VoiceURL: ${voiceUrl}` : `WRONG URL: ${voiceUrl} — should point to sentinel.dominionhomedeals.com`,
        };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Twilio TwiML App", "TWILIO_TWIML_APP_SID")));
  }

  // ── 4. Twilio API Key ─────────────────────────────────────────────
  if (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    checks.push(
      checkService("Twilio API Key", async () => {
        const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
        const auth = process.env.TWILIO_AUTH_TOKEN!.trim();
        const keySid = process.env.TWILIO_API_KEY_SID!.trim();
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Keys/${keySid}.json`,
          { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}` } },
        );
        if (!res.ok) return { ok: false, detail: `Key ${keySid} not found or revoked` };
        return { ok: true, detail: `Key ${keySid} active` };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Twilio API Key", "TWILIO_API_KEY_SID")));
  }

  // ── 5. Bricked AI ─────────────────────────────────────────────────
  if (process.env.BRICKED_API_KEY) {
    checks.push(
      checkService("Bricked AI", async () => {
        const res = await fetch("https://api.bricked.ai/v1/property/list?page=0", {
          headers: { "x-api-key": process.env.BRICKED_API_KEY! },
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        return { ok: true, detail: "API responding" };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Bricked AI", "BRICKED_API_KEY")));
  }

  // ── 6. PropertyRadar ──────────────────────────────────────────────
  if (process.env.PROPERTYRADAR_API_KEY) {
    checks.push(
      checkService("PropertyRadar", async () => {
        const res = await fetch("https://api.propertyradar.com/v1/properties?Purchase=0&Limit=1&Fields=RadarID", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.PROPERTYRADAR_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ Criteria: [{ name: "State", value: ["WA"] }] }),
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        return { ok: true, detail: "API responding" };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("PropertyRadar", "PROPERTYRADAR_API_KEY")));
  }

  // ── 7. Spokane County GIS ─────────────────────────────────────────
  checks.push(
    checkService("Spokane County GIS", async () => {
      const res = await fetch(
        "https://services1.arcgis.com/ozNll27nt9ZtPWOn/arcgis/rest/services/Parcels/FeatureServer/0?f=json",
      );
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: !!data.name, detail: `Layer: ${data.name}` };
    }),
  );

  // ── 8. Anthropic (Claude) ─────────────────────────────────────────
  if (process.env.ANTHROPIC_API_KEY) {
    checks.push(
      checkService("Anthropic", async () => {
        // Minimal API call — just check auth, don't burn tokens
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
        });
        if (!res.ok) {
          const err = await res.text().catch(() => "");
          if (res.status === 429) {
            return { ok: false, detail: `HTTP 429: rate limited or spend cap reached (${err.slice(0, 100)})` };
          }
          if (res.status === 401 || res.status === 403) {
            return { ok: false, detail: `HTTP ${res.status}: auth or billing issue (${err.slice(0, 100)})` };
          }
          return { ok: false, detail: `HTTP ${res.status}: ${err.slice(0, 100)}` };
        }
        return { ok: true, detail: "API responding" };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Anthropic", "ANTHROPIC_API_KEY")));
  }

  // ── 9. OpenAI ─────────────────────────────────────────────────────
  if (process.env.FIRECRAWL_API_KEY) {
    checks.push(
      checkService("Firecrawl", async () => {
        const res = await fetch("https://api.firecrawl.dev/v2/team/credit-usage", {
          headers: {
            Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY!}`,
          },
        });
        if (!res.ok) {
          const err = await res.text().catch(() => "");
          if (res.status === 402) {
            return { ok: false, detail: `HTTP 402: credits exhausted (${err.slice(0, 100)})` };
          }
          if (res.status === 401 || res.status === 403) {
            return { ok: false, detail: `HTTP ${res.status}: auth or billing issue (${err.slice(0, 100)})` };
          }
          return { ok: false, detail: `HTTP ${res.status}: ${err.slice(0, 100)}` };
        }
        const data = await res.json().catch(() => null) as {
          success?: boolean;
          data?: { remainingCredits?: number; planCredits?: number };
        } | null;
        const remainingCredits = Number(data?.data?.remainingCredits ?? 0);
        const planCredits = Number(data?.data?.planCredits ?? 0);
        if (remainingCredits <= 0) {
          return { ok: false, detail: `0 credits remaining out of ${planCredits || "unknown"} plan credits` };
        }
        if (remainingCredits < 100) {
          return { ok: false, detail: `${remainingCredits} credits remaining out of ${planCredits || "unknown"} plan credits` };
        }
        return { ok: true, detail: `${remainingCredits} credits remaining` };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Firecrawl", "FIRECRAWL_API_KEY")));
  }

  if (process.env.OPENAI_API_KEY) {
    checks.push(
      checkService("OpenAI", async () => {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        return { ok: true, detail: "API responding" };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("OpenAI", "OPENAI_API_KEY")));
  }

  // ── 10. Deepgram ──────────────────────────────────────────────────
  if (process.env.DEEPGRAM_API_KEY) {
    checks.push(
      checkService("Deepgram", async () => {
        const res = await fetch("https://api.deepgram.com/v1/projects", {
          headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        return { ok: true, detail: "API responding" };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Deepgram", "DEEPGRAM_API_KEY")));
  }

  // ── 11. Deepgram Relay (WebSocket server) ─────────────────────────
  if (process.env.TRANSCRIPTION_WS_URL) {
    checks.push(
      checkService("Deepgram Relay", async () => {
        // Convert wss:// to https:// for health check
        const wsUrl = process.env.TRANSCRIPTION_WS_URL!;
        const httpUrl = wsUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").split("?")[0];
        try {
          const res = await fetch(httpUrl, { method: "GET" });
          // Most WS servers return 400 or 426 on HTTP GET — that's fine, it means the server is alive
          return { ok: res.status < 500, detail: `HTTP ${res.status} (server alive)` };
        } catch {
          return { ok: false, detail: "Unreachable" };
        }
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Deepgram Relay", "TRANSCRIPTION_WS_URL")));
  }

  // ── 12. Gmail OAuth ───────────────────────────────────────────────
  if (process.env.GOOGLE_CLIENT_ID) {
    checks.push(
      checkService("Gmail OAuth", async () => {
        // Check if any user has a valid (non-expired) Gmail token
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (sb.from("gmail_tokens") as any)
          .select("id, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1);
        if (error) return { ok: false, detail: error.message };
        if (!data || data.length === 0) return { ok: false, detail: "No Gmail tokens — not connected" };
        const lastUpdate = new Date((data as Array<{ updated_at: string }>)[0].updated_at).getTime();
        const daysSinceRefresh = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
        if (daysSinceRefresh > 30) return { ok: false, detail: `Token last refreshed ${Math.round(daysSinceRefresh)}d ago — may be expired` };
        return { ok: true, detail: `Token refreshed ${Math.round(daysSinceRefresh)}d ago` };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Gmail OAuth", "GOOGLE_CLIENT_ID")));
  }

  // ── 13. Vapi Voice AI ─────────────────────────────────────────────
  if (process.env.VAPI_API_KEY) {
    checks.push(
      checkService("Vapi", async () => {
        const res = await fetch("https://api.vapi.ai/call", {
          headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
        });
        // 200 or 401 means the API is reachable
        if (res.status === 401) return { ok: false, detail: "API key invalid" };
        return { ok: res.ok || res.status < 500, detail: "API responding" };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Vapi", "VAPI_API_KEY")));
  }

  // ── 14. Inngest ───────────────────────────────────────────────────
  if (process.env.INNGEST_EVENT_KEY) {
    checks.push(
      checkService("Inngest", async () => {
        // Can't easily ping Inngest without sending an event — check env var presence
        return { ok: true, detail: "Event key configured" };
      }),
    );
  } else {
    checks.push(Promise.resolve(unconfigured("Inngest", "INNGEST_EVENT_KEY")));
  }

  // ── 15. Stuck Sessions (state machine health) ─────────────────────
  checks.push(
    checkService("Session State Machine", async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (sb.from("call_sessions") as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["initiating", "active"])
        .lt("created_at", oneHourAgo);
      if (error) return { ok: false, detail: error.message };
      const stuck = count ?? 0;
      if (stuck > 0) return { ok: false, detail: `${stuck} session(s) stuck in initiating/active for >1 hour` };
      return { ok: true, detail: "No stuck sessions" };
    }),
  );

  // ── 16. Orphaned Leads (no next_action) ───────────────────────────
  checks.push(
    checkService("Pipeline Health", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (sb.from("leads") as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["active", "negotiation", "disposition"])
        .is("next_action", null);
      if (error) return { ok: false, detail: error.message };
      const orphaned = count ?? 0;
      if (orphaned > 5) return { ok: false, detail: `${orphaned} active leads with no next_action` };
      if (orphaned > 0) return { ok: true, detail: `${orphaned} lead(s) missing next_action (minor)` };
      return { ok: true, detail: "All active leads have next_action" };
    }),
  );

  // ── Run all checks in parallel ────────────────────────────────────
  const results = await Promise.all(checks);

  const summary = {
    ok: results.filter((r) => r.status === "ok").length,
    degraded: results.filter((r) => r.status === "degraded").length,
    down: results.filter((r) => r.status === "down").length,
    unconfigured: results.filter((r) => r.status === "unconfigured").length,
    total: results.length,
    timestamp: new Date().toISOString(),
  };

  const httpStatus = summary.down > 0 ? 503 : summary.degraded > 0 ? 207 : 200;

  return NextResponse.json({ services: results, summary }, { status: httpStatus });
}
