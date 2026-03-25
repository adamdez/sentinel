/**
 * Inngest function: Bulk skip-trace across all leads.
 *
 * Iterates through leads (optionally filtered), runs skip-trace for each,
 * collects a detailed report of successes, failures, and new phones found.
 *
 * Designed for one-off bulk runs with full error monitoring.
 * Concurrency-limited to 1 — only one bulk run at a time.
 */

import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import {
  runSkipTraceIntel,
  type SkipTraceIntelResult,
} from "@/lib/skiptrace-intel";

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface LeadRow {
  id: string;
  name: string;
  property_id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  owner_name: string | null;
}

interface BulkResult {
  leadId: string;
  leadName: string;
  result: SkipTraceIntelResult;
}

export const bulkSkiptraceJob = inngest.createFunction(
  {
    id: "bulk-skiptrace",
    retries: 0,
    concurrency: { limit: 1 },
    triggers: [{ event: "intel/bulk-skiptrace.requested" }],
  },
  async ({ event, step }) => {
    const {
      runId,
      leadIds,
      force,
      dryRun,
      limit: maxLeads,
    } = event.data as {
      runId: string;
      leadIds?: string[]; // optional — if omitted, runs all leads
      force?: boolean; // skip debounce
      dryRun?: boolean; // log only, don't actually skip-trace
      limit?: number; // cap for safety
    };

    const sb = createSupabase();

    // 1. Fetch leads with property data
    const leads = await step.run("fetch-leads", async () => {
      let query = sb
        .from("leads")
        .select(`
          id,
          property_id,
          properties!inner (
            address,
            city,
            state,
            zip,
            owner_name
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

      return (data ?? []).map((row: Record<string, unknown>) => {
        const prop = row.properties as Record<string, unknown> | null;
        const ownerName = (prop?.owner_name as string) || "Unknown";
        return {
          id: row.id as string,
          name: ownerName,
          property_id: row.property_id as string,
          address: (prop?.address as string) || null,
          city: (prop?.city as string) || null,
          state: (prop?.state as string) || null,
          zip: (prop?.zip as string) || null,
          owner_name: ownerName,
        } as LeadRow;
      });
    });

    console.log(`[BulkSkiptrace:${runId}] Found ${leads.length} leads to process${dryRun ? " (DRY RUN)" : ""}`);

    if (dryRun) {
      return {
        runId,
        dryRun: true,
        totalLeads: leads.length,
        leadsWithAddress: leads.filter((l: LeadRow) => l.address).length,
        leadsWithoutAddress: leads.filter((l: LeadRow) => !l.address).length,
        leads: leads.map((l: LeadRow) => ({
          id: l.id,
          name: l.name,
          address: l.address,
          hasAddress: !!l.address,
        })),
      };
    }

    // 2. Process each lead sequentially with delay to respect rate limits
    const results: BulkResult[] = [];
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    let totalNewPhones = 0;
    let totalNewFacts = 0;
    let totalPhonesPromoted = 0;

    // Process in batches of 5 with step.run for checkpointing
    const batchSize = 5;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(leads.length / batchSize);

      const batchResults = await step.run(
        `process-batch-${batchNum}`,
        async () => {
          const batchOut: BulkResult[] = [];

          for (const lead of batch) {
            try {
              console.log(`[BulkSkiptrace:${runId}] Processing lead ${lead.id} (${lead.name}) — ${lead.address || "NO ADDRESS"}`);

              const result = await runSkipTraceIntel({
                leadId: lead.id,
                propertyId: lead.property_id,
                address: lead.address || undefined,
                city: lead.city || undefined,
                state: lead.state || undefined,
                zip: lead.zip || undefined,
                ownerName: lead.owner_name || undefined,
                reason: "bulk",
                force: force ?? false,
              });

              batchOut.push({ leadId: lead.id, leadName: lead.name, result });

              // 2-second delay between calls to respect provider rate limits
              if (batch.indexOf(lead) < batch.length - 1) {
                await new Promise((r) => setTimeout(r, 2000));
              }
            } catch (err) {
              console.error(`[BulkSkiptrace:${runId}] Unexpected error for lead ${lead.id}:`, err);
              batchOut.push({
                leadId: lead.id,
                leadName: lead.name,
                result: {
                  ran: true,
                  reason: "unexpected_error",
                  phonesFound: 0,
                  emailsFound: 0,
                  newFactsCreated: 0,
                  phonesPromoted: 0,
                  providers: [],
                },
              });
            }
          }

          return batchOut;
        },
      );

      for (const r of batchResults) {
        results.push(r);
        if (r.result.ran && r.result.reason === "completed") {
          successCount++;
          totalNewPhones += r.result.phonesFound;
          totalNewFacts += r.result.newFactsCreated;
          totalPhonesPromoted += r.result.phonesPromoted;
        } else if (!r.result.ran) {
          skipCount++;
        } else {
          errorCount++;
        }
      }

      console.log(`[BulkSkiptrace:${runId}] Batch ${batchNum}/${totalBatches} complete — ${successCount} success, ${skipCount} skipped, ${errorCount} errors so far`);
    }

    // 3. Build summary
    const summary = {
      runId,
      totalLeads: leads.length,
      success: successCount,
      skipped: skipCount,
      errors: errorCount,
      totalNewFacts,
      totalPhonesPromoted,
      totalPhonesFromProviders: totalNewPhones,
      details: results.map((r) => ({
        leadId: r.leadId,
        leadName: r.leadName,
        ran: r.result.ran,
        reason: r.result.reason,
        phonesFound: r.result.phonesFound,
        emailsFound: r.result.emailsFound,
        newFacts: r.result.newFactsCreated,
        phonesPromoted: r.result.phonesPromoted,
        providers: r.result.providers,
      })),
    };

    console.log(`[BulkSkiptrace:${runId}] COMPLETE — ${successCount}/${leads.length} success, ${totalPhonesPromoted} phones promoted, ${totalNewFacts} new facts`);

    return summary;
  },
);
