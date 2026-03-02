/**
 * Grok Action Registry — Defines executable actions that Grok can propose
 * and the system can execute after user confirmation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { completeGrokChat } from "./grok-client";
import { buildOutreachAgentPrompt, type LeadContext } from "./agent/grok-agents";

export interface ActionParam {
  name: string;
  type: "string" | "number";
  description: string;
  required?: boolean;
}

export interface GrokAction {
  name: string;
  description: string;
  parameters: ActionParam[];
  requiresConfirmation: boolean;
  execute: (params: Record<string, unknown>, supabase: SupabaseClient, apiKey: string) => Promise<ActionResult>;
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export const GROK_ACTIONS: Record<string, GrokAction> = {
  run_elite_seed: {
    name: "run_elite_seed",
    description: "Trigger PropertyRadar bulk seed ingestion with a specified count",
    parameters: [
      { name: "count", type: "number", description: "Number of leads to seed (100-2000)", required: true },
    ],
    requiresConfirmation: true,
    execute: async (params) => {
      const count = Number(params.count) || 500;
      const origin = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const res = await fetch(`${origin}/api/ingest/propertyradar/bulk-seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, message: `Seed failed (${res.status}): ${text.slice(0, 200)}` };
      }
      const data = await res.json();
      return { success: true, message: `Elite seed triggered: ${data.inserted ?? count} leads queued`, data };
    },
  },

  run_crawlers: {
    name: "run_crawlers",
    description: "Trigger the full agent cycle (all crawlers)",
    parameters: [],
    requiresConfirmation: true,
    execute: async () => {
      const origin = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const res = await fetch(`${origin}/api/ingest/daily-poll`, { method: "POST" });
      if (!res.ok) {
        return { success: false, message: `Crawler trigger failed (${res.status})` };
      }
      return { success: true, message: "Full agent cycle triggered. Crawlers are running." };
    },
  },

  adjust_weight: {
    name: "adjust_weight",
    description: "Propose a scoring weight change (logged to event_log, requires user confirmation)",
    parameters: [
      { name: "signal_type", type: "string", description: "Signal type to adjust (e.g., probate, tax_lien)", required: true },
      { name: "new_weight", type: "number", description: "New weight value (0-100)", required: true },
    ],
    requiresConfirmation: true,
    execute: async (params, supabase) => {
      const { signal_type, new_weight } = params;
      await supabase.from("event_log").insert({
        action: "grok_weight_proposal",
        details: {
          signal_type,
          proposed_weight: new_weight,
          status: "pending_approval",
          reasoning: `Grok proposed weight change for ${signal_type} to ${new_weight}`,
        },
      });
      return {
        success: true,
        message: `Weight change proposal logged: ${signal_type} → ${new_weight}. Requires manual approval in scoring config.`,
      };
    },
  },

  generate_report: {
    name: "generate_report",
    description: "Generate an analytics report (weekly, monthly, or pipeline)",
    parameters: [
      { name: "type", type: "string", description: "Report type: weekly | monthly | pipeline", required: true },
    ],
    requiresConfirmation: false,
    execute: async (params, supabase) => {
      const reportType = (params.type as string) || "weekly";
      const now = new Date();
      const daysBack = reportType === "monthly" ? 30 : 7;
      const since = new Date(now.getTime() - daysBack * 86400000).toISOString();

      const [leads, calls, closed] = await Promise.all([
        supabase.from("leads").select("id, status, created_at, priority").gte("created_at", since),
        supabase.from("calls_log").select("id, disposition, duration_sec, started_at").gte("started_at", since),
        supabase.from("leads").select("id").eq("status", "closed").gte("updated_at", since),
      ]);

      const totalLeads = leads.data?.length ?? 0;
      const totalCalls = calls.data?.length ?? 0;
      const totalClosed = closed.data?.length ?? 0;
      const avgScore = totalLeads > 0
        ? Math.round((leads.data ?? []).reduce((s, l) => s + (l.priority ?? 0), 0) / totalLeads)
        : 0;

      const report = [
        `## ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`,
        `Period: last ${daysBack} days`,
        `- New leads: ${totalLeads}`,
        `- Total calls: ${totalCalls}`,
        `- Closed deals: ${totalClosed}`,
        `- Avg lead score: ${avgScore}`,
      ].join("\n");

      return { success: true, message: report, data: { totalLeads, totalCalls, totalClosed, avgScore } };
    },
  },

  troubleshoot_sentinel: {
    name: "troubleshoot_sentinel",
    description: "Run full system diagnostics on Sentinel — checks event_log errors, env vars, crawler health",
    parameters: [
      { name: "depth", type: "number", description: "Number of event_log entries to scan (default 50)", required: false },
    ],
    requiresConfirmation: false,
    execute: async (params) => {
      const depth = Number(params.depth) || 50;
      const origin = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const res = await fetch(`${origin}/api/grok/troubleshoot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depth }),
      });
      if (!res.ok) {
        return { success: false, message: `Diagnostics failed (${res.status})` };
      }
      const data = await res.json();
      const summary = data.healthSummary;
      return {
        success: true,
        message: `System Status: ${summary.status.toUpperCase()}\n${summary.message}\nErrors: ${summary.errorCount} | Transitions: ${summary.failedTransitionCount} | API: ${summary.apiFailureCount} | Crawlers: ${summary.crawlerIssueCount}`,
        data,
      };
    },
  },

  draft_outreach: {
    name: "draft_outreach",
    description: "Use Outreach Agent to draft personalized SMS or email for a lead",
    parameters: [
      { name: "lead_name", type: "string", description: "Owner name of the lead", required: true },
      { name: "channel", type: "string", description: "sms or email", required: true },
      { name: "context", type: "string", description: "Additional context for the outreach", required: false },
    ],
    requiresConfirmation: false,
    execute: async (params, _supabase, apiKey) => {
      const leadCtx: LeadContext = {
        ownerName: (params.lead_name as string) || "Property Owner",
        address: (params.context as string) || "",
        score: 0,
        distressSignals: [],
        callHistory: [],
        aiNotes: [],
      };

      const agentPrompt = buildOutreachAgentPrompt(leadCtx);
      const systemPrompt = `You are a real estate outreach specialist. ${agentPrompt}`;
      const userMsg = `Draft a ${params.channel} for ${params.lead_name}. ${params.context || "Use a friendly, professional tone."}`;

      const response = await completeGrokChat({
        apiKey,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
      });

      return { success: true, message: response };
    },
  },
};

export async function executeAction(
  actionName: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
  apiKey: string,
): Promise<ActionResult> {
  const action = GROK_ACTIONS[actionName];
  if (!action) {
    return { success: false, message: `Unknown action: ${actionName}` };
  }
  try {
    const result = await action.execute(params, supabase, apiKey);
    await supabase.from("event_log").insert({
      action: `grok_action_${actionName}`,
      details: { params, result: result.message, success: result.success },
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, message: `Action failed: ${msg}` };
  }
}

export function parseActionBlocks(text: string): { action: string; params: Record<string, unknown>; description?: string }[] {
  const blocks: { action: string; params: Record<string, unknown>; description?: string }[] = [];
  const regex = /```json\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.action && typeof parsed.action === "string") {
        blocks.push({
          action: parsed.action,
          params: parsed.params ?? {},
          description: parsed.description,
        });
      }
    } catch {
      // Not an action block
    }
  }
  return blocks;
}
