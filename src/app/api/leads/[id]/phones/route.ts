import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(-10);
}

function formatLeadPhoneValue(digits: string): string {
  return `+1${digits}`;
}

function buildLegacyFallbackPhones(input: {
  ownerPhone: string | null;
  ownerFlags: Record<string, unknown> | null;
}): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];

  const pushPhone = (raw: string | null | undefined, source: string, preferred = false) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const digits = normalizePhoneDigits(raw);
    if (digits.length !== 10 || seen.has(digits)) return;
    seen.add(digits);
    rows.push({
      id: `legacy-${digits}`,
      phone: `+1${digits}`,
      label: "unknown",
      source,
      status: "active",
      dead_reason: null,
      is_primary: preferred,
      position: rows.length,
      last_called_at: null,
      call_count: 0,
    });
  };

  const ownerFlags = input.ownerFlags ?? {};
  const allPhones = Array.isArray(ownerFlags.all_phones) ? ownerFlags.all_phones : [];
  const manualPhones = Array.isArray(ownerFlags.manual_phones) ? ownerFlags.manual_phones : [];

  pushPhone(input.ownerPhone, "property_owner_phone", true);

  for (const entry of allPhones) {
    if (typeof entry === "string") {
      pushPhone(entry, "owner_flags_all_phones");
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      pushPhone(
        typeof record.number === "string"
          ? record.number
          : typeof record.phone === "string"
            ? record.phone
            : null,
        "owner_flags_all_phones",
      );
    }
  }

  for (const entry of manualPhones) {
    pushPhone(typeof entry === "string" ? entry : null, "owner_flags_manual_phones");
  }

  if (!rows.some((row) => row.is_primary === true) && rows[0]) {
    rows[0].is_primary = true;
  }

  return rows;
}

/**
 * GET /api/leads/[id]/phones
 *
 * Returns all phone numbers for a lead from the lead_phones table,
 * ordered by position. Includes status tracking and next-phone logic
 * for dialer phone cycling.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: leadId } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: phones, error } = await (sb.from("lead_phones") as any)
      .select("*")
      .eq("lead_id", leadId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/leads/[id]/phones] query error:", error);
      return NextResponse.json({ error: "Failed to fetch phones" }, { status: 500 });
    }

    let rows = (phones ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      // Fallback for older leads where phone results were stored in owner_flags
      // but not yet promoted into the canonical lead_phones table.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadRow } = await (sb.from("leads") as any)
        .select("property_id")
        .eq("id", leadId)
        .single();

      const propertyId = leadRow?.property_id as string | undefined;
      if (propertyId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: propertyRow } = await (sb.from("properties") as any)
          .select("owner_phone, owner_flags")
          .eq("id", propertyId)
          .single();

        rows = buildLegacyFallbackPhones({
          ownerPhone: (propertyRow?.owner_phone as string | null | undefined) ?? null,
          ownerFlags: (propertyRow?.owner_flags as Record<string, unknown> | null | undefined) ?? null,
        });
      }
    }
    const activePhones = rows.filter((p) => p.status === "active");
    const deadPhones = rows.filter((p) => p.status !== "active");

    // next_phone: lowest-position active phone that hasn't been called, or the one called longest ago
    let nextPhone: Record<string, unknown> | null = null;
    const uncalled = activePhones.filter((p) => !p.last_called_at);
    if (uncalled.length > 0) {
      nextPhone = uncalled[0];
    } else if (activePhones.length > 0) {
      nextPhone = activePhones.reduce((oldest, p) =>
        !oldest || (p.last_called_at && (!oldest.last_called_at || (p.last_called_at as string) < (oldest.last_called_at as string)))
          ? p
          : oldest
      , null as Record<string, unknown> | null);
    }

    return NextResponse.json({
      phones: rows,
      active_count: activePhones.length,
      dead_count: deadPhones.length,
      next_phone: nextPhone,
    });
  } catch (err) {
    console.error("[GET /api/leads/[id]/phones] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/leads/[id]/phones
 *
 * Adds a new canonical lead_phones row for a lead. Optionally promotes the new
 * number to primary and syncs properties.owner_phone for legacy readers.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: leadId } = await params;
    const body = await req.json().catch(() => ({}));
    const { phone, label, make_primary } = body as {
      phone?: string;
      label?: "mobile" | "landline" | "voip" | "unknown";
      make_primary?: boolean;
    };

    const digits = normalizePhoneDigits(phone ?? "");
    if (digits.length !== 10) {
      return NextResponse.json({ error: "Phone must be a valid 10-digit US number" }, { status: 400 });
    }

    const normalizedLabel = ["mobile", "landline", "voip", "unknown"].includes(label ?? "")
      ? (label as "mobile" | "landline" | "voip" | "unknown")
      : "unknown";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadRow, error: leadErr } = await (sb.from("leads") as any)
      .select("id, property_id")
      .eq("id", leadId)
      .single();

    if (leadErr || !leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRows, error: existingErr } = await (sb.from("lead_phones") as any)
      .select("id, phone, position, is_primary, status")
      .eq("lead_id", leadId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (existingErr) {
      console.error("[POST /api/leads/[id]/phones] existing rows query error:", existingErr);
      return NextResponse.json({ error: "Failed to inspect existing phones" }, { status: 500 });
    }

    const rows = (existingRows ?? []) as Array<Record<string, unknown>>;
    const duplicate = rows.some((row) => normalizePhoneDigits(String(row.phone ?? "")) === digits);
    if (duplicate) {
      return NextResponse.json({ error: "Phone already exists on this lead" }, { status: 409 });
    }

    const nextPosition = Math.max(
      -1,
      ...rows.map((row) => typeof row.position === "number" ? row.position : -1),
    ) + 1;

    const hasActivePrimary = rows.some((row) => row.status === "active" && row.is_primary === true);
    const shouldMakePrimary = make_primary === true || !hasActivePrimary;
    const formattedPhone = formatLeadPhoneValue(digits);

    if (shouldMakePrimary) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("lead_phones") as any)
        .update({ is_primary: false })
        .eq("lead_id", leadId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insertedPhone, error: insertErr } = await (sb.from("lead_phones") as any)
      .insert({
        lead_id: leadId,
        property_id: leadRow.property_id,
        phone: formattedPhone,
        label: normalizedLabel,
        source: "manual_entry",
        status: "active",
        dead_reason: null,
        is_primary: shouldMakePrimary,
        position: nextPosition,
      })
      .select("id, phone, is_primary")
      .single();

    if (insertErr) {
      console.error("[POST /api/leads/[id]/phones] insert error:", insertErr);
      return NextResponse.json({ error: "Failed to add phone" }, { status: 500 });
    }

    if (shouldMakePrimary && leadRow.property_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("properties") as any)
        .update({ owner_phone: formattedPhone })
        .eq("id", leadRow.property_id);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: "phone.added",
      entity_type: "lead_phone",
      entity_id: insertedPhone?.id ?? `${leadId}:${formattedPhone}`,
      details: {
        lead_id: leadId,
        property_id: leadRow.property_id ?? null,
        phone: formattedPhone,
        label: normalizedLabel,
        source: "manual_entry",
        marked_primary: shouldMakePrimary,
      },
    });

    return NextResponse.json({
      success: true,
      phone: insertedPhone ?? { phone: formattedPhone, is_primary: shouldMakePrimary },
    });
  } catch (err) {
    console.error("[POST /api/leads/[id]/phones] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
