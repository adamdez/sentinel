/**
 * CSV Column Auto-Mapping Utility
 *
 * Charter v3.1 §1: Enable signal ingestion from any data vendor via CSV.
 * Maps common CSV header names to Sentinel's canonical property fields.
 *
 * Usage:
 *   const { mapped, unmapped } = autoMapColumns(csvHeaders);
 *   // mapped = { address: "property_address", apn: "parcel_id", ... }
 *   // unmapped = ["some_unknown_column", ...]
 */

export type SentinelField =
  | "address"
  | "apn"
  | "owner_name"
  | "county"
  | "city"
  | "state"
  | "zip"
  | "estimated_value"
  | "phone"
  | "email"
  | "bedrooms"
  | "bathrooms"
  | "sqft"
  | "year_built"
  | "lot_size"
  | "property_type"
  | "equity_percent"
  | "loan_balance"
  // Per-row distress boolean columns (PropertyRadar CSVs)
  | "deceased_owner"
  | "bankruptcy"
  | "divorce"
  | "foreclosure"
  | "site_vacant"
  | "owner_occupied"
  | "tax_delinquent";

/**
 * Header pattern → Sentinel field mapping.
 * Order matters — first match wins for each Sentinel field.
 * Patterns are tested against lowercased, trimmed headers.
 */
const HEADER_PATTERNS: { field: SentinelField; patterns: RegExp[] }[] = [
  {
    field: "address",
    patterns: [
      /^(property[_ ]?)?address$/,
      /^site[_ ]?address$/,
      /^street[_ ]?address$/,
      /^prop[_ ]?address$/,
      /^street$/,
      /^full[_ ]?address$/,
      /^location$/,
      /^mailing[_ ]?address$/,
    ],
  },
  {
    field: "apn",
    patterns: [
      /^apn$/,
      /^parcel[_ ]?(id|number|num|no)?$/,
      /^assessor[_ ]?parcel/,
      /^tax[_ ]?id$/,
      /^parcel$/,
      /^pin$/,
    ],
  },
  {
    field: "owner_name",
    patterns: [
      /^owner[_ ]?name$/,
      /^owner$/,
      /^property[_ ]?owner$/,
      /^owner[_ ]?full/,
      /^taxpayer/,
      /^(owner[_ ]?)?first[_ ]?name$/,
      /^name$/,
    ],
  },
  {
    field: "county",
    patterns: [/^county[_ ]?(name)?$/, /^fips[_ ]?county/],
  },
  {
    field: "city",
    patterns: [/^city$/, /^(property[_ ]?)?city$/, /^site[_ ]?city$/, /^mailing[_ ]?city$/],
  },
  {
    field: "state",
    patterns: [/^state$/, /^(property[_ ]?)?state$/, /^st$/, /^state[_ ]?code$/],
  },
  {
    field: "zip",
    patterns: [
      /^zip[_ ]?(code)?$/,
      /^postal[_ ]?(code)?$/,
      /^zip[_ ]?5$/,
      /^zipcode$/,
    ],
  },
  {
    field: "estimated_value",
    patterns: [
      /^(estimated[_ ]?)?value$/,
      /^avm$/,
      /^market[_ ]?value$/,
      /^assessed[_ ]?value$/,
      /^property[_ ]?value$/,
      /^price$/,
      /^est[_ ]?value$/,
    ],
  },
  {
    field: "phone",
    patterns: [
      /^phone[_ ]?(number)?$/,
      /^owner[_ ]?phone$/,
      /^contact[_ ]?phone$/,
      /^tel(ephone)?$/,
      /^mobile$/,
      /^cell/,
    ],
  },
  {
    field: "email",
    patterns: [/^e?mail[_ ]?(address)?$/, /^owner[_ ]?email$/, /^contact[_ ]?email$/],
  },
  {
    field: "bedrooms",
    patterns: [/^bed(room)?s?$/, /^br$/, /^num[_ ]?beds$/],
  },
  {
    field: "bathrooms",
    patterns: [/^bath(room)?s?$/, /^ba$/, /^num[_ ]?baths$/],
  },
  {
    field: "sqft",
    patterns: [/^sq[_ ]?ft$/, /^square[_ ]?feet$/, /^living[_ ]?area$/, /^gla$/, /^sqft$/],
  },
  {
    field: "year_built",
    patterns: [/^year[_ ]?built$/, /^yr[_ ]?built$/, /^built$/],
  },
  {
    field: "lot_size",
    patterns: [/^lot[_ ]?size$/, /^lot[_ ]?sq[_ ]?ft$/, /^lot[_ ]?acres?$/, /^land[_ ]?area$/],
  },
  {
    field: "property_type",
    patterns: [
      /^property[_ ]?type$/,
      /^prop[_ ]?type$/,
      /^use[_ ]?code$/,
      /^land[_ ]?use$/,
      /^zoning$/,
    ],
  },
  {
    field: "equity_percent",
    patterns: [/^equity[_ ]?%?$/, /^equity[_ ]?percent$/, /^pct[_ ]?equity$/],
  },
  {
    field: "loan_balance",
    patterns: [
      /^(total[_ ]?)?loan[_ ]?balance$/,
      /^mortgage[_ ]?balance$/,
      /^outstanding[_ ]?balance$/,
      /^mtg[_ ]?bal/,
    ],
  },
  // Per-row distress boolean columns (PropertyRadar CSVs)
  {
    field: "deceased_owner",
    patterns: [/deceased\s*owner/i, /^deceased\??$/i],
  },
  {
    field: "bankruptcy",
    patterns: [/^bankruptcy\??$/i, /^in\s*bankruptcy\??$/i],
  },
  {
    field: "divorce",
    patterns: [/^divorce\??$/i, /^in\s*divorce\??$/i],
  },
  {
    field: "foreclosure",
    patterns: [/^foreclosure\??$/i, /^in\s*foreclosure\??$/i, /^pre[_ ]?foreclosure\??$/i],
  },
  {
    field: "site_vacant",
    patterns: [/site\s*vacant/i, /^vacant\??$/i],
  },
  {
    field: "owner_occupied",
    patterns: [/owner\s*occup/i, /^occupied\??$/i],
  },
  {
    field: "tax_delinquent",
    patterns: [/tax\s*delinq/i, /^delinquent\??$/i, /^tax\s*default\??$/i],
  },
];

export interface ColumnMapping {
  /** Sentinel field name → CSV column header (as found in file) */
  mapped: Partial<Record<SentinelField, string>>;
  /** CSV columns that couldn't be auto-mapped */
  unmapped: string[];
}

/**
 * Auto-map CSV headers to Sentinel fields.
 * Each Sentinel field is mapped at most once (first match wins).
 * Each CSV column is consumed at most once.
 */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapped: Partial<Record<SentinelField, string>> = {};
  const used = new Set<string>();

  for (const { field, patterns } of HEADER_PATTERNS) {
    if (mapped[field]) continue; // already matched

    for (const header of headers) {
      if (used.has(header)) continue;
      const normalized = header.toLowerCase().trim();

      for (const pattern of patterns) {
        if (pattern.test(normalized)) {
          mapped[field] = header;
          used.add(header);
          break;
        }
      }
      if (mapped[field]) break;
    }
  }

  // Handle owner_first + owner_last → owner_name (combo detection)
  if (!mapped.owner_name) {
    const firstName = headers.find(
      (h) => /^(owner[_ ]?)?first[_ ]?name$/i.test(h.trim()) && !used.has(h)
    );
    const lastName = headers.find(
      (h) => /^(owner[_ ]?)?last[_ ]?name$/i.test(h.trim()) && !used.has(h)
    );
    if (firstName && lastName) {
      // Signal combo mapping — the API route handles joining
      mapped.owner_name = `${firstName}+${lastName}`;
      used.add(firstName);
      used.add(lastName);
    }
  }

  const unmapped = headers.filter((h) => !used.has(h));

  return { mapped, unmapped };
}

/** All available Sentinel fields for UI display */
export const ALL_SENTINEL_FIELDS: { field: SentinelField; label: string }[] = [
  { field: "address", label: "Address" },
  { field: "apn", label: "APN / Parcel ID" },
  { field: "owner_name", label: "Owner Name" },
  { field: "county", label: "County" },
  { field: "city", label: "City" },
  { field: "state", label: "State" },
  { field: "zip", label: "Zip Code" },
  { field: "estimated_value", label: "Estimated Value" },
  { field: "phone", label: "Phone" },
  { field: "email", label: "Email" },
  { field: "bedrooms", label: "Bedrooms" },
  { field: "bathrooms", label: "Bathrooms" },
  { field: "sqft", label: "Sq Ft" },
  { field: "year_built", label: "Year Built" },
  { field: "lot_size", label: "Lot Size" },
  { field: "property_type", label: "Property Type" },
  { field: "equity_percent", label: "Equity %" },
  { field: "loan_balance", label: "Loan Balance" },
  // Per-row distress boolean columns (PropertyRadar CSVs)
  { field: "deceased_owner", label: "Deceased Owner?" },
  { field: "bankruptcy", label: "Bankruptcy?" },
  { field: "divorce", label: "Divorce?" },
  { field: "foreclosure", label: "Foreclosure?" },
  { field: "site_vacant", label: "Site Vacant?" },
  { field: "owner_occupied", label: "Owner Occupied?" },
  { field: "tax_delinquent", label: "Tax Delinquent?" },
];
