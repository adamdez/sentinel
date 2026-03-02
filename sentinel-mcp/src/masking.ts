/**
 * PII masking utilities for query results.
 * Masks phone numbers and emails to prevent accidental exposure.
 */

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return "***-***-" + digits.slice(-4);
  }
  return phone;
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local[0] + "***@" + domain;
}

const PHONE_FIELDS = new Set([
  "phone", "owner_phone", "phone_dialed", "personal_cell",
  "twilio_phone_number", "transferred_to_cell",
]);

const EMAIL_FIELDS = new Set(["email", "owner_email"]);

/**
 * Apply PII masking to a row, masking known phone/email fields.
 */
export function maskRow(row: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...row };
  for (const field of Object.keys(masked)) {
    if (PHONE_FIELDS.has(field) && typeof masked[field] === "string") {
      masked[field] = maskPhone(masked[field] as string);
    }
    if (EMAIL_FIELDS.has(field) && typeof masked[field] === "string") {
      masked[field] = maskEmail(masked[field] as string);
    }
  }
  return masked;
}

/**
 * Apply masking to an array of rows.
 */
export function maskRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(maskRow);
}
