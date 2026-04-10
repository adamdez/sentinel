function normalizePhoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function tokenizeQuery(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}

export function matchesCommunicationSearch(
  query: string,
  fields: Array<string | null | undefined>,
): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;

  const haystack = fields
    .map((field) => normalizeText(field))
    .filter(Boolean)
    .join(" ");

  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  const queryDigits = normalizePhoneDigits(query);
  if (queryDigits) {
    const fieldDigits = fields
      .map((field) => normalizePhoneDigits(field))
      .filter(Boolean);
    if (fieldDigits.some((digits) => digits.includes(queryDigits))) {
      return true;
    }
  }

  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;
  return tokens.every((token) => haystack.includes(token));
}
