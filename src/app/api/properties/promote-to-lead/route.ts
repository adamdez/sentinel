import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { resolveMarket } from "@/lib/market-resolver";
import { getFeatureFlag } from "@/lib/control-plane";

export const runtime = "nodejs";

/**
 * POST /api/properties/promote-to-lead
 *
 * Creates a lead from a property (either existing in DB or new).
 * If the property doesn't exist, creates it first.
 * If a lead already exists for this property, returns the existing lead.
 *
 * Body: {
 *   propertyId?: string        — existing property UUID (skip property creation)
 *   address: string             — required if no propertyId
 *   city?: string
 *   state?: string
 *   zip?: string
 *   county?: string
 *   ownerName?: string
 *   apn?: string
 *   source?: string             — e.g. "manual_lookup", "propertyradar", "attom"
 *   notes?: string              — initial notes for the lead
 *   nextAction?: string         — required by stage machine for new leads
 * }
 *
 * Blueprint: "No lead advances without next_action set."
 * New leads start in 'prospect' status with a required next_action.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      propertyId,
      address,
      city,
      state,
      zip,
      county,
      ownerName,
      apn,
      source,
      notes,
      nextAction,
    } = body;

    if (!nextAction) {
      return NextResponse.json(
        { error: "nextAction is required (stage machine enforcement)" },
        { status: 400 },
      );
    }

    let resolvedPropertyId = propertyId;

    // ── Resolve or create property ──────────────────────────────────────
    if (!resolvedPropertyId) {
      if (!address) {
        return NextResponse.json(
          { error: "Either propertyId or address is required" },
          { status: 400 },
        );
      }

      // Check for existing property by address
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (sb.from("properties") as any)
        .select("id")
        .ilike("address", address)
        .limit(1)
        .maybeSingle();

      if (existing) {
        resolvedPropertyId = existing.id;
      } else {
        // Create new property
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newProp, error: propErr } = await (sb.from("properties") as any)
          .insert({
            address,
            city: city ?? null,
            state: state ?? null,
            zip: zip ?? null,
            county: county ?? null,
            owner_name: ownerName ?? null,
            apn: apn ?? null,
          })
          .select("id")
          .single();

        if (propErr) {
          throw new Error(`Failed to create property: ${propErr.message}`);
        }
        resolvedPropertyId = newProp.id;
      }
    }

    // ── Resolve market from county ──────────────────────────────────────
    // If county was provided in the body, use it directly.
    // Otherwise, look it up from the property record.
    let resolvedCounty = county as string | null | undefined;
    if (!resolvedCounty && resolvedPropertyId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: propRow } = await (sb.from("properties") as any)
        .select("county")
        .eq("id", resolvedPropertyId)
        .maybeSingle();
      resolvedCounty = propRow?.county ?? null;
    }
    const market = resolveMarket(resolvedCounty);

    // ── Check for existing lead ─────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id, status, assigned_to, next_action, created_at")
      .eq("property_id", resolvedPropertyId)
      .not("status", "in", "(dead,closed)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingLead) {
      return NextResponse.json({
        ok: true,
        created: false,
        message: "Lead already exists for this property",
        leadId: existingLead.id,
        lead: existingLead,
        propertyId: resolvedPropertyId,
      });
    }

    // ── Create new lead ─────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newLead, error: leadErr } = await (sb.from("leads") as any)
      .insert({
        property_id: resolvedPropertyId,
        status: "prospect",
        source: source ?? "manual_lookup",
        market,
        notes: notes ?? null,
        next_action: nextAction,
        next_action_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h from now
        priority: 50,
        lock_version: 0,
      })
      .select("id, status, source, next_action, next_action_due_at, created_at")
      .single();

    if (leadErr) {
      throw new Error(`Failed to create lead: ${leadErr.message}`);
    }

    // ── Auto-trigger Research Agent (fire-and-forget) ──────────────────
    // Blueprint: "Triggered by lead promotion or operator request."
    // Research runs async — operator reviews dossier before CRM sync.
    if (nextAction === "research" || nextAction === "call") {
      getFeatureFlag("agent.research.enabled").then((flag) => {
        if (!flag?.enabled) {
          console.debug("[promote-to-lead] Research agent trigger skipped — feature flag agent.research.enabled not enabled");
          return;
        }
        triggerResearch(newLead.id, resolvedPropertyId, user.id).catch((err) => {
          console.error("[promote-to-lead] Research agent trigger failed:", err);
        });
      });
    }

    // ── Auto-trigger skiptrace on promotion (fire-and-forget) ────────
    // Blueprint: "Run ONLY on lead promotion to working status."
    // Results go to intel pipeline (artifacts + facts), not direct to leads.
    triggerSkiptrace(newLead.id, {
      address: address ?? null,
      city: city ?? null,
      state: state ?? null,
      zip: zip ?? null,
      ownerName: ownerName ?? null,
      propertyId: resolvedPropertyId,
    }).catch((err) => {
      console.error("[promote-to-lead] Skiptrace trigger failed (non-fatal):", err);
    });

    return NextResponse.json({
      ok: true,
      created: true,
      leadId: newLead.id,
      lead: newLead,
      propertyId: resolvedPropertyId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[properties/promote-to-lead] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * Fire-and-forget: trigger Research Agent for the newly promoted lead.
 * Agent writes to staging tables only — operator reviews before CRM sync.
 */
async function triggerResearch(
  leadId: string,
  propertyId: string,
  triggeredBy: string,
): Promise<void> {
  const { runResearchAgent } = await import("@/agents/research");
  await runResearchAgent({
    leadId,
    propertyId,
    triggeredBy,
  });
}

/**
 * Fire-and-forget: run skiptrace on promotion and store results as intel artifacts.
 * Write path: dualSkipTrace → raw_artifact → fact_assertions (pending review).
 * Does NOT write directly to leads.phone — facts stay in intel until reviewed.
 */
async function triggerSkiptrace(
  leadId: string,
  params: {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    ownerName: string | null;
    propertyId: string;
  },
): Promise<void> {
  if (!params.address) return; // Can't skiptrace without an address

  const { dualSkipTrace } = await import("@/lib/skip-trace");
  const { createArtifact, createFact } = await import("@/lib/intelligence");

  const result = await dualSkipTrace({
    id: params.propertyId,
    address: params.address ?? undefined,
    city: params.city ?? undefined,
    state: params.state ?? undefined,
    zip: params.zip ?? undefined,
    owner_name: params.ownerName ?? undefined,
  });

  if (result.totalPhoneCount === 0 && result.totalEmailCount === 0) return;

  // Step 1: Store raw skiptrace result as artifact
  const artifactId = await createArtifact({
    leadId,
    propertyId: params.propertyId,
    sourceType: "skiptrace_promotion",
    sourceLabel: `Skip trace (${result.providers.join(", ")})`,
    rawExcerpt: JSON.stringify({
      phones: result.phones,
      emails: result.emails,
      persons: result.persons,
      primaryPhone: result.primaryPhone,
      primaryEmail: result.primaryEmail,
      isLitigator: result.isLitigator,
      hasDncNumbers: result.hasDncNumbers,
    }).slice(0, 10000),
    capturedBy: "promote-to-lead:skiptrace",
  });

  // Step 2: Create fact assertions for key contact data
  if (result.primaryPhone) {
    await createFact({
      artifactId,
      leadId,
      factType: "primary_phone",
      factValue: result.primaryPhone,
      confidence: "medium",
      promotedField: "phone",
      assertedBy: `skiptrace:${result.providers.join("+")}`,
    });
  }

  if (result.primaryEmail) {
    await createFact({
      artifactId,
      leadId,
      factType: "primary_email",
      factValue: result.primaryEmail,
      confidence: "medium",
      promotedField: "email",
      assertedBy: `skiptrace:${result.providers.join("+")}`,
    });
  }

  if (result.isLitigator) {
    await createFact({
      artifactId,
      leadId,
      factType: "litigator_flag",
      factValue: "true",
      confidence: "high",
      assertedBy: `skiptrace:${result.providers.join("+")}`,
    });
  }

  // Store individual phone numbers as facts (top 3)
  for (const phone of result.phones.slice(0, 3)) {
    if (phone.number === result.primaryPhone) continue;
    await createFact({
      artifactId,
      leadId,
      factType: "phone_number",
      factValue: phone.number,
      confidence: phone.confidence >= 80 ? "high" : phone.confidence >= 50 ? "medium" : "low",
      assertedBy: `skiptrace:${phone.source}`,
    });
  }

  console.log(
    `[promote-to-lead] Skiptrace complete: ${result.totalPhoneCount} phones, ${result.totalEmailCount} emails for lead ${leadId}`,
  );
}
