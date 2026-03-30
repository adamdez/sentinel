export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getUserProfile, isJeffController, listJeffQueue, updateJeffQueueEntry, upsertJeffQueueEntries } from "@/lib/jeff-control";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const queue = await listJeffQueue();
  return NextResponse.json({ queue });
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getUserProfile(user.id);
  if (!isJeffController(profile?.email)) {
    return NextResponse.json({ error: "Only Adam can change Jeff queue." }, { status: 403 });
  }

  let body: { leadIds?: string[]; queueTier?: "eligible" | "active" | "auto"; selectedPhone?: string | null; notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const leadIds = Array.isArray(body.leadIds) ? body.leadIds.filter(Boolean) : [];
  if (leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds are required" }, { status: 400 });
  }

  const queue = await upsertJeffQueueEntries(leadIds, user.id, {
    queueTier: body.queueTier ?? "active",
    queueStatus: "active",
    selectedPhone: body.selectedPhone ?? null,
    notes: body.notes ?? null,
  });
  return NextResponse.json({ queue });
}

export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getUserProfile(user.id);
  if (!isJeffController(profile?.email)) {
    return NextResponse.json({ error: "Only Adam can change Jeff queue." }, { status: 403 });
  }

  let body: {
    leadId?: string;
    queueTier?: "eligible" | "active" | "auto";
    queueStatus?: "active" | "paused" | "removed";
    selectedPhone?: string | null;
    notes?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  await updateJeffQueueEntry(body.leadId, {
    queueTier: body.queueTier,
    queueStatus: body.queueStatus,
    selectedPhone: body.selectedPhone,
    notes: body.notes,
  });

  const queue = await listJeffQueue();
  return NextResponse.json({ queue });
}
