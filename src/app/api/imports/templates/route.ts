import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { loadImportTemplates, requireImportUser, saveImportTemplate } from "@/lib/imports-server";

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireImportUser(req.headers.get("authorization"), sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templates = await loadImportTemplates(sb);
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error("[Import Templates] Failed to load:", error);
    return NextResponse.json({ error: "Failed to load import templates" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireImportUser(req.headers.get("authorization"), sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body?.name || !body?.headerSignature || !body?.mapping) {
      return NextResponse.json({ error: "name, headerSignature, and mapping are required" }, { status: 400 });
    }

    const templateId = typeof body.id === "string" && body.id.length > 0 ? body.id : `import_template_${randomUUID()}`;
    await saveImportTemplate({
      sb,
      templateId,
      userId: user.id,
      name: String(body.name),
      vendorKey: typeof body.vendorKey === "string" ? body.vendorKey : null,
      sheetName: typeof body.sheetName === "string" ? body.sheetName : null,
      headerSignature: String(body.headerSignature),
      mapping: body.mapping as Record<string, string>,
      defaults: (body.defaults && typeof body.defaults === "object") ? body.defaults as Record<string, unknown> : {},
    });

    return NextResponse.json({ success: true, templateId });
  } catch (error) {
    console.error("[Import Templates] Failed to save:", error);
    return NextResponse.json({ error: "Failed to save import template" }, { status: 500 });
  }
}
