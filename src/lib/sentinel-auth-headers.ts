import { supabase } from "@/lib/supabase";

/** Bearer + JSON headers for authenticated Sentinel API routes (same pattern as dialer panels). */
export async function sentinelAuthHeaders(json = true): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}
