/**
 * n8n Outbound Webhook Dispatcher
 *
 * Fires events from Sentinel to n8n workflows. n8n receives these
 * and handles delivery: email sequences, Slack routing, SMS campaigns,
 * external CRM sync, etc.
 *
 * BOUNDARY RULES:
 * - Fire-and-forget: failures are logged but never block Sentinel workflows
 * - No business logic here — n8n decides what to do with events
 * - Events are typed and versioned for workflow compatibility
 *
 * SETUP:
 *   N8N_WEBHOOK_BASE_URL — Base URL for n8n webhooks (e.g., https://n8n.dominionhomedeals.com/webhook)
 *   N8N_WEBHOOK_SECRET   — Shared secret for authenticating Sentinel → n8n calls
 */

import { trackedDelivery } from "@/lib/delivery-tracker";

const TIMEOUT_MS = 8_000;

interface N8NDispatchResult {
  ok: boolean;
  event: string;
  error?: string;
}

/**
 * Fire an event to n8n. Never throws — all errors are caught and logged.
 */
async function fireN8NWebhook(
  event: string,
  data: Record<string, unknown>,
): Promise<N8NDispatchResult> {
  const baseUrl = process.env.N8N_WEBHOOK_BASE_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;

  if (!baseUrl) {
    // n8n not configured — silently skip
    return { ok: false, event, error: "N8N_WEBHOOK_BASE_URL not configured" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${baseUrl}/${event}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
      },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[n8n-dispatch] ${event} returned ${res.status}`);
      return { ok: false, event, error: `HTTP ${res.status}` };
    }

    return { ok: true, event };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("abort")) {
      console.warn(`[n8n-dispatch] ${event} failed:`, msg);
    }
    return { ok: false, event, error: msg };
  }
}

// ── Typed Event Dispatchers ─────────────────────────────────────────────────

/**
 * Tracked dispatch helper — fires webhook inside trackedDelivery for
 * delivery_runs audit trail, then returns the N8NDispatchResult for callers.
 */
async function tracked(
  eventType: string,
  data: Record<string, unknown>,
  entityType?: string,
  entityId?: string,
): Promise<N8NDispatchResult> {
  let result: N8NDispatchResult = { ok: false, event: eventType, error: "not executed" };
  await trackedDelivery(
    { channel: "n8n", eventType, payload: data, entityType, entityId },
    async () => {
      result = await fireN8NWebhook(eventType, data);
      if (!result.ok) throw new Error(result.error ?? "dispatch failed");
    },
  );
  return result;
}

/**
 * Lead changed stage (e.g., prospect → qualified → negotiation → disposition)
 */
export function n8nLeadStageChanged(data: {
  leadId: string;
  previousStage: string;
  newStage: string;
  nextAction: string | null;
  ownerName: string | null;
  address: string | null;
  operatorId: string;
}): Promise<N8NDispatchResult> {
  return tracked("lead.stage_changed", data, "lead", data.leadId);
}

/**
 * New deal created (typically when lead enters negotiation/disposition)
 */
export function n8nDealCreated(data: {
  dealId: string;
  leadId: string;
  offerAmount: number | null;
  address: string | null;
  ownerName: string | null;
  dealType: string | null;
}): Promise<N8NDispatchResult> {
  return tracked("deal.created", data, "deal", data.dealId);
}

/**
 * Call session published (operator finished a call and committed the record)
 */
export function n8nCallCompleted(data: {
  callLogId: string;
  leadId: string;
  disposition: string;
  summaryLine: string | null;
  dealTemperature: string | null;
  nextAction: string | null;
  operatorId: string;
  durationSeconds: number | null;
}): Promise<N8NDispatchResult> {
  return tracked("call.completed", data, "call", data.callLogId);
}

/**
 * Review queue item approved by operator
 */
export function n8nReviewApproved(data: {
  reviewItemId: string;
  agentName: string;
  leadId: string | null;
  proposalType: string;
  approvedBy: string;
}): Promise<N8NDispatchResult> {
  return tracked("review.approved", data, "lead", data.leadId ?? undefined);
}

/**
 * Campaign touch executed (SMS sent, call task created)
 */
export function n8nCampaignTouchCompleted(data: {
  campaignId: string;
  leadId: string;
  touchNumber: number;
  channel: string;
  status: string;
}): Promise<N8NDispatchResult> {
  return tracked("campaign.touch_completed", data, "lead", data.leadId);
}

/**
 * New inbound lead received (webform, email, vendor, Vapi call)
 */
export function n8nInboundLeadReceived(data: {
  leadId: string;
  source: string;
  channel: string;
  ownerName: string | null;
  phone: string | null;
  address: string | null;
}): Promise<N8NDispatchResult> {
  return tracked("inbound.lead_received", data, "lead", data.leadId);
}

/**
 * Lead enriched via skip-trace (operator-initiated)
 */
export function n8nLeadEnriched(data: {
  leadId: string;
  propertyId: string;
  source: string;
  provider: string[];
  phonesFound: number;
  emailsFound: number;
}): Promise<N8NDispatchResult> {
  return tracked("lead.enriched", data, "lead", data.leadId);
}

/**
 * Stale dispo deals detected (deals in disposition >48h with no buyer outreach)
 */
export function n8nStaleDispo(data: {
  count: number;
  deals: Array<{
    dealId: string;
    leadId: string;
  }>;
  detectedAt: string;
  triggered: number;
}): Promise<N8NDispatchResult> {
  return tracked("deal.stale_dispo", data, "deal");
}

/**
 * Agent completed a run (for monitoring/alerting in n8n)
 */
export function n8nAgentRunCompleted(data: {
  runId: string;
  agentName: string;
  status: "completed" | "failed";
  leadId: string | null;
  durationMs: number;
  costCents: number;
  error?: string;
}): Promise<N8NDispatchResult> {
  return tracked("agent.run_completed", data, "lead", data.leadId ?? undefined);
}
