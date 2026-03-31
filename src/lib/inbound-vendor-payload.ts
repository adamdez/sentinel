function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readVendorString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function unwrapVendorPayload(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    return {};
  }

  const dataLayer = isRecord(body.data) ? body.data : null;
  const leadInfo =
    (isRecord(body["LEAD INFO"]) ? body["LEAD INFO"] : null) ??
    (dataLayer && isRecord(dataLayer["LEAD INFO"]) ? dataLayer["LEAD INFO"] : null);

  return {
    ...body,
    ...(dataLayer ?? {}),
    ...(leadInfo ?? {}),
  };
}

export function isVendorPayloadRecord(body: unknown): body is Record<string, unknown> {
  return isRecord(body);
}
