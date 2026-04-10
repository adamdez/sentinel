import type { LeadPhone } from "@/lib/dialer/types";
import {
  buildAddress,
  type ClientFile,
} from "@/components/sentinel/master-client-file-helpers";

type PropertyRecord = Record<string, unknown> | null;

type ClientFilePropertyFallback = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  apn?: string | null;
  propertyType?: string | null;
  notes?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  lotSize?: number | null;
  ownerFlags?: Record<string, unknown> | null;
};

function toClientFileString(value: string | null | undefined): string | undefined {
  return value == null ? undefined : value;
}

function readString(record: PropertyRecord, key: string): string | null | undefined {
  if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  return typeof value === "string" ? value : value == null ? null : undefined;
}

function readNumber(record: PropertyRecord, key: string): number | null | undefined {
  if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  return typeof value === "number" ? value : value == null ? null : undefined;
}

function readObject(record: PropertyRecord, key: string): Record<string, unknown> | null | undefined {
  if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return value == null ? null : undefined;
  return value as Record<string, unknown>;
}

export function getCanonicalLeadPhone(leadPhones: LeadPhone[]): LeadPhone | null {
  const activePhones = leadPhones.filter((phone) => phone.status === "active");
  return activePhones.find((phone) => phone.is_primary) ?? activePhones[0] ?? null;
}

export function mergeClientFileState(
  base: ClientFile | null,
  patch: Partial<ClientFile> | null,
  ownerFlagsOverride: Record<string, unknown> | null,
  leadPhones: LeadPhone[],
): ClientFile | null {
  if (!base) return null;
  if (!patch && !ownerFlagsOverride && leadPhones.length === 0) return base;

  const merged = {
    ...base,
    ...(patch ?? {}),
  };
  const canonicalPhone = getCanonicalLeadPhone(leadPhones)?.phone ?? merged.ownerPhone ?? base.ownerPhone ?? null;
  const fullAddress = buildAddress(merged.address, merged.city, merged.state, merged.zip);

  return {
    ...merged,
    ownerFlags: ownerFlagsOverride ?? patch?.ownerFlags ?? base.ownerFlags,
    ownerPhone: canonicalPhone,
    fullAddress: fullAddress || merged.fullAddress,
  };
}

export function buildClientFilePatchFromPropertyRecord({
  property,
  fallback = {},
}: {
  property: PropertyRecord;
  fallback?: ClientFilePropertyFallback;
}): Partial<ClientFile> {
  const patch: Partial<ClientFile> = {};

  const address = readString(property, "address") ?? fallback.address;
  const city = readString(property, "city") ?? fallback.city;
  const state = readString(property, "state") ?? fallback.state;
  const zip = readString(property, "zip") ?? fallback.zip;
  const fullAddress = buildAddress(address, city, state, zip);

  const nextAddress = toClientFileString(address);
  const nextCity = toClientFileString(city);
  const nextState = toClientFileString(state);
  const nextZip = toClientFileString(zip);

  if (nextAddress !== undefined) patch.address = nextAddress;
  if (nextCity !== undefined) patch.city = nextCity;
  if (nextState !== undefined) patch.state = nextState;
  if (nextZip !== undefined) patch.zip = nextZip;
  if (fullAddress) patch.fullAddress = fullAddress;

  const ownerName = readString(property, "owner_name") ?? fallback.ownerName;
  const ownerPhone = readString(property, "owner_phone") ?? fallback.ownerPhone;
  const ownerEmail = readString(property, "owner_email") ?? fallback.ownerEmail;
  const apn = readString(property, "apn") ?? fallback.apn;
  const propertyType = readString(property, "property_type") ?? fallback.propertyType;
  const notes = readString(property, "notes") ?? fallback.notes;
  const bedrooms = readNumber(property, "bedrooms") ?? fallback.bedrooms;
  const bathrooms = readNumber(property, "bathrooms") ?? fallback.bathrooms;
  const sqft = readNumber(property, "sqft") ?? fallback.sqft;
  const yearBuilt = readNumber(property, "year_built") ?? fallback.yearBuilt;
  const lotSize = readNumber(property, "lot_size") ?? fallback.lotSize;
  const ownerFlags = readObject(property, "owner_flags") ?? fallback.ownerFlags;

  const nextOwnerName = toClientFileString(ownerName);
  const nextApn = toClientFileString(apn);

  if (nextOwnerName !== undefined) patch.ownerName = nextOwnerName;
  if (ownerPhone !== undefined) patch.ownerPhone = ownerPhone;
  if (ownerEmail !== undefined) patch.ownerEmail = ownerEmail;
  if (nextApn !== undefined) patch.apn = nextApn;
  if (propertyType !== undefined) patch.propertyType = propertyType;
  if (notes !== undefined) patch.notes = notes;
  if (bedrooms !== undefined) patch.bedrooms = bedrooms;
  if (bathrooms !== undefined) patch.bathrooms = bathrooms;
  if (sqft !== undefined) patch.sqft = sqft;
  if (yearBuilt !== undefined) patch.yearBuilt = yearBuilt;
  if (lotSize !== undefined) patch.lotSize = lotSize;
  if (ownerFlags !== undefined) patch.ownerFlags = ownerFlags ?? {};

  return patch;
}
