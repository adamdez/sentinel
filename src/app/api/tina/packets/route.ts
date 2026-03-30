import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { loadTinaWorkspaceState } from "@/tina/lib/server-packet-store";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { packetVersions } = await loadTinaWorkspaceState(sb, user.id);
    return NextResponse.json({ packetVersions });
  } catch {
    return NextResponse.json({ error: "Failed to load Tina packet versions" }, { status: 500 });
  }
}
