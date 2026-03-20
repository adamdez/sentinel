/**
 * Control Plane Service Layer
 *
 * Shared utilities for agent run tracking, review queue submission,
 * and feature flag checking. Used by all agents and the cron routes.
 *
 * Blueprint Section 4.1: "Nothing durable writes without traceability."
 * Blueprint Section 4.4: "Agents write proposals to review queues or draft tables."
 */

import { createServerClient } from "@/lib/supabase";
import { refreshAccessToken, sendEmail } from "@/lib/gmail";
import { isDnc } from "@/lib/dnc-check";
import { startTrace, endTrace, flushLangfuse } from "@/lib/langfuse";

// ─── Types ──────────────────────────────────────────────────────────

export interface CreateRunInput {
  agentName: string;
  triggerType: "cron" | "manual" | "event" | "webhook" | "operator_request";
  triggerRef?: string;
  leadId?: string;
  inputs?: Record<string, unknown>;
  promptVersion?: string;
  model?: string;
}

export interface CompleteRunInput {
  runId: string;
  status: "completed" | "failed" | "cancelled";
  outputs?: Record<string, unknown>;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
}

export interface SubmitProposalInput {
  runId: string;
  agentName: string;
  entityType: string;
  entityId?: string;
  action: string;
  proposal: Record<string, unknown>;
  rationale?: string;
  priority?: number;
  expiresAt?: string;
}

export interface AgentRun {
  id: string;
  agent_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
}

export interface FeatureFlag {
  flag_key: string;
  enabled: boolean;
  mode: string;
  metadata: Record<string, unknown>;
}

// ─── Run Lifecycle ──────────────────────────────────────────────────

/**
 * Create a new agent run. Returns the run ID for tracing.
 * Call this at the start of every agent invocation.
 *
 * Includes dedup guard: if the same agent is already running for the same lead
 * (started within the last 5 minutes), returns null instead of creating a duplicate.
 * Callers should check for null and bail early.
 */
export async function createAgentRun(input: CreateRunInput): Promise<string | null> {
  const sb = createServerClient();

  // Dedup guard: prevent concurrent runs of the same agent on the same lead
  if (input.leadId) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (sb.from("agent_runs") as any)
      .select("id")
      .eq("agent_name", input.agentName)
      .eq("lead_id", input.leadId)
      .eq("status", "running")
      .gte("started_at", fiveMinAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(
        `[control-plane] Dedup: ${input.agentName} already running for lead ${input.leadId} (run ${existing[0].id}), skipping`,
      );
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("agent_runs") as any)
    .insert({
      agent_name: input.agentName,
      trigger_type: input.triggerType,
      trigger_ref: input.triggerRef ?? null,
      lead_id: input.leadId ?? null,
      inputs: input.inputs ?? {},
      prompt_version: input.promptVersion ?? null,
      model: input.model ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create agent run: ${error.message}`);

  // Start Langfuse trace (no-op if not configured)
  startTrace({
    runId: data.id,
    agentName: input.agentName,
    triggerType: input.triggerType,
    leadId: input.leadId,
    metadata: { triggerRef: input.triggerRef, promptVersion: input.promptVersion, model: input.model },
  });

  return data.id;
}

/**
 * Complete an agent run. Call this when the agent finishes (success or failure).
 */
export async function completeAgentRun(input: CompleteRunInput): Promise<void> {
  const sb = createServerClient();
  const durationMs =
    Date.now() - Date.parse((await getRunStartedAt(input.runId)) ?? new Date().toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("agent_runs") as any)
    .update({
      status: input.status,
      outputs: input.outputs ?? {},
      error: input.error ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      cost_cents: input.costCents ?? null,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.runId);

  if (error) {
    console.error(`[control-plane] Failed to complete run ${input.runId}:`, error.message);
  }

  // End Langfuse trace + flush (no-op if not configured)
  endTrace(input.runId, input.status as "completed" | "failed" | "cancelled", {
    outputs: input.outputs ?? {},
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costCents: input.costCents,
    error: input.error,
  });
  flushLangfuse().catch(() => {});
}

async function getRunStartedAt(runId: string): Promise<string | null> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("agent_runs") as any)
    .select("started_at")
    .eq("id", runId)
    .single();
  return data?.started_at ?? null;
}

// ─── Review Queue ───────────────────────────────────────────────────

/**
 * Submit a proposal to the review queue. Agents call this when they
 * want to propose a CRM write that requires operator approval.
 */
export async function submitProposal(input: SubmitProposalInput): Promise<string> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("review_queue") as any)
    .insert({
      run_id: input.runId,
      agent_name: input.agentName,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      proposal: input.proposal,
      rationale: input.rationale ?? null,
      priority: input.priority ?? 5,
      expires_at: input.expiresAt ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to submit proposal: ${error.message}`);
  return data.id;
}

// ─── Review Queue Actions ───────────────────────────────────────────

/**
 * Approve or reject a review queue item. When approved, dispatches
 * the proposed action (e.g., sync dossier to lead, accept facts).
 *
 * Blueprint: "Agents write proposals to review queues or draft tables."
 * This is the operator side — executing approved proposals.
 */
export async function resolveReviewItem(
  itemId: string,
  decision: "approved" | "rejected",
  reviewedBy: string,
  reviewNotes?: string,
): Promise<ResolveResult> {
  const sb = createServerClient();

  // Fetch the item
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: item, error: fetchErr } = await (sb.from("review_queue") as any)
    .select("*")
    .eq("id", itemId)
    .single();

  if (fetchErr || !item) {
    throw new Error(`Review item ${itemId} not found`);
  }

  if (item.status !== "pending") {
    throw new Error(`Review item ${itemId} already resolved (${item.status})`);
  }

  // Mark the item as resolved
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb.from("review_queue") as any)
    .update({
      status: decision,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (updateErr) throw new Error(`Failed to resolve review item: ${updateErr.message}`);

  // If rejected, nothing more to do
  if (decision === "rejected") {
    return { executed: false, action: item.action, reason: "rejected" };
  }

  // Dispatch the approved action
  return executeApprovedAction(item);
}

export interface ResolveResult {
  executed: boolean;
  action: string;
  reason?: string;
  detail?: Record<string, unknown>;
}

/**
 * Execute the action proposed by an approved review queue item.
 * Each action type maps to a specific operation in the write path.
 */
async function executeApprovedAction(item: {
  action: string;
  entity_type: string;
  entity_id: string | null;
  proposal: Record<string, unknown>;
}): Promise<ResolveResult> {
  switch (item.action) {
    case "sync_dossier_to_lead": {
      // Import dynamically to avoid circular dependency
      const { syncDossierToLead } = await import("@/lib/intelligence");
      const dossierId = item.entity_id ?? (item.proposal.dossierId as string);
      if (!dossierId) {
        return { executed: false, action: item.action, reason: "no_dossier_id" };
      }
      const projection = await syncDossierToLead(dossierId);
      return {
        executed: true,
        action: item.action,
        detail: projection ? { projection } : undefined,
      };
    }

    case "accept_facts": {
      // Bulk-accept a set of fact IDs proposed by an agent
      const { reviewFact } = await import("@/lib/intelligence");
      const factIds = (item.proposal.factIds as string[]) ?? [];
      const reviewedBy = item.proposal.reviewedBy as string ?? "system";
      for (const factId of factIds) {
        await reviewFact(factId, "accepted", reviewedBy);
      }
      return {
        executed: true,
        action: item.action,
        detail: { acceptedCount: factIds.length },
      };
    }

    case "reject_facts": {
      const { reviewFact } = await import("@/lib/intelligence");
      const factIds = (item.proposal.factIds as string[]) ?? [];
      const reviewedBy = item.proposal.reviewedBy as string ?? "system";
      for (const factId of factIds) {
        await reviewFact(factId, "rejected", reviewedBy);
      }
      return {
        executed: true,
        action: item.action,
        detail: { rejectedCount: factIds.length },
      };
    }

    case "review_dossier": {
      const { reviewDossier } = await import("@/lib/intelligence");
      const dossierId = item.entity_id ?? (item.proposal.dossierId as string);
      const status = (item.proposal.decision as "reviewed" | "rejected") ?? "reviewed";
      const reviewedBy = item.proposal.reviewedBy as string ?? "system";
      if (!dossierId) {
        return { executed: false, action: item.action, reason: "no_dossier_id" };
      }
      await reviewDossier(dossierId, status, reviewedBy);
      return { executed: true, action: item.action };
    }

    // ── Follow-Up Agent draft execution ─────────────────────────────
    case "follow_up_sms": {
      const phone = item.proposal.phone as string ?? null;
      const body = item.proposal.body as string ?? "";
      if (!phone || !body) {
        return { executed: false, action: item.action, reason: "missing_phone_or_body" };
      }
      // DNC check before sending
      const dncResult = await isDnc(phone);
      if (dncResult.isDnc) {
        return { executed: false, action: item.action, reason: `dnc_blocked: ${dncResult.reason}` };
      }
      // Send SMS via Twilio (direct, not via notify.ts broadcast)
      await sendFollowUpSMS(phone, body);
      // Log as dialer event
      await logFollowUpEvent(item.entity_id, "sms", body);
      return { executed: true, action: item.action, detail: { phone, bodyLength: body.length } };
    }

    case "follow_up_email": {
      const email = item.proposal.email as string ?? null;
      const subject = item.proposal.subject as string ?? "";
      const body = item.proposal.body as string ?? "";
      if (!email || !body) {
        return { executed: false, action: item.action, reason: "missing_email_or_body" };
      }
      // Create Gmail draft (requires operator to actually send from Gmail UI)
      await createFollowUpEmailDraft(email, subject, body, item.entity_id);
      await logFollowUpEvent(item.entity_id, "email", body);
      return { executed: true, action: item.action, detail: { email, subject } };
    }

    // ── Dispo Agent buyer outreach execution ───────────────────────
    case "buyer_outreach_sms": {
      const buyerPhone = item.proposal.buyerPhone as string ?? null;
      const body = item.proposal.body as string ?? "";
      if (!buyerPhone || !body) {
        return { executed: false, action: item.action, reason: "missing_buyer_phone_or_body" };
      }
      const buyerDnc = await isDnc(buyerPhone);
      if (buyerDnc.isDnc) {
        return { executed: false, action: item.action, reason: `dnc_blocked: ${buyerDnc.reason}` };
      }
      await sendFollowUpSMS(buyerPhone, body);
      await logBuyerOutreachEvent(item.entity_id, item.proposal.buyerId as string, "sms");
      return { executed: true, action: item.action, detail: { buyerPhone } };
    }

    case "buyer_outreach_email": {
      const buyerEmail = item.proposal.buyerEmail as string ?? null;
      const subject = item.proposal.subject as string ?? "";
      const body = item.proposal.body as string ?? "";
      if (!buyerEmail || !body) {
        return { executed: false, action: item.action, reason: "missing_buyer_email_or_body" };
      }
      // Try Gmail API first, fall back to task
      let sentViaGmail = false;
      try {
        const sb2 = createServerClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profiles } = await (sb2.from("user_profiles") as any)
          .select("id, email, preferences")
          .not("preferences->gmail->encrypted_refresh_token", "is", null)
          .limit(1);
        const profile = profiles?.[0];
        const gmail = profile?.preferences?.gmail as { connected?: boolean; encrypted_refresh_token?: string; email?: string } | undefined;
        if (gmail?.connected && gmail.encrypted_refresh_token) {
          const accessToken = await refreshAccessToken(gmail.encrypted_refresh_token);
          const fromEmail = gmail.email ?? profile.email ?? "noreply@dominionhomedeals.com";
          await sendEmail(accessToken, { from: fromEmail, to: buyerEmail, subject: subject || "Property Opportunity", htmlBody: body.replace(/\n/g, "<br>") });
          sentViaGmail = true;
        }
      } catch (err) {
        console.warn("[control-plane] Buyer email Gmail send failed, falling back to task:", err instanceof Error ? err.message : err);
      }
      if (!sentViaGmail) {
        const sb2 = createServerClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb2.from("tasks") as any).insert({
          title: `Buyer outreach email to ${item.proposal.buyerName ?? buyerEmail}: ${subject}`,
          description: body,
          lead_id: null,
          status: "pending",
          priority: 2,
          due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          metadata: { type: "buyer_outreach_email", dealId: item.entity_id, buyerId: item.proposal.buyerId, to: buyerEmail, subject },
        });
      }
      await logBuyerOutreachEvent(item.entity_id, item.proposal.buyerId as string, "email");
      return { executed: true, action: item.action, detail: { buyerEmail, subject, sentViaGmail } };
    }

    case "buyer_outreach_phone": {
      // Phone outreach creates a callback task for Logan
      const sb3 = createServerClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb3.from("tasks") as any).insert({
        title: `Call buyer: ${item.proposal.buyerName ?? "Unknown"} re: ${item.entity_id?.slice(0, 8)}`,
        description: item.proposal.body as string ?? "",
        lead_id: null,
        status: "pending",
        priority: 2,
        due_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
        metadata: { type: "buyer_outreach_phone", dealId: item.entity_id, buyerId: item.proposal.buyerId, buyerPhone: item.proposal.buyerPhone },
      });
      await logBuyerOutreachEvent(item.entity_id, item.proposal.buyerId as string, "phone");
      return { executed: true, action: item.action, detail: { taskCreated: true } };
    }

    case "follow_up_call": {
      // Call follow-ups just create a task — Logan makes the actual call
      const leadId = item.entity_id;
      const callScript = item.proposal.callScript as string ?? item.proposal.body as string ?? "";
      if (leadId) {
        await createFollowUpCallTask(leadId, callScript);
      }
      return { executed: true, action: item.action, detail: { taskCreated: true } };
    }

    default:
      return {
        executed: false,
        action: item.action,
        reason: `unknown_action: ${item.action}`,
      };
  }
}

// ── Follow-Up execution helpers ──────────────────────────────────────

async function sendFollowUpSMS(phone: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio not configured for follow-up SMS");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const truncated = body.length > 1500 ? body.slice(0, 1497) + "..." : body;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone, From: fromNumber, Body: truncated }).toString(),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Twilio follow-up SMS failed: ${res.status} ${errBody.slice(0, 200)}`);
  }
}

async function createFollowUpEmailDraft(
  to: string,
  subject: string,
  body: string,
  leadId: string | null,
): Promise<void> {
  const sb = createServerClient();

  // Try to send via Gmail API directly (any connected team member)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles } = await (sb.from("user_profiles") as any)
      .select("id, email, preferences")
      .not("preferences->gmail->encrypted_refresh_token", "is", null)
      .limit(1);

    const profile = profiles?.[0];
    const gmail = profile?.preferences?.gmail as {
      connected?: boolean;
      encrypted_refresh_token?: string;
      email?: string;
    } | undefined;

    if (gmail?.connected && gmail.encrypted_refresh_token) {
      const accessToken = await refreshAccessToken(gmail.encrypted_refresh_token);
      const fromEmail = gmail.email ?? profile.email ?? "noreply@dominionhomedeals.com";
      const htmlBody = body.replace(/\n/g, "<br>");

      await sendEmail(accessToken, {
        from: fromEmail,
        to,
        subject: subject || "Following Up",
        htmlBody,
      });

      // Log the successful Gmail send
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        action: "follow_up.email_sent_gmail",
        entity_type: "lead",
        entity_id: leadId,
        details: { to, subject, sentVia: "gmail_api", fromEmail },
      }).catch(() => {});

      return; // Sent successfully — no task needed
    }
  } catch (err) {
    console.warn("[control-plane] Gmail send failed, falling back to task:", err instanceof Error ? err.message : err);
  }

  // Fallback: create task for operator to send manually
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("tasks") as any).insert({
    title: `Follow-up email to ${to}: ${subject}`,
    description: body,
    lead_id: leadId,
    status: "pending",
    priority: 2,
    due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    metadata: { type: "follow_up_email", to, subject, body },
  });
}

async function createFollowUpCallTask(
  leadId: string,
  callScript: string,
): Promise<void> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("tasks") as any).insert({
    title: "Follow-up call (AI-drafted script ready)",
    description: callScript,
    lead_id: leadId,
    status: "pending",
    priority: 2,
    due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h from now
    metadata: { type: "follow_up_call", hasScript: true },
  });
}

async function logBuyerOutreachEvent(
  dealId: string | null,
  buyerId: string | null,
  channel: string,
): Promise<void> {
  if (!dealId) return;
  const sb = createServerClient();

  // Update deal_buyers status if the buyer was matched to this deal
  if (buyerId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("deal_buyers") as any)
      .upsert({
        deal_id: dealId,
        buyer_id: buyerId,
        status: "contacted",
        outreach_channel: channel,
        contacted_at: new Date().toISOString(),
      }, { onConflict: "deal_id,buyer_id" })
      .catch(() => {}); // Non-fatal — deal_buyers may not have this constraint
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    action: `dispo.buyer_outreach_${channel}`,
    entity_type: "deal",
    entity_id: dealId,
    details: { buyerId, channel },
  }).catch(() => {});
}

async function logFollowUpEvent(
  leadId: string | null,
  channel: string,
  body: string,
): Promise<void> {
  if (!leadId) return;
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    action: `follow_up.${channel}_sent`,
    entity_type: "lead",
    entity_id: leadId,
    details: { channel, bodyPreview: body.slice(0, 200) },
  }).catch(() => {}); // Non-fatal
}

// ─── Feature Flags ──────────────────────────────────────────────────

/**
 * Check whether an agent is enabled and what mode it should run in.
 * Returns null if the flag doesn't exist (treat as disabled).
 */
export async function getFeatureFlag(flagKey: string): Promise<FeatureFlag | null> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("feature_flags") as any)
    .select("flag_key, enabled, mode, metadata")
    .eq("flag_key", flagKey)
    .maybeSingle();

  if (error) {
    console.error(`[control-plane] Failed to read flag ${flagKey}:`, error.message);
    return null;
  }

  return data;
}

/**
 * Check if an agent is enabled. Returns false if flag doesn't exist.
 */
export async function isAgentEnabled(agentName: string): Promise<boolean> {
  const flag = await getFeatureFlag(`agent.${agentName}.enabled`);
  return flag?.enabled ?? false;
}

/**
 * Get the run mode for an agent. Returns 'off' if not found.
 */
export async function getAgentMode(agentName: string): Promise<string> {
  const flag = await getFeatureFlag(`agent.${agentName}.enabled`);
  return flag?.mode ?? "off";
}
