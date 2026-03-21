import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/dnc?phone=+15551234567
 * Check if a phone number is on the DNC list.
 *
 * POST /api/dnc
 * Add phone number(s) to the DNC list.
 * Body: { phones: string[], reason?, source? } or { phone: string, reason?, source? }
 *
 * DELETE /api/dnc
 * Remove a phone number from the DNC list.
 * Body: { phone: string }
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");

  if (!phone) {
    // List recent DNC entries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("dnc_list") as any)
      .select("*")
      .order("added_at", { ascending: false })
      .limit(100);

    return NextResponse.json({ entries: data ?? [], total: data?.length ?? 0 });
  }

  // Check specific phone
  const normalized = phone.replace(/\D/g, "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("dnc_list") as any)
    .select("*")
    .or(`phone.eq.${phone},phone.eq.+${normalized},phone.eq.${normalized}`)
    .limit(1);

  const isDnc = data && data.length > 0;

  // Also check contacts table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contactDnc } = await (sb.from("contacts") as any)
    .select("id, dnc_status, litigant_flag")
    .or(`phone.eq.${phone},phone.eq.+${normalized},phone.eq.${normalized}`)
    .eq("dnc_status", true)
    .limit(1);

  const isContactDnc = contactDnc && contactDnc.length > 0;
  const isLitigator = contactDnc?.[0]?.litigant_flag === true;

  return NextResponse.json({
    phone,
    isDnc: isDnc || isContactDnc,
    isLitigator,
    dncEntry: data?.[0] ?? null,
    source: isDnc ? "dnc_list" : isContactDnc ? "contacts" : null,
  });
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const phones: string[] = body.phones ?? (body.phone ? [body.phone] : []);
  const reason = body.reason ?? "manual";
  const source = body.source ?? "manual";

  if (phones.length === 0) {
    return NextResponse.json({ error: "phone or phones[] required" }, { status: 400 });
  }

  if (phones.length > 500) {
    return NextResponse.json({ error: "Max 500 numbers per request" }, { status: 400 });
  }

  const entries = phones.map((p) => ({
    phone: p.startsWith("+") ? p : `+${p.replace(/\D/g, "")}`,
    reason,
    source,
    added_by: user.id,
  }));

  // Upsert to handle duplicates gracefully
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (sb.from("dnc_list") as any)
    .upsert(entries, { onConflict: "phone", ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also flag matching contacts — compliance-critical
  const normalizedPhones = entries.map((e) => e.phone);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: contactErr } = await (sb.from("contacts") as any)
    .update({ dnc_status: true, updated_at: new Date().toISOString() })
    .in("phone", normalizedPhones);
  if (contactErr) {
    console.error("[dnc] COMPLIANCE: Contact DNC flag update failed:", contactErr.message);
    return NextResponse.json(
      { error: "DNC list updated but contact flag sync failed — compliance risk", detail: contactErr.message },
      { status: 500 },
    );
  }

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: logErr } = await (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "dnc.added",
    entity_type: "dnc",
    details: { count: phones.length, reason, source },
  });
  if (logErr) console.error("[dnc] Audit log failed:", logErr.message);

  return NextResponse.json({ added: count ?? phones.length, reason, source });
}

export async function DELETE(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { phone } = body as { phone: string };

  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const normalized = phone.startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("dnc_list") as any)
    .delete()
    .eq("phone", normalized);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also clear contact flag — compliance-critical
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: contactErr } = await (sb.from("contacts") as any)
    .update({ dnc_status: false, updated_at: new Date().toISOString() })
    .eq("phone", normalized);
  if (contactErr) {
    console.error("[dnc] COMPLIANCE: Contact DNC flag clear failed:", contactErr.message);
    return NextResponse.json(
      { error: "DNC entry removed but contact flag sync failed — compliance risk", detail: contactErr.message },
      { status: 500 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delLogErr } = await (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "dnc.removed",
    entity_type: "dnc",
    details: { phone: normalized },
  });
  if (delLogErr) console.error("[dnc] Audit log failed:", delLogErr.message);

  return NextResponse.json({ removed: normalized });
}
