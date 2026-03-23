import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createArtifact } from "@/lib/intelligence";

const FIRECRAWL_SEARCH = "https://api.firecrawl.dev/v1/search";
const MAX_RESULTS_PER_QUERY = 3;

interface SearchQuery {
  query: string;
  category: string;
}

function buildDeepCrawlQueries(ownerName: string, address: string, city: string, county: string, apn?: string): SearchQuery[] {
  const loc = city || "Spokane";
  const cty = county || "Spokane County";
  return [
    { query: `"${ownerName}" "${loc}" court records`, category: "court" },
    { query: `"${ownerName}" "${cty}" trustee sale OR notice of default`, category: "foreclosure" },
    { query: `"${address}" OR "${apn ?? ""}" "${cty}" assessor`, category: "tax" },
    { query: `"${ownerName}" "${loc}" obituary OR funeral`, category: "obituary" },
    { query: `"${ownerName}" "${loc}" site:facebook.com OR site:linkedin.com`, category: "social" },
    { query: `"${ownerName}" "${loc}" site:x.com OR site:twitter.com`, category: "social_x" },
    { query: `"${ownerName}" "${loc}" news OR arrest OR bankruptcy`, category: "news" },
    { query: `"${address}" "${loc}" code violation OR condemned OR permit`, category: "property_condition" },
  ];
}

async function firecrawlSearch(query: string, apiKey: string): Promise<Array<{ url: string; title: string; markdown: string }>> {
  try {
    const res = await fetch(FIRECRAWL_SEARCH, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: MAX_RESULTS_PER_QUERY, scrapeOptions: { formats: ["markdown"] } }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.data ?? []).map((r: any) => ({
      url: r.url ?? "",
      title: r.title ?? r.url ?? "",
      markdown: (r.markdown ?? "").slice(0, 2000),
    }));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  const sb = createServerClient();

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    return NextResponse.json({ error: "FIRECRAWL_API_KEY not configured" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("id, owner_name, property_id, properties(address, city, county, apn)")
    .eq("id", leadId)
    .single();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const ownerName = lead.owner_name ?? "";
  const prop = lead.properties;
  const address = prop?.address ?? "";
  const city = prop?.city ?? "";
  const county = prop?.county ?? "";
  const apn = prop?.apn ?? "";

  if (!ownerName && !address) {
    return NextResponse.json({ error: "Need owner name or address to crawl" }, { status: 400 });
  }

  const queries = buildDeepCrawlQueries(ownerName, address, city, county, apn);

  const settled = await Promise.allSettled(
    queries.map((q) => firecrawlSearch(q.query, firecrawlKey).then((results) => ({ category: q.category, results }))),
  );

  const categories: Record<string, Array<{ url: string; title: string; excerpt: string }>> = {};
  let artifactCount = 0;

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    const { category, results } = result.value;
    if (!categories[category]) categories[category] = [];

    for (const r of results) {
      categories[category].push({
        url: r.url,
        title: r.title,
        excerpt: r.markdown.slice(0, 500),
      });

      try {
        await createArtifact({
          leadId,
          propertyId: lead.property_id,
          sourceUrl: r.url,
          sourceType: `deep_crawl_${category}`,
          sourceLabel: r.title,
          extractedNotes: r.markdown.slice(0, 4000),
          capturedBy: "deep-crawl-api",
        });
        artifactCount++;
      } catch {
        // Non-fatal — still return the result to the client
      }
    }
  }

  return NextResponse.json({
    leadId,
    categories,
    artifactCount,
    queriesRun: queries.length,
  });
}
