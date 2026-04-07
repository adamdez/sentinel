import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * Shared auth utility for API routes.
 * Extracts Bearer token from Authorization header and validates against Supabase.
 * Also accepts the Supabase service-role key for internal/agent calls —
 * the service-role JWT is validated by Supabase auth.admin.getUserById
 * using the operator's (Adam's) user ID as the system identity.
 * Returns the authenticated user or null if unauthorized.
 */
export async function requireAuth(req: NextRequest, sb: ReturnType<typeof createServerClient>) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  // Service-role key: resolve to operator user via admin API
  if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const operatorId = process.env.ESCALATION_TARGET_USER_ID;
    if (!operatorId) return null;
    const { data, error } = await sb.auth.admin.getUserById(operatorId);
    if (error || !data.user) return null;
    return data.user;
  }

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function getAuthenticatedUser(req: NextRequest, sb: ReturnType<typeof createServerClient>) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    if (token === process.env.CRON_SECRET) return null;
    const user = await requireAuth(req, sb);
    if (user) return user;
  }

  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function requireUserOrCron(req: NextRequest, sb: ReturnType<typeof createServerClient>) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token && token === process.env.CRON_SECRET) {
    return { isCron: true, user: null };
  }

  const user = await getAuthenticatedUser(req, sb);
  if (!user) return null;
  return { isCron: false, user };
}
