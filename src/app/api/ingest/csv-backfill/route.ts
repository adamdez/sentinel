/**
 * CSV Backfill — Bulk-fill owner_name, address, mailing_address from a CSV
 * that has APN as the matching key.
 *
 * POST /api/ingest/csv-backfill
 * Body: { rows: Array<{ apn, owner, address, city, state, zip, mailAddress, mailCity, mailState, mailZip }> }
 * Query: ?dry=true for preview
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization header.
 *
 * For each CSV row:
 *   1. Find property by APN
 *   2. If owner_name is Unknown/null → fill from CSV
 *   3. If address is Unknown/null → fill from CSV
 *   4. If mailing_address missing in owner_flags → fill from CSV
 *   5. Track what was filled for audit
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const maxDuration = 300;

interface BackfillRow {
  apn: string;
  owner: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  mailAddress: string;
  mailCity: string;
  mailState: string;
  mailZip: string;
}

interface BackfillResult {
  apn: string;
  propertyId: string;
  filled: string[];
}

export async function POST(req: NextRequest) {
  // Auth check
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  if (
    secret &&
    authHeader !== `Bearer ${secret}` &&
    cronHeader !== secret
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await req.json()) as { rows: BackfillRow[] };
  const rows = body.rows ?? [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }

  console.log(`[CsvBackfill] Processing ${rows.length} rows (dry=${dry})`);

  const sb = createServerClient();
  const results: BackfillResult[] = [];
  let matched = 0;
  let notFound = 0;
  let alreadyComplete = 0;
  const notFoundApns: string[] = [];

  // Process in batches of 50 APNs to avoid URL length limits
  const BATCH_SIZE = 50;
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
    const apns = batch.map((r) => r.apn.trim()).filter(Boolean);

    if (apns.length === 0) continue;

    // Fetch properties by APN
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: props } = await (sb.from("properties") as any)
      .select("id, apn, owner_name, address, owner_flags")
      .in("apn", apns);

    if (!props || props.length === 0) {
      for (const apn of apns) notFoundApns.push(apn);
      notFound += apns.length;
      continue;
    }

    // Build APN → property map (some APNs may have multiple properties)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apnMap = new Map<string, any[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of props as any[]) {
      const existing = apnMap.get(p.apn) ?? [];
      existing.push(p);
      apnMap.set(p.apn, existing);
    }

    // Build CSV row lookup by APN
    const csvMap = new Map<string, BackfillRow>();
    for (const row of batch) {
      csvMap.set(row.apn.trim(), row);
    }

    // Match and fill
    for (const [apn, properties] of apnMap) {
      const csvRow = csvMap.get(apn);
      if (!csvRow) continue;

      for (const prop of properties) {
        const filled: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: Record<string, any> = {};
        const flags = (prop.owner_flags ?? {}) as Record<string, unknown>;
        const newFlags = { ...flags };

        // 1. Owner name gap-fill
        const currentOwner = (prop.owner_name ?? "").trim();
        const isUnknownOwner =
          !currentOwner ||
          currentOwner === "Unknown" ||
          currentOwner === "Unknown Owner" ||
          currentOwner === "N/A";
        if (isUnknownOwner && csvRow.owner) {
          update.owner_name = csvRow.owner;
          newFlags.owner_resolution_method = "csv_backfill";
          filled.push("owner_name");
        }

        // 2. Address gap-fill
        const currentAddr = (prop.address ?? "").trim();
        const isUnknownAddr =
          !currentAddr ||
          currentAddr === "Unknown" ||
          currentAddr.startsWith("Unknown,") ||
          !(/^\d/.test(currentAddr));
        if (isUnknownAddr && csvRow.address && csvRow.address !== "Unknown" && /^\d/.test(csvRow.address)) {
          const fullAddr = [csvRow.address, csvRow.city, csvRow.state, csvRow.zip]
            .filter(Boolean)
            .join(", ");
          update.address = fullAddr;
          if (csvRow.city) update.city = csvRow.city;
          if (csvRow.state) update.state = csvRow.state;
          if (csvRow.zip) update.zip = csvRow.zip;
          newFlags.address_resolution_method = "csv_backfill";
          filled.push("address");
        }

        // 3. Mailing address gap-fill
        const existingMail = flags.mailing_address;
        if (!existingMail && csvRow.mailAddress) {
          newFlags.mailing_address = {
            address: csvRow.mailAddress,
            city: csvRow.mailCity ?? "",
            state: csvRow.mailState ?? "",
            zip: csvRow.mailZip ?? "",
          };
          filled.push("mailing_address");
        }

        if (filled.length === 0) {
          alreadyComplete++;
          continue;
        }

        matched++;
        update.owner_flags = newFlags;
        update.updated_at = new Date().toISOString();

        if (!dry) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("properties") as any)
            .update(update)
            .eq("id", prop.id);
        }

        results.push({
          apn,
          propertyId: prop.id,
          filled,
        });
      }
    }

    // Track not-found APNs
    for (const apn of apns) {
      if (!apnMap.has(apn)) {
        notFoundApns.push(apn);
        notFound++;
      }
    }
  }

  // Summarize what was filled
  const fillSummary: Record<string, number> = {};
  for (const r of results) {
    for (const f of r.filled) {
      fillSummary[f] = (fillSummary[f] ?? 0) + 1;
    }
  }

  console.log(
    `[CsvBackfill] Done: ${matched} filled, ${alreadyComplete} already complete, ${notFound} not found in DB (dry=${dry})`
  );

  return NextResponse.json({
    dry,
    totalRows: rows.length,
    matched,
    alreadyComplete,
    notFound,
    fillSummary,
    results: results.slice(0, 100), // cap output
    notFoundApnsSample: notFoundApns.slice(0, 20),
  });
}
