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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Get or create a user's profile.
 * Uses service role to bypass RLS so the upsert always succeeds.
 */
export async function getOrCreateProfile(userId: string, fallback?: { email?: string; name?: string }) {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("user_profiles") as any)
    .select("*")
    .eq("id", userId)
    .single();

  if (data && !error) return data;

  if (error && (error as { code?: string }).code === "PGRST116") {
    const email = fallback?.email ?? `${userId}@sentinel.local`;
    const fullName = fallback?.name ?? email;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error: createError } = await (sb.from("user_profiles") as any)
      .insert({
        id: userId,
        full_name: fullName,
        email,
        role: "agent",
        is_active: true,
        preferences: {},
      })
      .select("*")
      .single();

    if (createError) {
      console.error("[Supabase] Failed to create profile:", createError);
      return null;
    }
    return created;
  }

  console.error("[Supabase] Error fetching user profile:", error);
  return null;
}
