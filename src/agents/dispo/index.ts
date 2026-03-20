/**
 * Dispo Agent — Runner
 *
 * Ranks buyers by fit for a specific deal, generates outreach drafts
 * for the top candidates. All drafts go to review_queue.
 *
 * Triggered by:
 *   - Deal status changes to "under_contract" or "assigned"
 *   - Stale dispo detection (deal in dispo for >48h with no outreach)
 *   - Manual operator request
 *
 * Write path: Drafts → review_queue (operator selects buyer and approves)
 */

import { createServerClient } from "@/lib/supabase";
import { analyzeWithClaude } from "@/lib/claude-client";
import {
  createAgentRun,
  completeAgentRun,
  isAgentEnabled,
  submitProposal,
} from "@/lib/control-plane";
import {
  scoreBuyers,
  rankedRadarEntries,
  type BuyerWithPhase1,
  type LeadContext,
} from "@/lib/buyer-fit";
import { DISPO_AGENT_VERSION, DISPO_AGENT_MODEL, DISPO_SYSTEM_PROMPT } from "./prompt";
import type { DispoAgentInput, DispoAgentResult, BuyerOutreachDraft } from "./types";

export async function runDispoAgent(input: DispoAgentInput): Promise<DispoAgentResult> {
  // Check feature flag
  const enabled = await isAgentEnabled("dispo");
  if (!enabled) {
    return {
      runId: "none",
      dealId: input.dealId,
      leadId: input.leadId,
      totalBuyers: 0,
      qualifiedBuyers: 0,
      eliminatedBuyers: 0,
      drafts: [],
      status: "disabled",
      summary: "Dispo Agent disabled via feature flag",
    };
  }

  const triggerTypeMap: Record<string, string> = {
    deal_under_contract: "event",
    stale_dispo: "cron",
    operator_request: "operator_request",
  };

  const runId = await createAgentRun({
    agentName: "dispo",
    triggerType: triggerTypeMap[input.triggerType] as "event" | "cron" | "operator_request",
    triggerRef: input.triggerRef ?? input.dealId,
    leadId: input.leadId,
    model: DISPO_AGENT_MODEL,
    promptVersion: DISPO_AGENT_VERSION,
    inputs: { dealId: input.dealId, triggerType: input.triggerType },
  });

  if (!runId) {
    return emptyResult(input, "disabled", "Dispo Agent already running for this lead — skipped duplicate.", "dedup");
  }

  try {
    const sb = createServerClient();
    const maxBuyers = input.maxBuyers ?? 5;

    // ── Load deal + lead + property ─────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deal } = await (sb.from("deals") as any)
      .select(`
        id, lead_id, status, contract_price, arv, repair_estimate,
        assignment_fee, dispo_prep, entered_dispo_at,
        leads(
          id, first_name, last_name, status, motivation_level,
          properties(address, city, state, zip, county, owner_name)
        )
      `)
      .eq("id", input.dealId)
      .single();

    if (!deal) {
      await completeAgentRun({ runId, status: "failed", error: "Deal not found" });
      return emptyResult(input, "failed", `Deal ${input.dealId} not found`, runId);
    }

    const lead = deal.leads as Record<string, unknown> | null;
    const prop = lead?.properties as Record<string, unknown> | null;

    // ── Load all active buyers ──────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allBuyers } = await (sb.from("buyers") as any)
      .select("*")
      .eq("status", "active")
      .limit(200);

    if (!allBuyers || allBuyers.length === 0) {
      await completeAgentRun({ runId, status: "completed", outputs: { message: "No active buyers" } });
      return emptyResult(input, "no_buyers", "No active buyers in the system", runId);
    }

    // ── Load already-actioned buyers for this deal ──────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingDealBuyers } = await (sb.from("deal_buyers") as any)
      .select("buyer_id")
      .eq("deal_id", input.dealId);

    const alreadyActioned = new Set<string>(
      (existingDealBuyers ?? []).map((db: Record<string, unknown>) => db.buyer_id as string),
    );

    // ── Run buyer-fit scoring ───────────────────────────────────────
    const leadContext: LeadContext = {
      market: prop?.county ? `${(prop.county as string).toLowerCase()}_county` : null,
      zip: (prop?.zip as string) ?? null,
      propertyType: null, // Would come from property details
      estimatedValue: (deal.arv as number) ?? null,
      isVacant: false,    // Would come from property details
      conditionLevel: null,
      priceExpectation: (deal.contract_price as number) ?? null,
    };

    const scorerResults = scoreBuyers(
      allBuyers as BuyerWithPhase1[],
      leadContext,
      alreadyActioned,
    );

    const ranked = rankedRadarEntries(scorerResults);
    const totalBuyers = allBuyers.length;
    const qualifiedBuyers = ranked.length;
    const eliminatedBuyers = totalBuyers - qualifiedBuyers;

    if (ranked.length === 0) {
      await completeAgentRun({
        runId,
        status: "completed",
        outputs: { totalBuyers, qualifiedBuyers: 0, eliminatedBuyers },
      });
      return emptyResult(input, "no_buyers", `All ${totalBuyers} buyers eliminated by fit scoring`, runId);
    }

    // ── Generate outreach drafts for top buyers ─────────────────────
    const topBuyers = ranked.slice(0, maxBuyers);
    const address = prop
      ? [prop.address, prop.city, prop.state].filter(Boolean).join(", ")
      : "Property address not available";

    const buyerSummaries = topBuyers
      .map(
        (entry) =>
          `Buyer: ${entry.buyer.contact_name} (${entry.buyer.company_name ?? "Individual"})
Score: ${entry.score}/100
Contact: ${entry.buyer.preferred_contact_method} | ${entry.buyer.phone ?? "no phone"} | ${entry.buyer.email ?? "no email"}
Markets: ${entry.buyer.markets.join(", ") || "any"}
Price range: $${entry.buyer.price_range_low ?? "?"} - $${entry.buyer.price_range_high ?? "?"}
Asset types: ${entry.buyer.asset_types.join(", ") || "any"}
Funding: ${entry.buyer.funding_type ?? "unknown"} | POF: ${entry.buyer.proof_of_funds}
Rehab tolerance: ${entry.buyer.rehab_tolerance ?? "unknown"}
Reliability: ${entry.buyer.reliability_score ?? "?"}/5 | Deals closed: ${entry.buyer.deals_closed}
Flags: ${entry.flags.join(", ") || "none"}
Stale: ${entry.stale ? "YES (>90 days since contact)" : "no"}`,
      )
      .join("\n---\n");

    const userPrompt = `## Deal Details
Property: ${address}
ARV: $${deal.arv ?? "unknown"}
Contract Price: $${deal.contract_price ?? "unknown"}
Repair Estimate: $${deal.repair_estimate ?? "unknown"}
Assignment Fee Target: $${deal.assignment_fee ?? "TBD"}

## Top ${topBuyers.length} Buyers (ranked by fit)
${buyerSummaries}

${input.operatorNotes ? `## Operator Notes\n${input.operatorNotes}` : ""}

## Task
Generate one outreach draft per buyer above. Return JSON:
{
  "drafts": [
    {
      "buyerId": "buyer UUID",
      "buyerName": "contact name",
      "channel": "phone" | "email" | "sms",
      "subject": "email subject if email",
      "body": "message body or call talking points",
      "reasoning": "why this buyer and approach"
    }
  ]
}`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await completeAgentRun({ runId, status: "failed", error: "ANTHROPIC_API_KEY not set" });
      return emptyResult(input, "failed", "ANTHROPIC_API_KEY not configured", runId);
    }

    const response = await analyzeWithClaude({
      prompt: userPrompt,
      systemPrompt: DISPO_SYSTEM_PROMPT,
      apiKey,
      temperature: 0.3,
      maxTokens: 3000,
    });

    // ── Parse response ──────────────────────────────────────────────
    let drafts: BuyerOutreachDraft[] = [];
    try {
      const jsonMatch = response.match(/\{[\s\S]*"drafts"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        drafts = (parsed.drafts ?? []).map((d: Record<string, unknown>, i: number) => {
          const matchedBuyer = topBuyers[i];
          return {
            buyerId: (d.buyerId as string) ?? matchedBuyer?.buyer.id ?? "unknown",
            buyerName: (d.buyerName as string) ?? matchedBuyer?.buyer.contact_name ?? "Unknown",
            fitScore: matchedBuyer?.score ?? 0,
            fitFlags: matchedBuyer?.flags ?? [],
            channel: (d.channel as string) ?? "email",
            subject: d.subject as string | undefined,
            body: (d.body as string) ?? "",
            reasoning: (d.reasoning as string) ?? "",
          };
        });
      }
    } catch {
      // If parsing fails, create a basic draft from the raw response
      drafts = topBuyers.map((entry) => ({
        buyerId: entry.buyer.id,
        buyerName: entry.buyer.contact_name,
        fitScore: entry.score,
        fitFlags: entry.flags,
        channel: (entry.buyer.preferred_contact_method ?? "email") as "phone" | "email" | "sms",
        body: response.slice(0, 500),
        reasoning: "Raw response — JSON parsing failed",
      }));
    }

    // ── Submit to review queue ──────────────────────────────────────
    for (const draft of drafts) {
      await submitProposal({
        runId,
        agentName: "dispo",
        entityType: "deal",
        entityId: input.dealId,
        action: `buyer_outreach_${draft.channel}`,
        proposal: draft as unknown as Record<string, unknown>,
        rationale: `${draft.buyerName} (fit: ${draft.fitScore}/100): ${draft.reasoning}`,
        priority: draft.fitScore >= 70 ? 2 : 5,
      });
    }

    const summary = `Scored ${totalBuyers} buyers: ${qualifiedBuyers} qualified, ${eliminatedBuyers} eliminated. Generated ${drafts.length} outreach draft(s) for top buyers. Queued for operator review.`;

    await completeAgentRun({
      runId,
      status: "completed",
      outputs: {
        totalBuyers,
        qualifiedBuyers,
        eliminatedBuyers,
        draftCount: drafts.length,
        topBuyerNames: drafts.map((d) => d.buyerName),
        summary,
      },
    });

    return {
      runId,
      dealId: input.dealId,
      leadId: input.leadId,
      totalBuyers,
      qualifiedBuyers,
      eliminatedBuyers,
      drafts,
      status: "queued_for_review",
      summary,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await completeAgentRun({ runId, status: "failed", error: msg });
    return emptyResult(input, "failed", `Dispo analysis failed: ${msg}`, runId);
  }
}

function emptyResult(
  input: DispoAgentInput,
  status: DispoAgentResult["status"],
  summary: string,
  runId = "none",
): DispoAgentResult {
  return {
    runId,
    dealId: input.dealId,
    leadId: input.leadId,
    totalBuyers: 0,
    qualifiedBuyers: 0,
    eliminatedBuyers: 0,
    drafts: [],
    status,
    summary,
  };
}
