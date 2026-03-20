import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/synthetic-seller
 *
 * Synthetic Seller Lab — generates realistic seller personas for
 * agent training and system testing without live calls.
 *
 * Body: {
 *   scenario: string,  // "inherited", "pre_foreclosure", "divorce", "relocation", "vacant", "tired_landlord", "random"
 *   difficulty?: "easy" | "medium" | "hard",  // Seller resistance level
 *   count?: number,     // How many personas to generate (default: 1, max: 10)
 * }
 *
 * Returns synthetic seller persona(s) with:
 * - Background story
 * - Property details (Spokane/Kootenai market realistic)
 * - Motivation level and triggers
 * - Likely objections
 * - Decision-making dynamics
 * - Expected call flow
 * - Scoring signals (what the system should detect)
 *
 * GET /api/synthetic-seller?id=...
 * Retrieve a previously generated persona.
 *
 * GET /api/synthetic-seller
 * List recent synthetic personas.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    scenario = "random",
    difficulty = "medium",
    count = 1,
  } = body as { scenario?: string; difficulty?: string; count?: number };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const { analyzeWithClaude } = await import("@/lib/claude-client");

  const personas = [];

  for (let i = 0; i < Math.min(count, 10); i++) {
    const prompt = buildSyntheticSellerPrompt(scenario, difficulty, i);

    const result = await analyzeWithClaude({
      prompt,
      systemPrompt: SYNTHETIC_SELLER_SYSTEM_PROMPT,
      apiKey,
      temperature: 0.8, // Higher for variety
      maxTokens: 4096,
      model: "claude-sonnet-4-6",
    });

    // Parse JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const persona = JSON.parse(jsonMatch[0]);

        // Store in event_log for retrieval
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: entry } = await (sb.from("event_log") as any)
          .insert({
            user_id: user.id,
            action: "synthetic_seller.generated",
            entity_type: "synthetic_seller",
            details: { scenario, difficulty, persona },
          })
          .select("id, created_at")
          .single();

        personas.push({ id: entry?.id, ...persona, scenario, difficulty, createdAt: entry?.created_at });
      } catch {
        personas.push({ error: "Failed to parse persona", raw: result.slice(0, 500) });
      }
    }
  }

  return NextResponse.json({ personas, count: personas.length });
}

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("event_log") as any)
      .select("id, details, created_at")
      .eq("id", id)
      .eq("action", "synthetic_seller.generated")
      .single();

    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ persona: data.details?.persona, id: data.id, createdAt: data.created_at });
  }

  // List recent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("event_log") as any)
    .select("id, details, created_at")
    .eq("action", "synthetic_seller.generated")
    .order("created_at", { ascending: false })
    .limit(20);

  const personas = (data ?? []).map((d: Record<string, unknown>) => ({
    id: d.id,
    scenario: (d.details as Record<string, unknown>)?.scenario,
    difficulty: (d.details as Record<string, unknown>)?.difficulty,
    name: ((d.details as Record<string, unknown>)?.persona as Record<string, unknown>)?.name,
    createdAt: d.created_at,
  }));

  return NextResponse.json({ personas });
}

const SYNTHETIC_SELLER_SYSTEM_PROMPT = `You are a real estate training simulator for Spokane/North Idaho wholesale acquisitions. Generate hyper-realistic seller personas that Logan (acquisitions manager) can practice against.

Your personas must be:
- Rooted in Spokane/Kootenai County reality (real neighborhoods, realistic prices, actual market conditions)
- Emotionally complex (people selling homes are usually going through something)
- Internally consistent (their story, financials, and behavior should all make sense together)
- Useful for training (each persona should teach a specific skill or scenario)

Return ONLY valid JSON. No markdown, no commentary.`;

function buildSyntheticSellerPrompt(scenario: string, difficulty: string, index: number): string {
  const scenarios: Record<string, string> = {
    inherited: "Property inherited after parent/relative death. Executor or heir, possibly out of state. Emotional attachment vs. practical need to liquidate.",
    pre_foreclosure: "Behind on mortgage payments. Bank pressure. Embarrassment. May be in denial or desperate. Needs fast solution.",
    divorce: "Splitting assets during divorce. May have a hostile ex involved in decision. Time pressure from court deadlines.",
    relocation: "Job transfer or life change forcing quick sale. Property may be in good condition. Seller is busy and distracted.",
    vacant: "Property has been sitting empty. Maintenance costs adding up. May be a rental that went bad. Owner overwhelmed.",
    tired_landlord: "Landlord burned out from bad tenants, maintenance, management headaches. Property may need work. Looking for exit.",
    random: "Generate any realistic Spokane/Kootenai seller scenario. Surprise me.",
  };

  const difficultyGuide: Record<string, string> = {
    easy: "Seller is motivated, transparent about their situation, and open to offers. Good for building confidence.",
    medium: "Seller has concerns but is reachable. Some objections (price, timeline, trust). Requires NEPQ approach.",
    hard: "Seller is guarded, skeptical, or hostile. Multiple objections. May have talked to other investors. Requires advanced rapport-building.",
  };

  return `Generate synthetic seller persona #${index + 1}.

Scenario: ${scenarios[scenario] ?? scenarios.random}
Difficulty: ${difficulty} — ${difficultyGuide[difficulty] ?? difficultyGuide.medium}

Return JSON with this exact structure:
{
  "name": "Full name",
  "age": 55,
  "occupation": "Current or former job",
  "neighborhood": "Real Spokane/Kootenai neighborhood name",
  "propertyAddress": "Realistic but fictional address in that neighborhood",
  "propertyType": "SFR/Duplex/etc",
  "bedrooms": 3,
  "bathrooms": 2,
  "squareFeet": 1450,
  "yearBuilt": 1978,
  "estimatedArv": 285000,
  "estimatedRepairs": 35000,
  "estimatedEquity": 180000,
  "mortgageBalance": 105000,
  "monthlyPayment": 850,
  "taxStatus": "current/delinquent",
  "condition": "Brief physical condition description",
  "scenario": "${scenario}",
  "backstory": "3-4 sentence emotional backstory. What led them here. What's really going on.",
  "motivationLevel": 7,
  "motivationDrivers": ["Primary driver", "Secondary driver"],
  "timeline": "How soon they need to act",
  "decisionMakers": ["Who else is involved in the decision"],
  "likelyObjections": [
    {"objection": "The objection text", "realConcern": "What's really behind it", "bestApproach": "How to handle it"}
  ],
  "personalityTraits": ["trait1", "trait2", "trait3"],
  "communicationStyle": "How they talk — fast/slow, emotional/analytical, etc.",
  "triggerPhrases": ["Phrases that would make them open up or shut down"],
  "redFlags": ["Things Logan should watch for"],
  "idealCallFlow": "Brief description of how the ideal call would go",
  "scoringSignals": {
    "distressTypes": ["tax_lien", "probate", etc.],
    "expectedOpportunityScore": 72,
    "expectedContactabilityScore": 65
  }
}`;
}
