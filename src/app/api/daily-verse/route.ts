import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const sb = createServerClient();
  const today = new Date().toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("daily_devotional") as any)
    .select("*")
    .eq("display_date", today)
    .maybeSingle();

  if (error) {
    console.error("[DailyVerse] Read error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ devotional: null });
  }

  return NextResponse.json({
    devotional: {
      verseRef: data.verse_ref,
      verseText: data.verse_text,
      author: data.author,
      commentary: data.commentary,
      sourceUrl: data.source_url,
      sourceTitle: data.source_title,
    },
  });
}
