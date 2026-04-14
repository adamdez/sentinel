"use client";

type DialerNavigationOptions = {
  autodial?: boolean;
  leadName?: string | null;
  leadId?: string | null;
  openClientFile?: boolean;
  phone?: string | null;
  source?: string | null;
};

function normalizePhoneForDialer(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

function makeRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildDialerHref(options: DialerNavigationOptions): string {
  const params = new URLSearchParams();
  const phone = normalizePhoneForDialer(options.phone);
  const leadId = options.leadId?.trim();
  const source = options.source?.trim();

  if (phone) params.set("phone", phone);
  if (leadId) params.set("lead_id", leadId);
  if (options.autodial) params.set("autodial", "1");
  if (options.openClientFile && leadId) params.set("open_client_file", "1");
  if (source) params.set("source", source);
  if (options.autodial) params.set("request_id", makeRequestId());

  const query = params.toString();
  return query ? `/dialer?${query}` : "/dialer";
}

export function pushToDialer(router: { push: (href: string) => void }, options: DialerNavigationOptions): void {
  router.push(buildDialerHref(options));
}
