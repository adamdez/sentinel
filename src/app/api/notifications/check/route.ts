import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/check?since=ISO8601
 *
 * Returns new SMS messages and new webform leads since the given timestamp.
 * Lightweight polling endpoint for global notification banners.
 */
export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = req.nextUrl.searchParams.get("since");
  if (!since) {
    return NextResponse.json({ error: "since parameter required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // New inbound SMS since timestamp
  const { data: newSms } = await sb
    .from("sms_messages")
    .select("id, phone, body, created_at, lead_id")
    .eq("direction", "inbound")
    .gt("created_at", since)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  // Enrich SMS with lead names
  const smsItems = [];
  for (const msg of newSms ?? []) {
    let name: string | null = null;
    if (msg.lead_id) {
      const { data: lead } = await sb
        .from("leads")
        .select("property_id")
        .eq("id", msg.lead_id as string)
        .maybeSingle();
      if (lead?.property_id) {
        const { data: prop } = await sb
          .from("properties")
          .select("owner_name")
          .eq("id", lead.property_id as string)
          .maybeSingle();
        name = (prop?.owner_name as string) ?? null;
      }
    }
    if (!name) {
      const digits = (msg.phone as string).replace(/\D/g, "").slice(-10);
      if (digits.length >= 7) {
        const { data: prop } = await sb
          .from("properties")
          .select("owner_name")
          .ilike("owner_phone", `%${digits}`)
          .limit(1)
          .maybeSingle();
        name = (prop?.owner_name as string) ?? null;
      }
    }
    const phone = msg.phone as string;
    const d = phone.replace(/\D/g, "").slice(-10);
    const formatted = d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : phone;

    smsItems.push({
      id: msg.id,
      type: "sms" as const,
      phone: msg.phone,
      phoneFormatted: formatted,
      name,
      preview: ((msg.body as string) ?? "").slice(0, 80),
      createdAt: msg.created_at,
    });
  }

  // New webform leads since timestamp
  const { data: newLeads } = await sb
    .from("leads")
    .select("id, source, created_at, property_id")
    .eq("source", "webform")
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);

  const leadItems = [];
  for (const lead of newLeads ?? []) {
    let name: string | null = null;
    let address: string | null = null;
    if (lead.property_id) {
      const { data: prop } = await sb
        .from("properties")
        .select("owner_name, address")
        .eq("id", lead.property_id as string)
        .maybeSingle();
      name = (prop?.owner_name as string) ?? null;
      address = (prop?.address as string) ?? null;
    }
    leadItems.push({
      id: lead.id,
      type: "lead" as const,
      name,
      address,
      createdAt: lead.created_at,
    });
  }

  return NextResponse.json({
    sms: smsItems,
    leads: leadItems,
  });
}
