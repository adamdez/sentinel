import { createClient } from "@supabase/supabase-js";
import type { Database } from "./supabase-types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser client — uses anon key, respects RLS policies.
 * Safe to use in client components.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Server client — uses service role key, bypasses RLS.
 * Only use in API routes and server actions.
 */
export function createServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey === "your_supabase_service_role_key") {
    console.warn("[Supabase] Service role key not configured — using anon key");
    return supabase;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Helper to get the current authenticated user.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Helper to get a user's profile from user_profiles table.
 */
export async function getUserProfile(userId: string) {
  // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("user_profiles") as any)
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("[Supabase] Error fetching user profile:", error);
    return null;
  }
  return data;
}
