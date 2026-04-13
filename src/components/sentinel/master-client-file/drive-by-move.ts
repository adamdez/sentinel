import { supabase } from "@/lib/supabase";

export const DRIVE_BY_NEXT_ACTION = "Drive by";

type MoveLeadToDriveBySuccess = {
  ok: true;
  data: Record<string, unknown>;
};

type MoveLeadToDriveByFailure = {
  ok: false;
  error: string;
};

export type MoveLeadToDriveByResult = MoveLeadToDriveBySuccess | MoveLeadToDriveByFailure;

export async function moveLeadToDriveBy(leadId: string): Promise<MoveLeadToDriveByResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Session expired. Please sign in again." };
  }

  // Use the same lead write path as the rest of the client file so queue/task
  // side effects stay centralized in /api/prospects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: fetchErr } = await (supabase.from("leads") as any)
    .select("lock_version")
    .eq("id", leadId)
    .single();

  if (fetchErr || !current) {
    return { ok: false, error: "Could not load current lead state. Refresh and try again." };
  }

  const res = await fetch("/api/prospects", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      "x-lock-version": String(current.lock_version ?? 0),
    },
    body: JSON.stringify({
      lead_id: leadId,
      status: "lead",
      next_action: DRIVE_BY_NEXT_ACTION,
      next_action_due_at: null,
      next_follow_up_at: null,
      next_call_scheduled_at: null,
    }),
  });

  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : null;
    const error = typeof data.error === "string" ? data.error : null;
    if (res.status === 409) {
      return { ok: false, error: "Drive By move conflicted with another edit. Refresh and try again." };
    }
    return { ok: false, error: detail ?? error ?? `Could not move to Drive By (HTTP ${res.status})` };
  }

  return { ok: true, data };
}
