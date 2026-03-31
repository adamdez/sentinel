import { normalizeInboundCandidate } from "@/lib/inbound-intake";
import { isVendorPayloadRecord, readVendorString, unwrapVendorPayload } from "@/lib/inbound-vendor-payload";

export function buildNormalizedVendorCandidate(rawBody: unknown, defaults?: {
  sourceChannel?: string;
  sourceVendor?: string;
  intakeMethod?: string;
}) {
  const body = unwrapVendorPayload(rawBody);

  return normalizeInboundCandidate({
    sourceChannel: readVendorString(body, "source_channel") ?? defaults?.sourceChannel ?? "vendor_inbound",
    sourceVendor: readVendorString(body, "source_vendor") ?? defaults?.sourceVendor ?? "vendor",
    sourceCampaign: readVendorString(body, "source_campaign") ?? readVendorString(body, "campaign"),
    intakeMethod: readVendorString(body, "intake_method") ?? defaults?.intakeMethod ?? "vendor_post",
    rawSourceRef: readVendorString(body, "raw_source_ref") ?? readVendorString(body, "lead_id") ?? readVendorString(body, "reference_id"),
    ownerName: readVendorString(body, "owner_name") ?? readVendorString(body, "name") ?? readVendorString(body, "full_name"),
    phone: readVendorString(body, "phone") ?? readVendorString(body, "contact_phone") ?? readVendorString(body, "phone_number"),
    email: readVendorString(body, "email") ?? readVendorString(body, "contact_email"),
    propertyAddress: readVendorString(body, "property_address") ?? readVendorString(body, "address") ?? readVendorString(body, "property"),
    propertyCity: readVendorString(body, "city"),
    propertyState: readVendorString(body, "state"),
    propertyZip: readVendorString(body, "zip") ?? readVendorString(body, "postal_code"),
    county: readVendorString(body, "county"),
    apn: readVendorString(body, "apn") ?? readVendorString(body, "parcel_number"),
    notes: readVendorString(body, "notes") ?? readVendorString(body, "message") ?? readVendorString(body, "description"),
    rawText: readVendorString(body, "message") ?? readVendorString(body, "description"),
    rawPayload: isVendorPayloadRecord(rawBody) ? rawBody : null,
    receivedAt: readVendorString(body, "received_at"),
  });
}
