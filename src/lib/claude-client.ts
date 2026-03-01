/**
 * Claude Client — Streaming chat + structured analysis for Google Ads.
 *
 * Uses the Anthropic SDK for ad copy review, performance analysis,
 * landing page review, and strategic recommendations.
 */

import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Streaming Chat ──────────────────────────────────────────────────

export async function streamClaudeChat(opts: {
  messages: ClaudeMessage[];
  systemPrompt: string;
  apiKey: string;
  temperature?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const { messages, systemPrompt, apiKey, temperature = 0.3 } = opts;

  const client = new Anthropic({ apiKey });

  const stream = await client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    temperature,
    system: systemPrompt,
    messages: messages.slice(-20),
  });

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = `data: ${JSON.stringify({
              choices: [{ delta: { content: event.delta.text } }],
            })}\n\n`;
            controller.enqueue(encoder.encode(chunk));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// ── Structured Analysis (non-streaming) ─────────────────────────────

export async function analyzeWithClaude(opts: {
  prompt: string;
  systemPrompt: string;
  apiKey: string;
  temperature?: number;
}): Promise<string> {
  const { prompt, systemPrompt, apiKey, temperature = 0.2 } = opts;

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

// ── System Prompts ──────────────────────────────────────────────────

export function buildAdsSystemPrompt(context?: {
  totalSpend?: number;
  totalConversions?: number;
  avgCpc?: number;
  avgCtr?: number;
  campaignCount?: number;
}): string {
  const c = context ?? {};

  return [
    "You are **Claude**, the Google Ads optimization AI for Dominion Homes — a cash home buying company in Spokane, WA and Coeur d'Alene / Kootenai County, ID.",
    "",
    "## Business Context",
    "- Company: Dominion Homes, LLC (Adam, Nathan, Logan)",
    "- Service: Buy houses for cash — no commissions, close in 2 weeks, any condition",
    "- Markets: Spokane County WA + Kootenai County ID (Spokane Valley, CDA, Post Falls, Hayden, Liberty Lake, etc.)",
    "- Landing page: dominionhomedeals.com — single-page lead gen with form + phone CTA",
    "- Target sellers: inherited property, behind on payments, divorce, relocation, landlord exit, major repairs",
    "- Goal: maximize qualified leads (homeowners wanting to sell for cash) at lowest cost-per-lead",
    "",
    "## Current Metrics",
    `- Total spend (period): $${c.totalSpend?.toFixed(2) ?? "unknown"}`,
    `- Total conversions: ${c.totalConversions ?? "unknown"}`,
    `- Avg CPC: $${c.avgCpc?.toFixed(2) ?? "unknown"}`,
    `- Avg CTR: ${c.avgCtr ? (c.avgCtr * 100).toFixed(2) + "%" : "unknown"}`,
    `- Active campaigns: ${c.campaignCount ?? "unknown"}`,
    "",
    "## Your Role",
    "You analyze Google Ads performance and provide actionable recommendations:",
    "- Review ad copy for relevance, emotional triggers, and conversion potential",
    "- Identify underperforming keywords, ad groups, and campaigns",
    "- Suggest bid adjustments, budget reallocation, and new keyword opportunities",
    "- Analyze landing page alignment with ad messaging",
    "- Generate A/B test variations for headlines and descriptions",
    "- Flag wasted spend and negative keyword opportunities",
    "",
    "## Output Format",
    "When suggesting actions, use this JSON format:",
    "```json",
    '{ "action": "bid_adjust" | "pause_keyword" | "enable_keyword" | "update_copy" | "add_keyword" | "budget_adjust", "target": "<entity>", "target_id": "<id>", "old_value": "<current>", "new_value": "<suggested>", "reason": "<why>" }',
    "```",
    "",
    "Be direct, data-driven, and specific. Every recommendation should include the expected impact.",
  ].join("\n");
}

export function buildLandingPageReviewPrompt(): string {
  return [
    "You are reviewing dominionhomedeals.com for conversion rate optimization.",
    "Analyze the landing page content and provide:",
    "",
    "1. **Headline Effectiveness** — Does it immediately communicate the value prop?",
    "2. **CTA Clarity** — Are the calls-to-action clear, visible, and compelling?",
    "3. **Trust Signals** — Are there enough credibility indicators?",
    "4. **Ad-to-Page Alignment** — Does the page match what the Google Ads promise?",
    "5. **Mobile Experience** — Any issues for mobile visitors?",
    "6. **Friction Points** — What might cause a visitor to leave without converting?",
    "7. **Specific Suggestions** — Concrete changes ranked by expected impact.",
    "",
    "Focus on changes that directly increase form submissions and phone calls.",
    "Be specific — don't say 'improve the headline', say exactly what the new headline should be.",
  ].join("\n");
}
