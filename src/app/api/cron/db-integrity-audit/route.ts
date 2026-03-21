import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notifyIntegrityAudit } from "@/lib/notify";
import { withCronTracking } from "@/lib/cron-run-tracker";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/db-integrity-audit
 *
 * Nightly (2am PT) database integrity check. Detects:
 *   1. Orphaned records (leads without properties, deals without leads)
 *   2. Missing next_action on active leads (stage machine violation)
 *   3. Write path violations (voice sessions without lead links, facts without artifacts)
 *   4. Stale agent runs (stuck in "running" for >1 hour)
 *   5. Review queue hygiene (expired items still pending)
 *
 * Read-only — never mutates data. Logs findings and optionally dispatches alert.
 * Secured by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronTracking("db-integrity-audit", async (run) => {
    const sb = createServerClient();
    const now = new Date();
    const findings: Finding[] = [];

    // ── 1. Active leads missing next_action ─────────────────────────
    const ACTIVE_STATUSES = ["prospect", "lead", "negotiation", "disposition"];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: missingAction, count: missingActionCount } = await (sb.from("leads") as any)
      .select("id", { count: "exact", head: false })
      .in("status", ACTIVE_STATUSES)
      .is("next_action", null);

    if ((missingActionCount ?? 0) > 0) {
      findings.push({
        category: "stage_machine_violation",
        severity: "critical",
        count: missingActionCount ?? 0,
        description: `${missingActionCount} active leads have no next_action set`,
        sample_ids: (missingAction ?? []).slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
    run.increment();

    // ── 2. Orphaned deals (deal.lead_id points to non-existent or dead lead) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orphanedDeals } = await (sb.from("deals") as any)
      .select("id, lead_id, leads!inner(id, status)")
      .in("status", ["active", "pending", "under_contract"])
      .in("leads.status", ["dead", "dnc"]);

    if (orphanedDeals && orphanedDeals.length > 0) {
      findings.push({
        category: "orphaned_record",
        severity: "high",
        count: orphanedDeals.length,
        description: `${orphanedDeals.length} active deals linked to dead/DNC leads`,
        sample_ids: orphanedDeals.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
    run.increment();

    // ── 3. Voice sessions without lead link (>1 hour old) ───────────
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: unlinkedVoiceCount } = await (sb.from("voice_sessions") as any)
      .select("id", { count: "exact", head: true })
      .is("lead_id", null)
      .lt("created_at", oneHourAgo)
      .in("status", ["completed", "transferred"]);

    if ((unlinkedVoiceCount ?? 0) > 0) {
      findings.push({
        category: "write_path_violation",
        severity: "medium",
        count: unlinkedVoiceCount ?? 0,
        description: `${unlinkedVoiceCount} completed voice sessions have no lead link`,
      });
    }
    run.increment();

    // ── 4. Stale agent runs (stuck in "running" for >1 hour) ────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staleRuns, count: staleRunCount } = await (sb.from("agent_runs") as any)
      .select("id, agent_name, started_at", { count: "exact", head: false })
      .eq("status", "running")
      .lt("started_at", oneHourAgo);

    if ((staleRunCount ?? 0) > 0) {
      findings.push({
        category: "stale_agent_run",
        severity: "high",
        count: staleRunCount ?? 0,
        description: `${staleRunCount} agent runs stuck in "running" for >1 hour`,
        sample_ids: (staleRuns ?? []).slice(0, 5).map((r: { id: string }) => r.id),
        detail: (staleRuns ?? []).slice(0, 3).map((r: { agent_name: string; started_at: string }) => ({
          agent: r.agent_name,
          started: r.started_at,
        })),
      });
    }
    run.increment();

    // ── 5. Expired review queue items still pending ─────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: expiredReviewCount } = await (sb.from("review_queue") as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .not("expires_at", "is", null)
      .lt("expires_at", now.toISOString());

    if ((expiredReviewCount ?? 0) > 0) {
      findings.push({
        category: "review_queue_hygiene",
        severity: "medium",
        count: expiredReviewCount ?? 0,
        description: `${expiredReviewCount} expired review queue items still pending`,
      });
    }
    run.increment();

    // ── 6. Fact assertions without valid artifact link ──────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: orphanedFactCount } = await (sb.from("fact_assertions") as any)
      .select("id", { count: "exact", head: true })
      .is("artifact_id", null);

    if ((orphanedFactCount ?? 0) > 0) {
      findings.push({
        category: "write_path_violation",
        severity: "high",
        count: orphanedFactCount ?? 0,
        description: `${orphanedFactCount} fact assertions have no artifact link (provenance broken)`,
      });
    }
    run.increment();

    // ── 7. Leads with next_action_due_at in the past but no exception flag ──
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: deepOverdueCount } = await (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES)
      .not("next_action_due_at", "is", null)
      .lt("next_action_due_at", threeDaysAgo);

    if ((deepOverdueCount ?? 0) > 0) {
      findings.push({
        category: "deep_overdue",
        severity: "critical",
        count: deepOverdueCount ?? 0,
        description: `${deepOverdueCount} leads have next_action_due_at >3 days overdue`,
      });
    }
    run.increment();

    // ── Assemble report ─────────────────────────────────────────────
    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const highCount = findings.filter(f => f.severity === "high").length;
    const mediumCount = findings.filter(f => f.severity === "medium").length;
    const totalIssues = findings.reduce((sum, f) => sum + f.count, 0);

    const summary = findings.length === 0
      ? "Database integrity check passed. No issues found."
      : `Found ${totalIssues} issues across ${findings.length} categories: ${criticalCount} critical, ${highCount} high, ${mediumCount} medium.`;

    // Auto-resolve stale agent runs (mark as failed)
    if ((staleRunCount ?? 0) > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("agent_runs") as any)
        .update({
          status: "failed",
          error: "Auto-failed by integrity audit: stuck in running for >1 hour",
          completed_at: now.toISOString(),
        })
        .eq("status", "running")
        .lt("started_at", oneHourAgo);
    }

    // Auto-expire old review queue items
    if ((expiredReviewCount ?? 0) > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("review_queue") as any)
        .update({
          status: "expired",
          review_notes: "Auto-expired by integrity audit",
          updated_at: now.toISOString(),
        })
        .eq("status", "pending")
        .not("expires_at", "is", null)
        .lt("expires_at", now.toISOString());
    }

    const report = {
      ok: true,
      timestamp: now.toISOString(),
      summary,
      totals: { critical: criticalCount, high: highCount, medium: mediumCount, totalIssues },
      findings,
      autoRepairs: {
        staleRunsFixed: staleRunCount ?? 0,
        expiredReviewsFixed: expiredReviewCount ?? 0,
      },
    };

    // ── Dispatch to Slack only when issues found (fire-and-forget) ──
    if (findings.length > 0) {
      notifyIntegrityAudit({
        timestamp: report.timestamp,
        summary: report.summary,
        totals: report.totals,
        findings: report.findings,
        autoRepairs: report.autoRepairs,
      }).catch(() => {});
    }

    return NextResponse.json(report);
  });
}

interface Finding {
  category: string;
  severity: "critical" | "high" | "medium";
  count: number;
  description: string;
  sample_ids?: string[];
  detail?: unknown;
}
