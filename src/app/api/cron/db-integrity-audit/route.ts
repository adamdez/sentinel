import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notifyIntegrityAudit } from "@/lib/notify";
import { withCronTracking } from "@/lib/cron-run-tracker";
import { loadHiddenLeadBucketAudit } from "@/lib/hidden-lead-buckets";

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
 * Detects issues and performs safe auto-repairs (stale runs, expired reviews,
 * stuck voice sessions, orphaned auto-cycle phones). Logs findings and dispatches alert.
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

    // ── 8. Provider configuration health ─────────────────────────────
    const missingProviders: string[] = [];
    if (!process.env.PROPERTYRADAR_API_KEY) missingProviders.push("PROPERTYRADAR_API_KEY");
    if (!process.env.ATTOM_API_KEY) missingProviders.push("ATTOM_API_KEY");
    if (!process.env.OPENAI_API_KEY) missingProviders.push("OPENAI_API_KEY (dialer AI features offline)");
    if (!process.env.N8N_WEBHOOK_BASE_URL) missingProviders.push("N8N_WEBHOOK_BASE_URL (n8n delivery offline)");

    if (missingProviders.length > 0) {
      findings.push({
        category: "missing_provider_config",
        severity: "critical",
        count: missingProviders.length,
        description: `Missing env vars: ${missingProviders.join(", ")}`,
      });
    }

    // ── 9. lead_phones ↔ owner_phone sync check ─────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: phoneDriftCount } = await (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES)
      .not("property_id", "is", null);
    // Note: full drift detection would cross-join lead_phones vs properties.owner_phone
    // For now, just check that active leads with phones have lead_phones rows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: leadsWithoutPhoneRows } = await (sb as any).rpc("count_leads_missing_phone_rows");
    if ((leadsWithoutPhoneRows ?? 0) > 5) {
      findings.push({
        category: "phone_roster_drift",
        severity: "medium",
        count: leadsWithoutPhoneRows ?? 0,
        description: `${leadsWithoutPhoneRows} active leads with owner_phone but no lead_phones rows`,
      });
    }
    run.increment();

    // ── 10. Stale voice sessions (stuck in ringing/ai_handling >2 hours) ──
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staleSessions, count: staleSessionCount } = await (sb.from("voice_sessions") as any)
      .select("id", { count: "exact", head: false })
      .not("status", "in", '("completed","failed")')
      .lt("created_at", twoHoursAgo);

    if ((staleSessionCount ?? 0) > 0) {
      findings.push({
        category: "stale_voice_session",
        severity: "medium",
        count: staleSessionCount ?? 0,
        description: `${staleSessionCount} voice sessions stuck in non-terminal state for >2 hours`,
        sample_ids: (staleSessions ?? []).slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
    run.increment();

    // ── 11. Orphaned auto-cycle phones (active but NULL next_due_at) ──
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orphanedPhones, count: orphanedPhoneCount } = await (sb.from("dialer_auto_cycle_phones") as any)
      .select("id", { count: "exact", head: false })
      .eq("phone_status", "active")
      .is("next_due_at", null)
      .lt("last_attempt_at", tenMinAgo);

    if ((orphanedPhoneCount ?? 0) > 0) {
      findings.push({
        category: "orphaned_auto_cycle_phone",
        severity: "high",
        count: orphanedPhoneCount ?? 0,
        description: `${orphanedPhoneCount} auto-cycle phones are active but have no next_due_at (orphaned claim)`,
        sample_ids: (orphanedPhones ?? []).slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
    run.increment();

    // ── Assemble report ─────────────────────────────────────────────
    const hiddenBuckets = await loadHiddenLeadBucketAudit(sb);

    if (hiddenBuckets.totalHiddenLeads > 0) {
      findings.push({
        category: "hidden_bucket_inventory",
        severity: "medium",
        count: hiddenBuckets.totalHiddenLeads,
        description: `${hiddenBuckets.totalHiddenLeads} hidden leads remain in staging/prospect buckets`,
        detail: {
          byStatus: hiddenBuckets.byStatus,
          bySource: hiddenBuckets.bySource,
          bySourceStatus: hiddenBuckets.bySourceStatus,
        },
      });
    }

    if (hiddenBuckets.blockedSourceRows > 0) {
      findings.push({
        category: "blocked_hidden_inflow",
        severity: "high",
        count: hiddenBuckets.blockedSourceRows,
        description: `${hiddenBuckets.blockedSourceRows} hidden leads still exist from blocked ingest sources`,
        sample_ids: hiddenBuckets.blockedSourceLeadIds.slice(0, 5),
        detail: {
          blockedSources: Object.keys(hiddenBuckets.bySource)
            .filter((source) => hiddenBuckets.bySource[source] > 0),
        },
      });
    }

    if (hiddenBuckets.missingNextActionRows > 0) {
      findings.push({
        category: "hidden_bucket_next_action_violation",
        severity: "high",
        count: hiddenBuckets.missingNextActionRows,
        description: `${hiddenBuckets.missingNextActionRows} hidden staging/prospect leads are missing next_action`,
      });
    }

    if (hiddenBuckets.stateCountyDrift.length > 0) {
      const hiddenBucketDriftCount = hiddenBuckets.stateCountyDrift.reduce((sum, entry) => sum + entry.count, 0);
      findings.push({
        category: "hidden_bucket_state_county_drift",
        severity: "high",
        count: hiddenBucketDriftCount,
        description: `${hiddenBucketDriftCount} hidden leads have state/county drift`,
        detail: hiddenBuckets.stateCountyDrift,
      });
    }
    run.increment();

    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const highCount = findings.filter(f => f.severity === "high").length;
    const mediumCount = findings.filter(f => f.severity === "medium").length;
    const totalIssues = findings.reduce((sum, f) => sum + f.count, 0);

    const summary = findings.length === 0
      ? "Database integrity check passed. No issues found."
      : `Found ${totalIssues} issues across ${findings.length} categories: ${criticalCount} critical, ${highCount} high, ${mediumCount} medium.`;

    // Auto-repair: mark stale voice sessions as failed
    if ((staleSessionCount ?? 0) > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("voice_sessions") as any)
        .update({
          status: "failed",
          ended_at: now.toISOString(),
        })
        .not("status", "in", '("completed","failed")')
        .lt("created_at", twoHoursAgo);
    }

    // Auto-repair: restore orphaned auto-cycle phones into the cron queue
    if ((orphanedPhoneCount ?? 0) > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("dialer_auto_cycle_phones") as any)
        .update({
          next_due_at: now.toISOString(),
        })
        .eq("phone_status", "active")
        .is("next_due_at", null)
        .lt("last_attempt_at", tenMinAgo);
    }

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
      hiddenBuckets,
      autoRepairs: {
        staleRunsFixed: staleRunCount ?? 0,
        expiredReviewsFixed: expiredReviewCount ?? 0,
        staleVoiceSessionsFixed: staleSessionCount ?? 0,
        orphanedPhonesRestored: orphanedPhoneCount ?? 0,
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
