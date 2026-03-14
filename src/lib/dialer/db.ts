/**
 * Dialer domain DB client — PR1
 *
 * This is EXTRACTION POINT 1. It is the only file in the dialer domain
 * that knows how to create a database connection.
 *
 * BOUNDARY RULES:
 *   - Import ONLY from @supabase/supabase-js (direct SDK, not @/lib/supabase)
 *   - Never import createServerClient from @/lib/supabase
 *   - Never import getOrCreateProfile or any CRM auth helpers
 *
 * Future extraction (Stage 3):
 *   Replace createDialerClient() with a connection to a separate schema
 *   or database. Replace getDialerUser() with a JWT validation HTTP call.
 *   Zero callers change — they all import from this file.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates the dialer domain DB client.
 *
 * Currently points at the same Supabase instance as the CRM.
 * In Stage 3 extraction, this returns a client for a separate schema or DB.
 * In Stage 4 extraction, this is replaced with an HTTP client entirely.
 */
export function createDialerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("[Dialer] Missing Supabase configuration (URL or key).");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Validates a Bearer token and returns the authenticated user ID.
 *
 * This is EXTRACTION POINT 2 for auth. In Stage 4, replace this with
 * a call to a shared auth service or JWT verification library.
 * All dialer routes call this instead of duplicating auth logic.
 *
 * Returns null if the token is missing, invalid, or expired.
 */
export async function getDialerUser(
  authHeader: string | null | undefined,
): Promise<{ id: string } | null> {
  if (!authHeader) return null;

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) return null;

  const sb = createDialerClient();
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(token);

  if (error || !user) return null;
  return { id: user.id };
}
