import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  fetchCommentary,
  getCommentatorForDay,
} from "@/lib/commentary-scraper";
import versePool from "@/data/verse-pool.json";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── ESV API helper ──────────────────────────────────────────────────

async function fetchEsvText(verseRef: string): Promise<string | null> {
  const apiKey = process.env.ESV_API_KEY;
  if (!apiKey) {
    console.error("[DailyVerse] ESV_API_KEY not configured");
    return null;
  }

  const url = new URL("https://api.esv.org/v3/passage/text/");
  url.searchParams.set("q", verseRef);
  url.searchParams.set("include-headings", "false");
  url.searchParams.set("include-footnotes", "false");
  url.searchParams.set("include-verse-numbers", "false");
  url.searchParams.set("include-short-copyright", "false");
  url.searchParams.set("include-passage-references", "false");

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[DailyVerse] ESV API ${res.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    const passages = data.passages as string[] | undefined;
    if (!passages || passages.length === 0) return null;

    return passages[0].trim();
  } catch (err) {
    console.error("[DailyVerse] ESV fetch error:", err);
    return null;
  }
}

// ── Main cron handler ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();
  const today = new Date().toISOString().split("T")[0];

  // Check if today's devotional already exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("daily_devotional") as any)
    .select("id")
    .eq("display_date", today)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      message: "Today's devotional already exists",
      date: today,
    });
  }

  // Pick today's verse from the pool
  const dayOfYear = getDayOfYear(new Date());
  const verseIdx = dayOfYear % versePool.length;
  const verseRef = versePool[verseIdx];

  console.log(`[DailyVerse] Day ${dayOfYear} → verse #${verseIdx}: ${verseRef}`);

  // 1. Fetch ESV text
  const verseText = await fetchEsvText(verseRef);
  if (!verseText) {
    return NextResponse.json(
      { error: "Failed to fetch ESV text", verseRef },
      { status: 502 },
    );
  }

  // 2. Fetch exact commentary from Bible Hub
  const commentatorIdx = getCommentatorForDay(dayOfYear);
  const commentary = await fetchCommentary(verseRef, commentatorIdx);

  if (!commentary) {
    // Fallback: use Grok to find a sourced quote
    const grokResult = await fetchGrokCommentary(verseRef, verseText);
    if (!grokResult) {
      return NextResponse.json(
        { error: "No commentary found", verseRef },
        { status: 502 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("daily_devotional") as any).insert({
      display_date: today,
      verse_ref: verseRef,
      verse_text: verseText,
      author: grokResult.author,
      commentary: grokResult.commentary,
      source_url: grokResult.sourceUrl,
      source_title: grokResult.sourceTitle,
    });

    if (error) {
      console.error("[DailyVerse] Insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      date: today,
      verseRef,
      author: grokResult.author,
      source: "grok-fallback",
    });
  }

  // Insert into Supabase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("daily_devotional") as any).insert({
    display_date: today,
    verse_ref: verseRef,
    verse_text: verseText,
    author: commentary.author,
    commentary: commentary.commentary,
    source_url: commentary.sourceUrl,
    source_title: commentary.sourceTitle,
  });

  if (error) {
    console.error("[DailyVerse] Insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    date: today,
    verseRef,
    author: commentary.author,
    source: "biblehub",
  });
}

// ── Grok AI fallback for rare cases Bible Hub doesn't cover ─────────

async function fetchGrokCommentary(
  verseRef: string,
  verseText: string,
): Promise<{
  author: string;
  commentary: string;
  sourceUrl: string;
  sourceTitle: string;
} | null> {
  const apiKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;
  if (!apiKey) return null;

  try {
    const { completeGrokChat } = await import("@/lib/grok-client");

    const prompt = [
      "You are a Reformed theology scholar. Provide an EXACT, REAL quote from one of these authors commenting on the following Bible verse.",
      "",
      `Verse: ${verseRef}`,
      `Text: "${verseText}"`,
      "",
      "Allowed authors (pick the one with the most relevant commentary):",
      "- John Calvin (Commentaries, Institutes)",
      "- John Gill (Exposition of the Entire Bible)",
      "- Matthew Henry (Complete Commentary)",
      "- Jonathan Edwards (sermons, treatises)",
      "- J.C. Ryle (Expository Thoughts on the Gospels)",
      "- Martin Luther (lectures, commentaries)",
      "- John Knox (History of the Reformation)",
      "- Thomas Watson (Body of Divinity, sermons)",
      "- John Owen (works on sin, temptation, the Holy Spirit)",
      "- Charles Spurgeon (sermons, Treasury of David)",
      "",
      "Requirements:",
      "- The quote MUST be real and verifiable, not paraphrased or invented",
      "- Length: 3-8 sentences",
      "- Include the exact source: book title, chapter/section if applicable",
      "- Include a URL to read the full text (CCEL.org, Spurgeon.org, or similar)",
      "",
      "Return ONLY valid JSON:",
      '{"author":"Full Name","commentary":"Exact quote here...","sourceTitle":"Book Title, Chapter X","sourceUrl":"https://..."}',
    ].join("\n");

    const result = await completeGrokChat({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      apiKey,
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.author || !parsed.commentary || !parsed.sourceUrl) return null;

    return {
      author: parsed.author,
      commentary: parsed.commentary,
      sourceUrl: parsed.sourceUrl,
      sourceTitle: parsed.sourceTitle ?? `${parsed.author}'s Commentary`,
    };
  } catch (err) {
    console.error("[DailyVerse] Grok fallback error:", err);
    return null;
  }
}

// ── Helper ──────────────────────────────────────────────────────────

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}
