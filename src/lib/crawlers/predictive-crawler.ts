/**
 * Predictive Crawler Framework v2.0
 *
 * Charter v3.1 §1: Chase every legal upstream edge — pre-probates via obituaries,
 * divorce & bankruptcy filings from court dockets, water shut-offs, etc.
 * Charter v3.1 §4: All writes through service role. Compliance sacred.
 * Charter v3.1 §10: Log every crawl to event_log with source and count.
 *
 * Architecture:
 *   1. Each crawler module exports a `crawl()` → CrawledRecord[]
 *   2. Framework normalizes to (apn, county), deduplicates, scores via v1.1 engine
 *   3. Only records with predictive score ≥ 60 are promoted to Sentinel
 *   4. Append-only audit trail for every crawl run
 *
 * Scheduling: Vercel Cron hits /api/ingest/daily-poll → calls runAllCrawlers()
 */

import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { computeScore, getScoreLabel, SCORING_MODEL_VERSION } from "@/lib/scoring";
import type { DistressType } from "@/lib/types";

const PROMOTION_THRESHOLD = 60;

export interface CrawledRecord {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  county: string;
  date: string;
  link: string | null;
  source: string;
  distressType: DistressType;
  caseType?: string;
  rawData: Record<string, unknown>;
}

export interface CrawlerModule {
  id: string;
  name: string;
  crawl: () => Promise<CrawledRecord[]>;
}

export interface CrawlRunResult {
  crawlerId: string;
  crawled: number;
  scored: number;
  promoted: number;
  duplicates: number;
  errors: number;
  elapsed_ms: number;
}

function fingerprint(record: CrawledRecord): string {
  const key = [
    record.source,
    record.name.toLowerCase().trim(),
    record.county.toLowerCase().trim(),
    record.distressType,
    record.date,
  ].join(":");
  return createHash("sha256").update(key).digest("hex");
}

function syntheticApn(record: CrawledRecord): string {
  const slug = [
    record.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    record.county.toLowerCase().replace(/[^a-z0-9]/g, ""),
    record.address?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "noaddr",
  ].join("-");
  return `CRAWL-${createHash("md5").update(slug).digest("hex").slice(0, 12).toUpperCase()}`;
}

function scoreRecord(record: CrawledRecord): number {
  const daysSinceEvent = Math.max(
    0,
    Math.floor((Date.now() - new Date(record.date).getTime()) / 86400000)
  );

  const result = computeScore({
    signals: [
      {
        type: record.distressType,
        severity: 6,
        daysSinceEvent,
      },
    ],
    ownerFlags: {},
    equityPercent: 0,
    compRatio: 0,
    historicalConversionRate: 0.12,
  });

  return result.composite;
}

async function ingestRecord(
  sb: ReturnType<typeof createServerClient>,
  record: CrawledRecord,
  score: number
): Promise<"promoted" | "duplicate" | "error"> {
  const apn = syntheticApn(record);
  const fp = fingerprint(record);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop, error: propErr } = await (sb.from("properties") as any)
    .upsert(
      {
        apn,
        county: record.county,
        address: record.address ?? `${record.name} — ${record.county}`,
        city: record.city ?? "",
        state: record.state ?? "WA",
        zip: "",
        owner_name: record.name,
        owner_flags: {
          crawler_source: record.source,
          crawled_at: new Date().toISOString(),
          case_type: record.caseType ?? null,
          link: record.link ?? null,
          ...record.rawData,
        },
      },
      { onConflict: "apn,county" }
    )
    .select("id")
    .single();

  if (propErr || !prop) {
    console.error(`[Crawler] Property upsert failed for ${record.name}:`, propErr);
    return "error";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: evtErr } = await (sb.from("distress_events") as any).insert({
    property_id: prop.id,
    event_type: record.distressType,
    source: record.source,
    severity: 6,
    fingerprint: fp,
    raw_data: {
      name: record.name,
      date: record.date,
      link: record.link,
      case_type: record.caseType,
      ...record.rawData,
    },
  });

  if (evtErr) {
    if ((evtErr as { code?: string }).code === "23505") return "duplicate";
    console.error(`[Crawler] Distress event insert failed:`, evtErr);
    return "error";
  }

  const label = getScoreLabel(score);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("leads") as any)
    .upsert(
      {
        property_id: prop.id,
        status: "prospect",
        source: record.source,
        priority: score,
        tags: [record.distressType],
        notes: `Auto-crawled ${record.distressType} signal from ${record.source} on ${record.date}`,
      },
      { onConflict: "property_id" }
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_records") as any).insert({
    property_id: prop.id,
    model_version: SCORING_MODEL_VERSION,
    composite_score: score,
    motivation_score: Math.round(score * 0.85),
    deal_score: Math.round(score * 0.75),
    equity_multiplier: 1.0,
    severity_multiplier: 1.25,
    factors: [
      { name: record.distressType, weight: 1, value: score, contribution: score },
      { name: "crawler_predictive", weight: 1, value: 1, contribution: 0 },
    ],
  });

  console.log(`[Crawler] Promoted ${record.name} — ${score} ${label.toUpperCase()} (${record.source})`);
  return "promoted";
}

export async function runCrawler(module: CrawlerModule): Promise<CrawlRunResult> {
  const t0 = Date.now();
  const sb = createServerClient();
  let crawled = 0;
  let scored = 0;
  let promoted = 0;
  let duplicates = 0;
  let errors = 0;

  try {
    const records = await module.crawl();
    crawled = records.length;
    console.log(`[Crawler:${module.id}] Crawled ${crawled} records`);

    for (const record of records) {
      const score = scoreRecord(record);
      scored++;

      if (score < PROMOTION_THRESHOLD) continue;

      const status = await ingestRecord(sb, record, score);
      if (status === "promoted") promoted++;
      else if (status === "duplicate") duplicates++;
      else errors++;
    }
  } catch (err) {
    console.error(`[Crawler:${module.id}] Fatal error:`, err);
    errors++;
  }

  const elapsed_ms = Date.now() - t0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: "00000000-0000-0000-0000-000000000000",
    action: "crawler.run",
    entity_type: "crawler",
    entity_id: module.id,
    details: {
      crawler_name: module.name,
      crawled,
      scored,
      promoted,
      duplicates,
      errors,
      elapsed_ms,
      timestamp: new Date().toISOString(),
    },
  });

  return { crawlerId: module.id, crawled, scored, promoted, duplicates, errors, elapsed_ms };
}

export async function runAllCrawlers(modules: CrawlerModule[]): Promise<CrawlRunResult[]> {
  const results: CrawlRunResult[] = [];

  for (const mod of modules) {
    console.log(`[CrawlerFramework] Running ${mod.name}...`);
    const result = await runCrawler(mod);
    results.push(result);
    console.log(`[CrawlerFramework] ${mod.name} complete:`, result);
  }

  return results;
}
