import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { attachSmsThreadToLead } from "@/lib/sms/lead-resolution";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phone } = await params;
  const decodedPhone = decodeURIComponent(phone);
  const body = await req.json().catch(() => ({}));
  const leadId = typeof body?.leadId === "string" ? body.leadId : "";

  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const sb = createDialerClient();
  const attachedLead = await attachSmsThreadToLead(sb, {
    phone: decodedPhone,
    leadId,
    actorUserId: user.id,
    reason: typeof body?.reason === "string" ? body.reason : null,
    addPhoneFact: body?.addPhoneFact !== false,
  });

  if (!attachedLead) {
    return NextResponse.json({ error: "Unable to attach thread" }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    attachedLead: {
      id: attachedLead.leadId,
      name: attachedLead.ownerName ?? decodedPhone,
      score: attachedLead.priority,
      tags: attachedLead.tags,
      status: attachedLead.status ?? "unknown",
      propertyAddress: attachedLead.propertyAddress,
      matchReason: attachedLead.matchReason,
    },
  });
}
