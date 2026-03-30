import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { buildTinaReviewBundlePackage } from "@/tina/lib/review-bundle-package";
import { reconcileTinaDerivedWorkspace } from "@/tina/lib/reconcile-workspace";
import { loadTinaStoredPacketVersion, persistTinaPacketVersion } from "@/tina/lib/server-packet-store";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

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

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Missing export payload" }, { status: 400 });
  }

  const packetFingerprint =
    typeof (body as { packetFingerprint?: unknown }).packetFingerprint === "string"
      ? (body as { packetFingerprint?: string }).packetFingerprint?.trim() ?? ""
      : "";

  let draft;
  let savedPacket = null;

  if (packetFingerprint) {
    savedPacket = await loadTinaStoredPacketVersion(sb, user.id, packetFingerprint);
    if (!savedPacket) {
      return NextResponse.json({ error: "Saved Tina packet not found." }, { status: 404 });
    }
    draft = savedPacket.draft;
  } else {
    if (!("draft" in body)) {
      return NextResponse.json({ error: "Missing draft payload" }, { status: 400 });
    }

    draft = reconcileTinaDerivedWorkspace(
      parseTinaWorkspaceDraft(JSON.stringify((body as { draft: unknown }).draft))
    );
  }
  if (draft.finalSignoff.status !== "complete") {
    return NextResponse.json(
      { error: "Final signoff check must be built before bundle export." },
      { status: 409 }
    );
  }

  try {
    const exportPacket = savedPacket
      ? savedPacket
      : (await persistTinaPacketVersion(sb, user.id, draft, "review_bundle_package")).packet;
    const bundlePackage = buildTinaReviewBundlePackage(exportPacket.draft, {
      packetReview: exportPacket.review,
    });

    return NextResponse.json(bundlePackage);
  } catch {
    return NextResponse.json({ error: "Failed to save Tina packet version" }, { status: 500 });
  }
}
