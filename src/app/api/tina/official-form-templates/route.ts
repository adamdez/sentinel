import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  buildTinaOfficialFederalFormTemplateSnapshot,
  getTinaOfficialFederalFormTemplate,
} from "@/tina/lib/official-form-templates";
import { readTinaOfficialFederalFormTemplateAsset } from "@/tina/lib/official-form-templates-server";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import { refreshTinaWorkflowState } from "@/tina/lib/workflow-state";
import type { TinaOfficialFederalFormId } from "@/tina/types";

const TINA_PREFERENCES_KEY = "tina_workspace_v1";

function isOfficialFormId(value: string): value is TinaOfficialFederalFormId {
  return ["f1040", "f1040sc", "f1040sse", "f1065", "f1120s", "f1120", "f8829", "f4562"].includes(
    value
  );
}

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("user_profiles") as any)
    .select("preferences")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load Tina official federal form templates" },
      { status: 500 }
    );
  }

  const preferences = (data?.preferences as Record<string, unknown> | null) ?? {};
  const rawDraft = preferences[TINA_PREFERENCES_KEY];
  const draft = refreshTinaWorkflowState(
    parseTinaWorkspaceDraft(rawDraft ? JSON.stringify(rawDraft) : null)
  );
  const snapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const url = new URL(req.url);
  const formId = url.searchParams.get("formId");
  const download = url.searchParams.get("download");

  if (download === "1" && formId && isOfficialFormId(formId)) {
    const template = getTinaOfficialFederalFormTemplate(formId, snapshot.taxYear);
    const bytes = readTinaOfficialFederalFormTemplateAsset(formId, snapshot.taxYear);

    if (!template || !bytes) {
      return NextResponse.json({ error: "Stored official blank form not found" }, { status: 404 });
    }

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${template.fileName}"`,
        "X-Tina-Official-Form-Id": template.id,
      },
    });
  }

  return NextResponse.json({
    officialFormTemplates: snapshot,
  });
}
