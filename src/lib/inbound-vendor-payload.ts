function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEmbeddedJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readVendorString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function unwrapVendorPayload(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    return {};
  }

  const embeddedPayload =
    parseEmbeddedJson(body[""])
    ?? parseEmbeddedJson(body.payload)
    ?? parseEmbeddedJson(body.body);

  const dataLayer = isRecord(body.data) ? body.data : null;
  const leadInfo =
    (isRecord(body["LEAD INFO"]) ? body["LEAD INFO"] : null) ??
    (dataLayer && isRecord(dataLayer["LEAD INFO"]) ? dataLayer["LEAD INFO"] : null);

  return {
    ...body,
    ...(embeddedPayload ?? {}),
    ...(dataLayer ?? {}),
    ...(leadInfo ?? {}),
  };
}

export function isVendorPayloadRecord(body: unknown): body is Record<string, unknown> {
  return isRecord(body);
}
