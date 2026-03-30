import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { restoreTinaWorkspaceFromPacketVersion } from "@/tina/lib/server-packet-store";

type RouteProps = {
  params: Promise<{
    fingerprint: string;
  }>;
};

export async function POST(req: NextRequest, { params }: RouteProps) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fingerprint } = await params;

  try {
    const restored = await restoreTinaWorkspaceFromPacketVersion(sb, user.id, fingerprint);

    if (!restored.packet || !restored.draft) {
      return NextResponse.json({ error: "Saved packet not found" }, { status: 404 });
    }

    return NextResponse.json(restored);
  } catch {
    return NextResponse.json({ error: "Failed to restore Tina workspace from packet" }, { status: 500 });
  }
}
