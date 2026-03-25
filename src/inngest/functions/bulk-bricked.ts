/**
 * Inngest function: Bulk Bricked AI property analysis.
 *
 * Iterates through leads (optionally filtered), calls Bricked AI /create
 * for each property, stores full response in properties.owner_flags.
 *
 * Rate-limited: 2-second delay between calls, batches of 5.
 * Concurrency-limited to 1 — only one bulk run at a time.
 */

import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";

const BRICKED_BASE = "https://api.bricked.ai";

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface LeadProperty {
  leadId: string;
  propertyId: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  existingBrickedId: string | null;
}

interface BrickedResult {
  leadId: string;
  propertyId: string;
  address: string;
  success: boolean;
  brickedId?: string;
  arv?: number;
  cmv?: number;
  error?: string;
  source: "create" | "get" | "list_fallback" | "skipped" | "error";
}

export const bulkBrickedJob = inngest.createFunction(
  {
    id: "bulk-bricked-analysis",
    retries: 0,
    concurrency: { limit: 1 },
    triggers: [{ event: "intel/bulk-bricked.requested" }],
  },
  async ({ event, step }) => {
    const {
      runId,
      leadIds,
      force,
      limit: maxLeads,
    } = event.data as {
      runId: string;
      leadIds?: string[];
      force?: boolean; // re-analyze even if already done
      limit?: number;
    };

    const sb = createSupabase();
    const brickedKey = process.env.BRICKED_API_KEY;
    if (!brickedKey) throw new Error("BRICKED_API_KEY not configured");

    // 1. Fetch leads with property data
    const properties = await step.run("fetch-leads", async () => {
      let query = sb
        .from("leads")
        .select(`
          id,
          property_id,
          properties!inner (
            id,
            address,
            city,
            state,
            zip,
            bedrooms,
            bathrooms,
            sqft,
            year_built,
            owner_flags
          )
        `)
        .not("property_id", "is", null);

      if (leadIds && leadIds.length > 0) {
        query = query.in("id", leadIds);
      }

      if (maxLeads) {
        query = query.limit(maxLeads);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch leads: ${error.message}`);

      return (data ?? [])
        .map((row: Record<string, unknown>) => {
          const prop = row.properties as Record<string, unknown> | null;
          if (!prop) return null;
          const flags = (prop.owner_flags ?? {}) as Record<string, unknown>;
          const address = prop.address as string | null;
          if (!address) return null;

          return {
            leadId: row.id as string,
            propertyId: prop.id as string,
            address,
            city: (prop.city as string) || null,
            state: (prop.state as string) || null,
            zip: (prop.zip as string) || null,
            bedrooms: (prop.bedrooms as number) || null,
            bathrooms: (prop.bathrooms as number) || null,
            sqft: (prop.sqft as number) || null,
            yearBuilt: (prop.year_built as number) || null,
            existingBrickedId: (flags.bricked_id as string) || null,
          } as LeadProperty;
        })
        .filter((p): p is LeadProperty => p !== null)
        .filter((p) => {
          // Skip already-analyzed unless force=true
          if (force) return true;
          return !p.existingBrickedId;
        });
    });

    console.log(`[BulkBricked:${runId}] ${properties.length} properties to analyze`);

    if (properties.length === 0) {
      return { runId, total: 0, success: 0, errors: 0, skipped: 0, results: [] };
    }

    // 2. Process in batches
    const results: BrickedResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    const batchSize = 5;
    for (let i = 0; i < properties.length; i += batchSize) {
      const batch = properties.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(properties.length / batchSize);

      const batchResults = await step.run(
        `bricked-batch-${batchNum}`,
        async () => {
          const batchOut: BrickedResult[] = [];

          for (const prop of batch) {
            try {
              // Try /get/{id} first if we have an existing bricked_id
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let data: any = null;
              let source: BrickedResult["source"] = "create";

              if (prop.existingBrickedId) {
                const getRes = await fetch(
                  `${BRICKED_BASE}/v1/property/get/${prop.existingBrickedId}`,
                  { method: "GET", headers: { "x-api-key": brickedKey } },
                );
                if (getRes.ok) {
                  data = await getRes.json();
                  source = "get";
                }
              }

              // Fall back to /create
              if (!data) {
                const fullAddress = [prop.address, prop.city, prop.state, prop.zip]
                  .filter(Boolean)
                  .join(", ");

                const url = new URL(`${BRICKED_BASE}/v1/property/create`);
                url.searchParams.set("address", fullAddress);
                if (prop.bedrooms) url.searchParams.set("bedrooms", String(prop.bedrooms));
                if (prop.bathrooms) url.searchParams.set("bathrooms", String(prop.bathrooms));
                if (prop.sqft) url.searchParams.set("squareFeet", String(prop.sqft));
                if (prop.yearBuilt) url.searchParams.set("yearBuilt", String(prop.yearBuilt));

                const createRes = await fetch(url.toString(), {
                  method: "GET",
                  headers: { "x-api-key": brickedKey },
                });

                if (createRes.ok) {
                  data = await createRes.json();
                  source = "create";
                } else if (createRes.status === 404) {
                  batchOut.push({
                    leadId: prop.leadId,
                    propertyId: prop.propertyId,
                    address: prop.address,
                    success: false,
                    error: "Property not found in Bricked coverage",
                    source: "error",
                  });
                  continue;
                } else {
                  const errText = await createRes.text().catch(() => "");
                  batchOut.push({
                    leadId: prop.leadId,
                    propertyId: prop.propertyId,
                    address: prop.address,
                    success: false,
                    error: `Bricked HTTP ${createRes.status}: ${errText.slice(0, 200)}`,
                    source: "error",
                  });
                  continue;
                }
              }

              // Persist to owner_flags
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const flags: Record<string, any> = {};
              if (data.arv) { flags.bricked_arv = data.arv; flags.comp_arv = data.arv; }
              if (data.cmv) flags.bricked_cmv = data.cmv;
              if (data.totalRepairCost) flags.bricked_repair_cost = data.totalRepairCost;
              if (data.shareLink) flags.bricked_share_link = data.shareLink;
              if (data.dashboardLink) flags.bricked_dashboard_link = data.dashboardLink;
              if (data.id) flags.bricked_id = data.id;
              if (data.repairs?.length) flags.bricked_repairs = data.repairs;
              if (data.comps?.length)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                flags.comp_count = data.comps.filter((c: any) => c.selected).length;
              if (data.property?.mortgageDebt?.estimatedEquity)
                flags.bricked_equity = data.property.mortgageDebt.estimatedEquity;
              if (data.property?.mortgageDebt?.openMortgageBalance)
                flags.bricked_open_mortgage = data.property.mortgageDebt.openMortgageBalance;
              if (data.property?.ownership?.owners?.length) {
                flags.bricked_owner_names = data.property.ownership.owners
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .map((o: any) => [o.firstName, o.lastName].filter(Boolean).join(" "))
                  .filter(Boolean)
                  .join("; ");
              }
              if (data.property?.ownership?.ownershipLength)
                flags.bricked_ownership_years = data.property.ownership.ownershipLength;
              if (data.property?.details?.renovationScore?.hasScore)
                flags.bricked_renovation_score = data.property.details.renovationScore.score;
              if (data.property?.images?.length)
                flags.bricked_subject_images = data.property.images;

              flags.bricked_full_response = data;
              flags.bricked_fetched_at = new Date().toISOString();

              // JSONB merge
              const { data: currentProp } = await sb
                .from("properties")
                .select("owner_flags")
                .eq("id", prop.propertyId)
                .single();
              const merged = {
                ...((currentProp?.owner_flags as Record<string, unknown>) ?? {}),
                ...flags,
              };
              const { error: updateErr } = await sb
                .from("properties")
                .update({ owner_flags: merged })
                .eq("id", prop.propertyId);

              if (updateErr) {
                console.error(`[BulkBricked:${runId}] DB write failed for ${prop.propertyId}:`, updateErr.message);
              }

              batchOut.push({
                leadId: prop.leadId,
                propertyId: prop.propertyId,
                address: prop.address,
                success: true,
                brickedId: data.id,
                arv: data.arv,
                cmv: data.cmv,
                source,
              });

              // 2-second delay between Bricked API calls
              if (batch.indexOf(prop) < batch.length - 1) {
                await new Promise((r) => setTimeout(r, 2000));
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[BulkBricked:${runId}] Error for ${prop.address}:`, msg);
              batchOut.push({
                leadId: prop.leadId,
                propertyId: prop.propertyId,
                address: prop.address,
                success: false,
                error: msg,
                source: "error",
              });
            }
          }

          return batchOut;
        },
      );

      for (const r of batchResults) {
        results.push(r);
        if (r.success) successCount++;
        else errorCount++;
      }

      console.log(
        `[BulkBricked:${runId}] Batch ${batchNum}/${totalBatches} — ` +
        `${successCount} success, ${errorCount} errors so far`,
      );
    }

    const summary = {
      runId,
      total: properties.length,
      success: successCount,
      errors: errorCount,
      results: results.map((r) => ({
        leadId: r.leadId,
        address: r.address,
        success: r.success,
        brickedId: r.brickedId,
        arv: r.arv,
        source: r.source,
        error: r.error,
      })),
    };

    console.log(
      `[BulkBricked:${runId}] COMPLETE — ${successCount}/${properties.length} success`,
    );

    return summary;
  },
);
