import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * Shared auth utility for API routes.
 * Extracts Bearer token from Authorization header and validates against Supabase.
 * Returns the authenticated user or null if unauthorized.
 */
export async function requireAuth(req: NextRequest, sb: ReturnType<typeof createServerClient>) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
