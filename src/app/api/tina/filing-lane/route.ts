import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { createDefaultTinaProfile } from "@/tina/lib/workspace-draft";

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const profile =
    typeof body === "object" &&
    body !== null &&
    "profile" in body &&
    typeof body.profile === "object" &&
    body.profile !== null
      ? { ...createDefaultTinaProfile(), ...(body.profile as Record<string, unknown>) }
      : createDefaultTinaProfile();

  const recommendation = recommendTinaFilingLane(profile);

  return NextResponse.json({
    recommendation,
    reviewedBy: user.id,
  });
}
