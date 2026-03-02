import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERROR_ACTIONS = [
  "error",
  "failure",
  "failed",
  "exception",
  "crash",
  "timeout",
  "hydration",
];

const TRANSITION_ACTIONS = [
  "STATUS_CHANGED",
  "CLAIMED",
  "status_transition",
];

interface DiagnosticEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface SystemDiagnostics {
  timestamp: string;
  recentErrors: DiagnosticEntry[];
  failedTransitions: DiagnosticEntry[];
  apiFailures: DiagnosticEntry[];
  crawlerIssues: DiagnosticEntry[];
  envStatus: Record<string, "set" | "missing">;
  healthSummary: {
    status: "nominal" | "degraded" | "critical";
    errorCount: number;
    failedTransitionCount: number;
    apiFailureCount: number;
    crawlerIssueCount: number;
    message: string;
  };
  cursorFixes: string[];
}

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GROK_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "PROPERTYRADAR_API_KEY",
];

export async function POST(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { depth?: number } = {};
  try {
    body = await req.json();
  } catch {
    // default depth
  }

  const depth = Math.min(body.depth ?? 50, 200);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tbl = (name: string) => sb.from(name) as any;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [recentEvents, recentErrorEvents, transitionEvents, crawlerEvents] = await Promise.all([
      tbl("event_log")
        .select("id, action, entity_type, entity_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(depth),

      tbl("event_log")
        .select("id, action, entity_type, entity_id, details, created_at")
        .gte("created_at", twentyFourHoursAgo)
        .or(ERROR_ACTIONS.map((a) => `action.ilike.%${a}%`).join(","))
        .order("created_at", { ascending: false })
        .limit(30),

      tbl("event_log")
        .select("id, action, entity_type, entity_id, details, created_at")
        .gte("created_at", twentyFourHoursAgo)
        .in("action", TRANSITION_ACTIONS)
        .order("created_at", { ascending: false })
        .limit(30),

      tbl("event_log")
        .select("id, action, entity_type, entity_id, details, created_at")
        .gte("created_at", twentyFourHoursAgo)
        .or("action.ilike.%crawl%,action.ilike.%ingest%,action.ilike.%seed%,action.ilike.%poll%")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const allEvents: DiagnosticEntry[] = recentEvents.data ?? [];

    const recentErrors: DiagnosticEntry[] = (recentErrorEvents.data ?? []).filter(
      (e: DiagnosticEntry) => {
        const d = e.details as Record<string, unknown>;
        return (
          d.error ||
          d.success === false ||
          d.status === "failed" ||
          e.action.toLowerCase().includes("error") ||
          e.action.toLowerCase().includes("fail")
        );
      }
    );

    const errorsByDetailsFail = allEvents.filter((e) => {
      const d = e.details as Record<string, unknown>;
      return d.success === false || d.error || d.status === "failed";
    });

    const combinedErrors = [...recentErrors];
    for (const e of errorsByDetailsFail) {
      if (!combinedErrors.find((x) => x.id === e.id)) {
        combinedErrors.push(e);
      }
    }

    const failedTransitions: DiagnosticEntry[] = (transitionEvents.data ?? []).filter(
      (e: DiagnosticEntry) => {
        const d = e.details as Record<string, unknown>;
        return d.error || d.success === false || d.rejected;
      }
    );

    const crawlerIssues: DiagnosticEntry[] = (crawlerEvents.data ?? []).filter(
      (e: DiagnosticEntry) => {
        const d = e.details as Record<string, unknown>;
        return d.error || d.success === false || d.status === "failed" || (d.inserted === 0 && d.total === 0);
      }
    );

    const apiFailures = combinedErrors.filter(
      (e) =>
        e.entity_type === "api" ||
        e.action.includes("api") ||
        e.action.includes("webhook") ||
        e.action.includes("twilio"),
    );

    const envStatus: Record<string, "set" | "missing"> = {};
    for (const v of REQUIRED_ENV_VARS) {
      envStatus[v] = process.env[v] ? "set" : "missing";
    }

    const cursorFixes: string[] = [];

    const missingEnvs = Object.entries(envStatus)
      .filter(([, s]) => s === "missing")
      .map(([k]) => k);
    if (missingEnvs.length > 0) {
      cursorFixes.push(
        `Missing environment variables detected: ${missingEnvs.join(", ")}. ` +
        `Add these to your .env.local file or Vercel dashboard.`
      );
    }

    if (combinedErrors.length > 5) {
      cursorFixes.push(
        "High error rate detected in event_log (24h). Review the recentErrors array for patterns. " +
        "Common causes: stale Supabase types, missing RLS policies, expired API keys."
      );
    }

    if (failedTransitions.length > 0) {
      cursorFixes.push(
        "Failed status transitions detected. Check optimistic locking (lock_version) and " +
        "status guardrails in /api/prospects PATCH handler. Ensure valid transitions are enforced."
      );
    }

    if (crawlerIssues.length > 0) {
      cursorFixes.push(
        "Crawler/ingest failures detected. Verify PROPERTYRADAR_API_KEY and ATTOM_API_KEY. " +
        "Check /api/ingest/daily-poll and /api/ingest/propertyradar routes for error responses."
      );
    }

    const totalIssues = combinedErrors.length + failedTransitions.length + apiFailures.length + crawlerIssues.length;
    let status: "nominal" | "degraded" | "critical" = "nominal";
    let message = "All systems nominal. No errors detected in the last 24 hours.";

    if (totalIssues > 10) {
      status = "critical";
      message = `Critical: ${totalIssues} issues detected in the last 24 hours. Immediate attention required.`;
    } else if (totalIssues > 0) {
      status = "degraded";
      message = `Degraded: ${totalIssues} issue${totalIssues === 1 ? "" : "s"} detected in the last 24 hours.`;
    }

    const diagnostics: SystemDiagnostics = {
      timestamp: new Date().toISOString(),
      recentErrors: combinedErrors.slice(0, 20),
      failedTransitions: failedTransitions.slice(0, 10),
      apiFailures: apiFailures.slice(0, 10),
      crawlerIssues: crawlerIssues.slice(0, 10),
      envStatus,
      healthSummary: {
        status,
        errorCount: combinedErrors.length,
        failedTransitionCount: failedTransitions.length,
        apiFailureCount: apiFailures.length,
        crawlerIssueCount: crawlerIssues.length,
        message,
      },
      cursorFixes,
    };

    return Response.json(diagnostics);
  } catch (err) {
    console.error("[Grok Troubleshoot Error]", err);
    return Response.json(
      { error: "Failed to run diagnostics" },
      { status: 500 },
    );
  }
}
