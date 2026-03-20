import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import Anthropic from "@anthropic-ai/sdk";
import { logGeneration } from "@/lib/langfuse";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/visual-distress
 *
 * Visual Distress AI — Phase 1 (Claude Vision)
 *
 * Analyzes Google Street View images of a property for signs of
 * physical distress and deferred maintenance. Returns structured
 * assessment per category.
 *
 * Body: { leadId, address?, lat?, lng? }
 *
 * Write path: Street View images → Claude Vision → dossier_artifacts → fact_assertions
 * Review gate: All facts created with confidence "medium" (Street View images may be stale)
 * Rollback: Delete artifacts + facts with source_type = "visual_distress_ai"
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { leadId, address, lat, lng, traceId } = body as {
    leadId: string;
    address?: string;
    lat?: number;
    lng?: number;
    traceId?: string;
  };

  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const streetViewKey = process.env.GOOGLE_STREET_VIEW_KEY;

  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  if (!streetViewKey) return NextResponse.json({ error: "GOOGLE_STREET_VIEW_KEY not set" }, { status: 500 });

  // Resolve address if not provided
  let resolvedAddress = address;
  if (!resolvedAddress) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("property_id, properties(address, latitude, longitude)")
      .eq("id", leadId)
      .single();

    resolvedAddress = lead?.properties?.address;
  }

  if (!resolvedAddress && !lat) {
    return NextResponse.json({ error: "address or lat/lng required" }, { status: 400 });
  }

  try {
    // Fetch 4 Street View images (cardinal directions)
    const location = lat && lng ? `${lat},${lng}` : encodeURIComponent(resolvedAddress!);
    const headings = [0, 90, 180, 270];
    const imageUrls: string[] = [];

    for (const heading of headings) {
      const url = `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${location}&heading=${heading}&pitch=10&fov=90&key=${streetViewKey}`;
      imageUrls.push(url);
    }

    // Fetch all 4 images as base64
    const imageBuffers: { heading: number; base64: string }[] = [];

    for (let i = 0; i < headings.length; i++) {
      try {
        const res = await fetch(imageUrls[i]);
        if (!res.ok) continue;

        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");

        // Check if it's actually an image (Street View returns a gray image for unavailable locations)
        if (base64.length > 5000) { // Real images are much larger than placeholder
          imageBuffers.push({ heading: headings[i], base64 });
        }
      } catch {
        // Skip failed image fetches
      }
    }

    if (imageBuffers.length === 0) {
      return NextResponse.json({
        error: "No Street View imagery available for this location",
        address: resolvedAddress,
      }, { status: 404 });
    }

    // Send to Claude Vision for analysis
    const client = new Anthropic({ apiKey });

    const imageContent: Anthropic.MessageCreateParams["messages"][0]["content"] = imageBuffers.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data: img.base64,
      },
    }));

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      temperature: 0.1,
      messages: [{
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: VISUAL_DISTRESS_PROMPT,
          },
        ],
      }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawOutput = textBlock?.text ?? "";

    // Log generation to Langfuse
    if (traceId) {
      logGeneration({
        traceId,
        name: "visual_distress_analysis",
        model: "claude-sonnet-4-6",
        input: { address: resolvedAddress, imagesAnalyzed: imageBuffers.length },
        output: rawOutput.slice(0, 1000),
        usage: {
          input: response.usage?.input_tokens,
          output: response.usage?.output_tokens,
        },
      });
    }

    // Parse structured output
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI analysis", rawOutput: rawOutput.slice(0, 500) }, { status: 500 });
    }

    const analysis = JSON.parse(jsonMatch[0]) as VisualDistressAnalysis;

    // Store as artifact
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: artifact } = await (sb.from("dossier_artifacts") as any)
      .insert({
        lead_id: leadId,
        source_type: "visual_distress_ai",
        source_provider: "claude_vision",
        raw_payload: {
          analysis,
          imagesAnalyzed: imageBuffers.length,
          headingsUsed: imageBuffers.map((i) => i.heading),
          address: resolvedAddress,
          analyzedAt: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    // Create fact assertions for each category
    const factPromises = [];

    for (const category of Object.keys(analysis.categories)) {
      const cat = analysis.categories[category as keyof typeof analysis.categories];
      if (cat && cat.severity > 1) { // Only store notable findings
        factPromises.push(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sb.from("fact_assertions") as any).insert({
            lead_id: leadId,
            field_name: `visual_${category}_condition`,
            value: JSON.stringify({ condition: cat.condition, severity: cat.severity, details: cat.details }),
            confidence: "medium", // Street View images may be 6-18 months old
            source_type: "visual_distress_ai",
            source_provider: "claude_vision",
            artifact_id: artifact?.id,
          }).select().then(() => {}).catch(() => {}),
        );
      }
    }

    // Overall distress score fact
    factPromises.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.from("fact_assertions") as any).insert({
        lead_id: leadId,
        field_name: "visual_distress_overall",
        value: JSON.stringify({
          score: analysis.overallDistress,
          confidence: analysis.confidence,
          summary: analysis.summary,
          callAngleNote: analysis.callAngleNote,
        }),
        confidence: "medium",
        source_type: "visual_distress_ai",
        source_provider: "claude_vision",
        artifact_id: artifact?.id,
      }).select().then(() => {}).catch(() => {}),
    );

    await Promise.all(factPromises);

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: "visual_distress.analyzed",
      entity_type: "lead",
      entity_id: leadId,
      details: {
        address: resolvedAddress,
        overallDistress: analysis.overallDistress,
        imagesAnalyzed: imageBuffers.length,
        artifactId: artifact?.id,
      },
    }).select().then(() => {}).catch(() => {});

    return NextResponse.json({
      analysis,
      artifactId: artifact?.id,
      imagesAnalyzed: imageBuffers.length,
      address: resolvedAddress,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Types ───────────────────────────────────────────────────────────

interface CategoryAssessment {
  condition: "good" | "fair" | "poor" | "damaged" | "not_visible";
  severity: number; // 1-5 (1=good, 5=severe)
  details: string;
}

interface VisualDistressAnalysis {
  categories: {
    roof: CategoryAssessment;
    siding: CategoryAssessment;
    windows: CategoryAssessment;
    yard: CategoryAssessment;
    driveway: CategoryAssessment;
    general_upkeep: CategoryAssessment;
  };
  overallDistress: number; // 1-5
  confidence: "low" | "medium" | "high";
  summary: string;
  callAngleNote: string;
  repairIndicators: string[];
  estimatedDeferredMaintenanceYears: number;
}

// ── Prompt ──────────────────────────────────────────────────────────

const VISUAL_DISTRESS_PROMPT = `You are a real estate property condition analyst. Analyze these Google Street View images of a property from multiple angles.

Assess each exterior category for signs of distress or deferred maintenance. Be specific about what you observe.

Return ONLY a JSON object with this exact structure:
{
  "categories": {
    "roof": {
      "condition": "good|fair|poor|damaged|not_visible",
      "severity": 1-5,
      "details": "Specific observations about the roof"
    },
    "siding": {
      "condition": "good|fair|poor|damaged|not_visible",
      "severity": 1-5,
      "details": "Specific observations about siding/exterior walls"
    },
    "windows": {
      "condition": "good|fair|poor|damaged|not_visible",
      "severity": 1-5,
      "details": "Window condition, boarding, broken panes"
    },
    "yard": {
      "condition": "good|fair|poor|damaged|not_visible",
      "severity": 1-5,
      "details": "Landscaping, overgrowth, debris, fencing"
    },
    "driveway": {
      "condition": "good|fair|poor|damaged|not_visible",
      "severity": 1-5,
      "details": "Driveway/parking condition, vehicles, debris"
    },
    "general_upkeep": {
      "condition": "good|fair|poor|damaged|not_visible",
      "severity": 1-5,
      "details": "Overall maintenance level, paint, gutters, porch"
    }
  },
  "overallDistress": 1-5,
  "confidence": "low|medium|high",
  "summary": "2-3 sentence summary of property condition",
  "callAngleNote": "How Logan should reference this on a call (e.g., 'I noticed the property might need some exterior work')",
  "repairIndicators": ["List of specific repair items visible"],
  "estimatedDeferredMaintenanceYears": 2
}

Severity scale:
1 = Well maintained, no issues visible
2 = Minor wear, normal for age
3 = Noticeable deferred maintenance
4 = Significant neglect, multiple issues
5 = Severe deterioration, possible safety concerns

Confidence: "low" if images are blurry/obstructed, "medium" for typical Street View quality, "high" only if images are clear and recent-looking.

IMPORTANT: Street View images may be 6-18 months old. Note this in your confidence assessment. Do not overstate conditions — be accurate about what you can actually see.`;
