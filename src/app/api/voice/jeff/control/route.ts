export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getJeffControlSettings, getUserProfile, isJeffController, updateJeffControlSettings } from "@/lib/jeff-control";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getUserProfile(user.id);
  const settings = await getJeffControlSettings();
  return NextResponse.json({
    settings,
    canControl: isJeffController(profile?.email),
    profile: profile ? { email: profile.email, role: profile.role, fullName: profile.full_name ?? null } : null,
  });
}

export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getUserProfile(user.id);
  if (!isJeffController(profile?.email)) {
    return NextResponse.json({ error: "Only Adam can change Jeff controls." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const settings = await updateJeffControlSettings({
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    mode: body.mode === "manual_only" || body.mode === "hybrid_auto_redial" ? body.mode : undefined,
    softPaused: typeof body.softPaused === "boolean" ? body.softPaused : undefined,
    emergencyHalt: typeof body.emergencyHalt === "boolean" ? body.emergencyHalt : undefined,
    dailyMaxCalls: typeof body.dailyMaxCalls === "number" ? body.dailyMaxCalls : undefined,
    perRunMaxCalls: typeof body.perRunMaxCalls === "number" ? body.perRunMaxCalls : undefined,
    businessHoursOnly: typeof body.businessHoursOnly === "boolean" ? body.businessHoursOnly : undefined,
    allowedStartHour: typeof body.allowedStartHour === "number" ? body.allowedStartHour : undefined,
    allowedEndHour: typeof body.allowedEndHour === "number" ? body.allowedEndHour : undefined,
    qualityReviewEnabled: typeof body.qualityReviewEnabled === "boolean" ? body.qualityReviewEnabled : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  }, user.id);

  return NextResponse.json({ settings });
}
