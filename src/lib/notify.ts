import type { AgentHealthSummary } from "@/lib/agent-health";

/**
 * Direct Notification Dispatcher — Slack + Twilio SMS
 *
 * Replaces n8n as the delivery layer. Sentinel sends alerts directly
 * to Slack webhooks and Twilio SMS. No intermediary service needed.
 *
 * BOUNDARY RULES:
 * - Fire-and-forget: failures are logged but never block workflows
 * - No business logic here — only pre-computed messages from agents/crons
 * - No CRM writes — delivery and notification only
 *
 * SETUP:
 *   SLACK_WEBHOOK_URL    — Slack incoming webhook URL (create at api.slack.com/apps)
 *   NOTIFY_SMS_NUMBERS   — Comma-separated phone numbers for SMS alerts
 *                          (e.g., "+15091234567,+15099876543")
 *   TWILIO_ACCOUNT_SID   — Already set for dialer
 *   TWILIO_AUTH_TOKEN     — Already set for dialer
 *   TWILIO_PHONE_NUMBER   — Already set for dialer (outbound caller ID)
 */

// ── Core Senders ─────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10_000;

interface NotifyResult {
  ok: boolean;
  channel: "slack" | "sms";
  error?: string;
}

/**
 * Send a message to the configured Slack webhook.
 * Never throws — all errors are caught and logged.
 */
async function sendSlack(text: string, blocks?: unknown[]): Promise<NotifyResult> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.warn("[notify] SLACK_WEBHOOK_URL not set — skipping Slack message");
    return { ok: false, channel: "slack", error: "SLACK_WEBHOOK_URL not configured" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const body: Record<string, unknown> = { text };
    if (blocks) body.blocks = blocks;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[notify] Slack returned ${res.status}`);
      return { ok: false, channel: "slack", error: `HTTP ${res.status}` };
    }

    return { ok: true, channel: "slack" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[notify] Slack failed:", msg);
    return { ok: false, channel: "slack", error: msg };
  }
}

/**
 * Send an SMS via Twilio to all configured notification numbers.
 * Never throws — all errors are caught and logged.
 */
async function sendSMS(message: string): Promise<NotifyResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const toNumbers = process.env.NOTIFY_SMS_NUMBERS;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("[notify] Twilio credentials not set — skipping SMS");
    return { ok: false, channel: "sms", error: "Twilio not configured" };
  }

  if (!toNumbers) {
    console.warn("[notify] NOTIFY_SMS_NUMBERS not set — skipping SMS");
    return { ok: false, channel: "sms", error: "NOTIFY_SMS_NUMBERS not configured" };
  }

  const numbers = toNumbers.split(",").map((n) => n.trim()).filter(Boolean);
  if (numbers.length === 0) {
    return { ok: false, channel: "sms", error: "No SMS numbers configured" };
  }

  // Truncate to SMS-safe length (1600 chars max for Twilio)
  const truncated = message.length > 1500 ? message.slice(0, 1497) + "..." : message;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const results = await Promise.allSettled(
      numbers.map(async (to) => {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: fromNumber, Body: truncated }).toString(),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(`Twilio ${res.status}: ${errBody.slice(0, 200)}`);
        }
      }),
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error("[notify] Some SMS sends failed:", failed.length, "/", numbers.length);
    }

    return { ok: failed.length === 0, channel: "sms" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[notify] SMS failed:", msg);
    return { ok: false, channel: "sms", error: msg };
  }
}

// ── Typed Notification Functions ─────────────────────────────────────────────

/**
 * #1: Missed-call SMS alert to Logan.
 * Triggered when Vapi logs an unanswered inbound call.
 */
export function notifyMissedCall(data: {
  callerPhone: string;
  callerName: string | null;
  callSummary: string | null;
  propertyAddress: string | null;
  leadId: string | null;
  callTimestamp: string;
}): Promise<NotifyResult> {
  const caller = data.callerName ?? data.callerPhone;
  const address = data.propertyAddress ? ` re: ${data.propertyAddress}` : "";
  const summary = data.callSummary ? `\n${data.callSummary}` : "";
  const time = new Date(data.callTimestamp).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" });

  return sendSMS(`Missed call from ${caller}${address} at ${time}${summary}`);
}

/**
 * #2: Daily morning priority digest.
 * Triggered by the morning-brief cron at 7am.
 */
export function notifyMorningDigest(data: {
  date: string;
  exceptionSummary: string;
  exceptionTotals: { critical: number; high: number; medium: number; total: number };
  criticalItems: Array<{ leadId: string; ownerName: string | null; address: string | null; description: string }>;
  todayCallbackCount: number;
  topCallbacks: Array<{ title: string; dueAt: string; ownerName: string | null; address: string | null }>;
  pipelineSnapshot: Record<string, number>;
  activeOfferCount: number;
}): Promise<NotifyResult> {
  const lines: string[] = [
    `*Sentinel Morning Brief — ${data.date}*`,
    "",
  ];

  // Pipeline
  const pipelineStr = Object.entries(data.pipelineSnapshot)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");
  lines.push(`Pipeline: ${pipelineStr}`);

  // Exceptions
  if (data.exceptionTotals.total > 0) {
    lines.push(`Exceptions: ${data.exceptionTotals.critical} critical, ${data.exceptionTotals.high} high, ${data.exceptionTotals.medium} medium`);
  }

  // Critical items
  for (const item of data.criticalItems.slice(0, 5)) {
    const label = item.ownerName ?? item.address ?? item.leadId.slice(0, 8);
    lines.push(`  ⚠ ${label}: ${item.description}`);
  }

  // Callbacks
  if (data.todayCallbackCount > 0) {
    lines.push(`\nToday's callbacks: ${data.todayCallbackCount}`);
    for (const cb of data.topCallbacks.slice(0, 3)) {
      lines.push(`  • ${cb.title} (${new Date(cb.dueAt).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" })})`);
    }
  }

  if (data.activeOfferCount > 0) {
    lines.push(`\nActive offers: ${data.activeOfferCount}`);
  }

  return sendSlack(lines.join("\n"));
}

/**
 * #3: Post-call summary delivery to Adam.
 * Triggered after operator publishes a call.
 */
export function notifyPostCallSummary(data: {
  sessionId: string;
  leadId: string;
  ownerName: string | null;
  address: string | null;
  disposition: string;
  summaryLine: string | null;
  dealTemperature: string | null;
  nextTaskSuggestion: string | null;
  operatorId: string;
  completedAt: string;
}): Promise<NotifyResult> {
  const who = data.ownerName ?? data.address ?? data.leadId.slice(0, 8);
  const temp = data.dealTemperature ? ` [${data.dealTemperature}]` : "";
  const summary = data.summaryLine ? `\n${data.summaryLine}` : "";
  const next = data.nextTaskSuggestion ? `\nNext: ${data.nextTaskSuggestion}` : "";

  return sendSlack(`*Call completed:* ${who} → ${data.disposition}${temp}${summary}${next}`);
}

/**
 * #4: Stale follow-up nudge to Logan.
 * Triggered when exception scan finds overdue follow-ups.
 */
export function notifyStaleFollowUp(data: {
  overdueLeads: Array<{
    leadId: string;
    ownerName: string | null;
    address: string | null;
    nextAction: string | null;
    hoursOverdue: number;
    severity: "critical" | "high" | "medium";
  }>;
  totalOverdue: number;
}): Promise<NotifyResult> {
  if (data.overdueLeads.length === 0) {
    return Promise.resolve({ ok: true, channel: "sms" });
  }

  const lines = [`${data.totalOverdue} overdue follow-ups:`];
  for (const lead of data.overdueLeads.slice(0, 5)) {
    const who = lead.ownerName ?? lead.address ?? lead.leadId.slice(0, 8);
    const hours = Math.round(lead.hoursOverdue);
    lines.push(`• ${who} — ${hours}h overdue${lead.nextAction ? ` (${lead.nextAction})` : ""}`);
  }
  if (data.totalOverdue > 5) {
    lines.push(`+ ${data.totalOverdue - 5} more`);
  }

  return sendSMS(lines.join("\n"));
}

/**
 * #5: Google Ads anomaly alert.
 * Triggered when Ads Monitor Agent detects threshold breaches.
 */
export function notifyAdsAnomaly(data: {
  runId: string;
  summary: string;
  alertCount: number;
  criticalAlerts: Array<{
    category: string;
    campaignName: string | null;
    message: string;
  }>;
  blendedCPL: number;
  totalSpend: number;
}): Promise<NotifyResult> {
  const lines = [
    `*Ads Alert:* ${data.summary}`,
    `CPL: $${data.blendedCPL.toFixed(2)} | Spend: $${data.totalSpend.toFixed(2)} | ${data.alertCount} alerts`,
  ];

  for (const alert of data.criticalAlerts.slice(0, 3)) {
    const campaign = alert.campaignName ? ` (${alert.campaignName})` : "";
    lines.push(`  ⚠ ${alert.category}${campaign}: ${alert.message}`);
  }

  return sendSlack(lines.join("\n"));
}

/**
 * #6: Speed-to-lead inbound alert.
 * Triggered instantly when a new inbound lead is created from webform/email/vendor.
 */
export function notifyNewInboundLead(data: {
  channel: string;
  ownerName: string | null;
  phone: string | null;
  propertyAddress: string | null;
  source: string;
  leadId: string;
  receivedAt: string;
}): Promise<NotifyResult> {
  const who = data.ownerName ?? "Unknown";
  const addr = data.propertyAddress ? ` — ${data.propertyAddress}` : "";
  const ph = data.phone ? ` (${data.phone})` : "";
  const time = new Date(data.receivedAt).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" });

  return sendSMS(`NEW LEAD: ${who}${ph}${addr}\nSource: ${data.source} via ${data.channel}\nReceived: ${time}\nCall back ASAP!`);
}

/**
 * #6b: Intake lead alert — any new lead entering the intake queue.
 * Triggered instantly when a lead arrives via webhook/email/API.
 * Sends SMS to both Logan and Adam for speed-to-lead.
 */
export function notifyIntakeLeadArrived(data: {
  ownerName: string | null;
  phone: string | null;
  propertyAddress: string | null;
  sourceProvider: string;
  intakeLeadId: string;
  receivedAt: string;
}): Promise<NotifyResult> {
  const who = data.ownerName ?? "Unknown";
  const addr = data.propertyAddress ? ` — ${data.propertyAddress}` : "";
  const ph = data.phone ? ` (${data.phone})` : "";
  const time = new Date(data.receivedAt).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" });

  return sendSMS(`🎯 NEW LEAD IN INTAKE!\n${who}${ph}${addr}\nSource: ${data.sourceProvider}\nTime: ${time}\nReview & claim in Sentinel ➡️ INTAKE`);
}

/** @deprecated Use notifyIntakeLeadArrived instead */
export const notifyPPLLeadIntake = notifyIntakeLeadArrived;

/**
 * #7: Weekly health report (Monday 9am).
 * Summarizes agent fleet, pipeline velocity, intelligence usage, voice sessions.
 */
export function notifyWeeklyHealth(data: {
  weekEnding: string;
  summary: string;
  agentHealth: Record<string, { total: number; completed: number; failed: number; totalCostCents: number }>;
  fleetSummary?: AgentHealthSummary;
  pipeline: { leadsCreated: number; callsLogged: number; stageTransitions: number; tasksCompleted: number };
  intelligence: { artifactsCreated: number; factsCreated: number; dossiersCreated: number; reviewItemsProcessed: number };
  voice: { totalCalls: number; transferred: number; sellerCalls: number; callbacksRequested: number };
  quickWins: string[];
}): Promise<NotifyResult> {
  const lines = [
    `*Sentinel Weekly Health — w/e ${data.weekEnding}*`,
    "",
    `*Pipeline:* ${data.pipeline.leadsCreated} new leads | ${data.pipeline.callsLogged} calls | ${data.pipeline.stageTransitions} stage transitions | ${data.pipeline.tasksCompleted} tasks done`,
    `*Intel:* ${data.intelligence.dossiersCreated} dossiers | ${data.intelligence.factsCreated} facts | ${data.intelligence.artifactsCreated} artifacts | ${data.intelligence.reviewItemsProcessed} reviews`,
    `*Voice:* ${data.voice.totalCalls} AI calls | ${data.voice.sellerCalls} sellers | ${data.voice.transferred} transferred | ${data.voice.callbacksRequested} callbacks`,
  ];

  // Agent summary
  const agents = Object.entries(data.agentHealth);
  if (agents.length > 0) {
    const totalRuns = agents.reduce((s, [, a]) => s + a.total, 0);
    const totalCost = agents.reduce((s, [, a]) => s + a.totalCostCents, 0);
    const failingAgents = agents.filter(([, a]) => a.total >= 3 && a.failed / a.total > 0.25);
    lines.push(`*Agents:* ${totalRuns} runs ($${(totalCost / 100).toFixed(2)})`);
    if (failingAgents.length > 0) {
      for (const [name, stats] of failingAgents) {
        lines.push(`  ⚠ ${name}: ${Math.round(stats.failed / stats.total * 100)}% failure rate`);
      }
    }
  }

  if (data.fleetSummary?.causes.length) {
    lines.push("", "*What actually broke:*");
    for (const cause of data.fleetSummary.causes.slice(0, 3)) {
      lines.push(`  - ${cause.label} (${cause.count})`);
      lines.push(`    ${cause.action}`);
    }
  }

  // Quick wins
  if (data.quickWins.length > 0) {
    lines.push("", `*Quick wins (${data.quickWins.length}):*`);
    for (const win of data.quickWins.slice(0, 5)) {
      lines.push(`  • ${win}`);
    }
  }

  return sendSlack(lines.join("\n"));
}

export function notifyAgentFleetAlert(data: {
  windowHours: number;
  successRate: number;
  totalRuns: number;
  failedRuns: number;
  causes: AgentHealthSummary["causes"];
}): Promise<NotifyResult> {
  const lines = [
    `*Agent Fleet Alert*`,
    `${data.failedRuns} failed of ${data.totalRuns} runs in the last ${data.windowHours}h (${data.successRate}% success).`,
  ];

  for (const cause of data.causes.slice(0, 3)) {
    lines.push(`- ${cause.label} (${cause.count})`);
    lines.push(`  ${cause.action}`);
  }

  lines.push("Open Sentinel -> System Health for provider checks and live failure detail.");
  return sendSlack(lines.join("\n"));
}

/**
 * #7: DB integrity audit alert (2am nightly).
 * Only fires when issues are found — silent on clean runs.
 */
export function notifyIntegrityAudit(data: {
  timestamp: string;
  summary: string;
  totals: { critical: number; high: number; medium: number; totalIssues: number };
  findings: Array<{ category: string; severity: string; count: number; description: string }>;
  autoRepairs: { staleRunsFixed: number; expiredReviewsFixed: number };
}): Promise<NotifyResult> {
  const lines = [
    `*DB Integrity Audit — ${new Date(data.timestamp).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}*`,
    data.summary,
  ];

  // Critical + high findings
  const important = data.findings.filter((f) => f.severity === "critical" || f.severity === "high");
  for (const finding of important.slice(0, 5)) {
    const icon = finding.severity === "critical" ? "🔴" : "🟠";
    lines.push(`  ${icon} ${finding.description}`);
  }

  // Auto-repairs
  const repairs = [];
  if (data.autoRepairs.staleRunsFixed > 0) repairs.push(`${data.autoRepairs.staleRunsFixed} stale runs auto-failed`);
  if (data.autoRepairs.expiredReviewsFixed > 0) repairs.push(`${data.autoRepairs.expiredReviewsFixed} expired reviews auto-closed`);
  if (repairs.length > 0) {
    lines.push(`Auto-repaired: ${repairs.join(", ")}`);
  }

  return sendSlack(lines.join("\n"));
}
