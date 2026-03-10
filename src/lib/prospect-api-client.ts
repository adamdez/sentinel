import { supabase } from "@/lib/supabase";

export async function getAuthenticatedProspectPatchHeaders(lockVersion?: number): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Session expired. Please sign in again.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };

  if (lockVersion != null) {
    headers["x-lock-version"] = String(lockVersion);
  }

  return headers;
}
