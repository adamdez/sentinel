import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const PR_API_BASE = "https://api.propertyradar.com/v1/properties";

/**
 * POST /api/prospects/skip-trace
 *
 * Pulls owner contact info from PropertyRadar Persons endpoint.
 * Requires the property to have been enriched first (needs radar_id).
 *
 * Body: { property_id: string, lead_id: string }
 *
 * If no radar_id, falls back to re-enriching from the address first.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PROPERTYRADAR_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { property_id, lead_id } = body;

    if (!property_id) {
      return NextResponse.json({ error: "property_id is required" }, { status: 400 });
    }

    const sb = createServerClient();

    // Fetch current property record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propErr } = await (sb.from("properties") as any)
      .select("*")
      .eq("id", property_id)
      .single();

    if (propErr || !property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const radarId = property.owner_flags?.radar_id;

    if (!radarId) {
      return NextResponse.json({
        error: "No PropertyRadar ID — enrich the property first",
        hint: "Save the prospect with an address to auto-enrich, or use Quick Test PropertyRadar",
      }, { status: 422 });
    }

    console.log("[SkipTrace] Fetching Persons for RadarID:", radarId);

    // Call PropertyRadar Persons endpoint
    const personsUrl = `${PR_API_BASE}/${radarId}/persons?Fields=All`;
    const personsRes = await fetch(personsUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!personsRes.ok) {
      console.error("[SkipTrace] Persons API failed:", personsRes.status);
      return NextResponse.json({
        error: `PropertyRadar Persons API returned ${personsRes.status}`,
      }, { status: 502 });
    }

    const personsData = await personsRes.json();
    console.log("[SkipTrace] Persons response:", JSON.stringify(personsData).slice(0, 2000));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persons: any[] = personsData.results ?? personsData ?? [];

    // Extract phone numbers and emails from all persons
    const phones: string[] = [];
    const emails: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const personDetails: any[] = [];

    for (const person of persons) {
      const name = [person.FirstName, person.LastName].filter(Boolean).join(" ") || person.Name || "Unknown";

      // Phones can be in Phone1, Phone2, etc. or in a Phones array
      const personPhones: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const ph = person[`Phone${i}`] ?? person[`phone${i}`];
        if (ph && typeof ph === "string" && ph.length >= 7) {
          personPhones.push(ph);
          if (!phones.includes(ph)) phones.push(ph);
        }
      }
      if (person.Phone && !phones.includes(person.Phone)) {
        personPhones.push(person.Phone);
        phones.push(person.Phone);
      }
      if (Array.isArray(person.Phones)) {
        for (const ph of person.Phones) {
          const num = typeof ph === "string" ? ph : ph?.Number ?? ph?.phone;
          if (num && !phones.includes(num)) {
            personPhones.push(num);
            phones.push(num);
          }
        }
      }

      // Emails
      const personEmails: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const em = person[`Email${i}`] ?? person[`email${i}`];
        if (em && typeof em === "string" && em.includes("@")) {
          personEmails.push(em);
          if (!emails.includes(em)) emails.push(em);
        }
      }
      if (person.Email && !emails.includes(person.Email)) {
        personEmails.push(person.Email);
        emails.push(person.Email);
      }
      if (Array.isArray(person.Emails)) {
        for (const em of person.Emails) {
          const addr = typeof em === "string" ? em : em?.Address ?? em?.email;
          if (addr && !emails.includes(addr)) {
            personEmails.push(addr);
            emails.push(addr);
          }
        }
      }

      personDetails.push({
        name,
        relation: person.Relation ?? person.PersonType ?? "Owner",
        age: person.Age ?? null,
        phones: personPhones,
        emails: personEmails,
        mailing_address: person.MailingAddress ?? person.Address ?? null,
      });
    }

    console.log("[SkipTrace] Found", phones.length, "phones,", emails.length, "emails from", persons.length, "persons");

    // Update the property record with contact info
    const primaryPhone = phones[0] ?? null;
    const primaryEmail = emails[0] ?? null;

    const updatedFlags = {
      ...property.owner_flags,
      skip_traced: true,
      skip_trace_date: new Date().toISOString(),
      persons: personDetails,
      all_phones: phones,
      all_emails: emails,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any)
      .update({
        owner_phone: primaryPhone,
        owner_email: primaryEmail,
        owner_flags: updatedFlags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", property_id);

    // Audit log
    if (lead_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        entity_type: "lead",
        entity_id: lead_id,
        action: "SKIP_TRACED",
        details: {
          radar_id: radarId,
          phones_found: phones.length,
          emails_found: emails.length,
          persons_found: persons.length,
        },
      });
    }

    return NextResponse.json({
      success: true,
      property_id,
      radar_id: radarId,
      phones,
      emails,
      persons: personDetails,
      primary_phone: primaryPhone,
      primary_email: primaryEmail,
    });
  } catch (err) {
    console.error("[SkipTrace] Error:", err);
    return NextResponse.json(
      { error: "Skip trace failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
