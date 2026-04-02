import { supabase } from "@/lib/supabase";
import type { DeleteLeadBatchResult } from "@/lib/lead-queue-contract";

type ApiPayload = {
  error?: string;
  detail?: string;
  property_deleted?: boolean;
  deletedLeadIds?: string[];
  skippedLeadIds?: string[];
  deletedProperties?: number;
  failed?: Array<{ leadId: string; error: string }>;
  ok?: boolean;
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
  const result = await deleteLeadCustomerFiles([leadId]);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.error,
    };
  }

  return {
    ok: true,
    propertyDeleted: result.deletedProperties > 0,
  };
}

export async function deleteLeadCustomerFiles(leadIds: string[]): Promise<DeleteLeadBatchResult> {
  if (leadIds.length === 0) {
    return {
      ok: true,
      deletedLeadIds: [],
      skippedLeadIds: [],
      deletedProperties: 0,
      failed: [],
    };
  }

  const res = await fetch("/api/leads/batch", {
    method: "POST",
    headers: await sessionJsonHeaders(),
    body: JSON.stringify({
      operation: "delete_customer_files",
      leadIds,
      params: {},
    }),
  });
  const data = await readPayload(res);

  if (!res.ok || data.error || data.ok === false) {
    return {
      ok: false,
      status: res.status,
      error: data.detail ?? data.error ?? `HTTP ${res.status}`,
    };
  }

  return {
    ok: true,
    deletedLeadIds: Array.isArray(data.deletedLeadIds) ? data.deletedLeadIds : [],
    skippedLeadIds: Array.isArray(data.skippedLeadIds) ? data.skippedLeadIds : [],
    deletedProperties: typeof data.deletedProperties === "number" ? data.deletedProperties : 0,
    failed: Array.isArray(data.failed) ? data.failed : [],
  };
}
