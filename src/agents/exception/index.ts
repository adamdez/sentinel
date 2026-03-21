/**
 * Exception Agent — Runner
 *
 * Blueprint Section 3.3: "Nightly scan + real-time SLA monitors.
 * Produces morning priority brief, exception alerts. Informational — no write."
 *
 * Phase 1 implementation: deterministic SQL queries against the live database.
 * No LLM call needed — exception detection is rule-based.
 * The LLM is used later (Phase 7) for natural-language summary generation.
 *
 * This module is imported by:
 *   - /api/cron/exception-scan (nightly cron)
 *   - /api/cron/morning-brief (morning brief generator)
 *   - Claude Code scheduled tasks
 */

import { createServerClient } from "@/lib/supabase";
import {
  createAgentRun,
  completeAgentRun,
  isAgentEnabled,
} from "@/lib/control-plane";
import { EXCEPTION_AGENT_VERSION } from "./prompt";
import type {
  ExceptionReport,
  ExceptionItem,
  ExceptionAgentInput,
} from "./types";

const ACTIVE_STATUSES = ["prospect", "lead", "negotiation", "disposition"];

export async function runExceptionScan(
  input: ExceptionAgentInput
): Promise<ExceptionReport> {
  // Check feature flag
  const enabled = await isAgentEnabled("exception");
  if (!enabled) {
    return emptyReport("Agent disabled via feature flag");
  }

  // Create traced run
  const runId = await createAgentRun({
    agentName: "exception",
    triggerType: input.triggerType,
    triggerRef: input.triggerRef,
    model: "deterministic",
    promptVersion: EXCEPTION_AGENT_VERSION,
    inputs: { trigger: input.triggerType },
  });

  if (!runId) {
    return emptyReport("Exception Agent already running — skipped duplicate.");
  }

  try {
    const sb = createServerClient();
    const now = new Date();

    // ── 1. Missing next_action ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: missingAction } = await (sb.from("leads") as any)
      .select("id, status, next_action, next_action_due_at, last_contact_at, total_calls, live_answers, properties(address, city, state, owner_name)")
      .in("status", ACTIVE_STATUSES)
      .is("next_action", null)
      .limit(50);

    // ── 2. Overdue next_action_due_at ───────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overdue } = await (sb.from("leads") as any)
      .select("id, status, next_action, next_action_due_at, last_contact_at, total_calls, live_answers, motivation_level, properties(address, city, state, owner_name)")
      .in("status", ACTIVE_STATUSES)
      .not("next_action_due_at", "is", null)
      .lt("next_action_due_at", now.toISOString())
      .limit(50);

    // ── 3. Speed-to-lead violations ─────────────────────────────
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: speedViolations } = await (sb.from("leads") as any)
      .select("id, status, next_action, created_at, total_calls, live_answers, properties(address, city, state, owner_name)")
      .in("status", ACTIVE_STATUSES)
      .lt("created_at", oneDayAgo)
      .eq("total_calls", 0)
      .limit(50);

    // ── 4. Stale contact (>7 days no contact) ───────────────────
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staleContact } = await (sb.from("leads") as any)
      .select("id, status, next_action, next_action_due_at, last_contact_at, total_calls, live_answers, properties(address, city, state, owner_name)")
      .in("status", ACTIVE_STATUSES)
      .not("last_contact_at", "is", null)
      .lt("last_contact_at", sevenDaysAgo)
      .limit(50);

    // ── Assemble report ─────────────────────────────────────────
    const critical: ExceptionItem[] = [];
    const high: ExceptionItem[] = [];
    const medium: ExceptionItem[] = [];

    // Missing next_action on active leads = critical
    for (const lead of missingAction ?? []) {
      critical.push(toItem(lead, "missing_next_action", "critical",
        `No next_action set. Lead is in '${lead.status}' with no committed next step.`));
    }

    // Speed-to-lead = critical
    for (const lead of speedViolations ?? []) {
      const hoursOld = Math.round((now.getTime() - Date.parse(lead.created_at)) / 3600000);
      critical.push(toItem(lead, "speed_to_lead_violation", "critical",
        `Created ${hoursOld}h ago with zero contact attempts.`));
    }

    // Overdue follow-up: hot leads = high, others = medium
    for (const lead of overdue ?? []) {
      const hoursOverdue = Math.round((now.getTime() - Date.parse(lead.next_action_due_at)) / 3600000);
      const isHot = (lead.motivation_level ?? 0) >= 4 ||
        ["negotiation", "disposition"].includes(lead.status);
      const severity = isHot ? "high" as const : "medium" as const;
      const bucket = isHot ? high : medium;
      bucket.push(toItem(lead, "overdue_follow_up", severity,
        `Next action "${lead.next_action}" overdue by ${hoursOverdue}h.`));
    }

    // Stale contact = medium
    for (const lead of staleContact ?? []) {
      const daysSince = Math.round((now.getTime() - Date.parse(lead.last_contact_at)) / 86400000);
      medium.push(toItem(lead, "stale_contact", "medium",
        `No contact in ${daysSince} days. Last contact: ${lead.last_contact_at?.slice(0, 10)}.`));
    }

    const totals = {
      critical: critical.length,
      high: high.length,
      medium: medium.length,
      total: critical.length + high.length + medium.length,
    };

    const summary = totals.total === 0
      ? "No exceptions found. Pipeline is clean."
      : `${totals.critical} critical, ${totals.high} high, ${totals.medium} medium exceptions. ` +
        `${critical.length > 0 ? `Top issue: ${critical[0].description}` : `Top issue: ${(high[0] ?? medium[0])?.description ?? "none"}`}`;

    const report: ExceptionReport = {
      runId,
      generatedAt: now.toISOString(),
      critical,
      high,
      medium,
      summary,
      totals,
    };

    await completeAgentRun({
      runId,
      status: "completed",
      outputs: { totals, summary },
    });

    return report;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await completeAgentRun({
      runId,
      status: "failed",
      error: msg,
    });
    return emptyReport(`Exception scan failed: ${msg}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function toItem(
  lead: Record<string, unknown>,
  category: ExceptionItem["category"],
  severity: ExceptionItem["severity"],
  description: string,
): ExceptionItem {
  const prop = lead.properties as Record<string, unknown> | null;
  const address = prop
    ? [prop.address, prop.city, prop.state].filter(Boolean).join(", ")
    : null;

  return {
    leadId: lead.id as string,
    ownerName: (prop?.owner_name as string) ?? null,
    address,
    status: lead.status as string,
    category,
    severity,
    description,
    currentNextAction: (lead.next_action as string) ?? null,
    nextActionDueAt: (lead.next_action_due_at as string) ?? null,
    daysSinceLastContact: lead.last_contact_at
      ? Math.round((Date.now() - Date.parse(lead.last_contact_at as string)) / 86400000)
      : null,
    totalCalls: (lead.total_calls as number) ?? 0,
    liveAnswers: (lead.live_answers as number) ?? 0,
  };
}

function emptyReport(summary: string): ExceptionReport {
  return {
    runId: "none",
    generatedAt: new Date().toISOString(),
    critical: [],
    high: [],
    medium: [],
    summary,
    totals: { critical: 0, high: 0, medium: 0, total: 0 },
  };
}
