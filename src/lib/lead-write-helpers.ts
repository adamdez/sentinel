import { supabase } from "@/lib/supabase";

type ApiPayload = {
  error?: string;
  detail?: string;
  property_deleted?: boolean;
};

export type DeleteLeadResult =
  | { ok: true; propertyDeleted: boolean }
  | { ok: false; status: number; error: string };

async function sessionJsonHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

async function readPayload(res: Response): Promise<ApiPayload> {
  try {
    return (await res.json()) as ApiPayload;
  } catch {
    return {};
  }
}

export async function deleteLeadCustomerFile(leadId: string): Promise<DeleteLeadResult> {
  const res = await fetch("/api/prospects", {
    method: "DELETE",
    headers: await sessionJsonHeaders(),
    body: JSON.stringify({ lead_id: leadId }),
  });
  const data = await readPayload(res);

  if (!res.ok || data.error) {
    return {
      ok: false,
      status: res.status,
      error: data.detail ?? data.error ?? `HTTP ${res.status}`,
    };
  }

  return {
    ok: true,
    propertyDeleted: Boolean(data.property_deleted),
  };
}
