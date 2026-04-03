import type { NextRequest } from "next/server";

import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";

const ADMIN_EMAILS = new Set([
  "adam@dominionhomedeals.com",
  "nathan@dominionhomedeals.com",
  "logan@dominionhomedeals.com",
]);

export interface AdminAccessResult {
  ok: boolean;
  sb: ReturnType<typeof createServerClient>;
  user: { id: string; email: string | null } | null;
  via: "cron" | "admin" | "unauthorized";
}

export async function requireAdminAccess(req: NextRequest): Promise<AdminAccessResult> {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && authHeader === `Bearer ${expectedSecret}`) {
    return {
      ok: true,
      sb,
      user: null,
      via: "cron",
    };
  }

  const user = await requireAuth(req, sb);
  if (!user) {
    return {
      ok: false,
      sb,
      user: null,
      via: "unauthorized",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (sb.from("user_profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const email = user.email ?? null;
  const isAdmin = profile?.role === "admin" || (email ? ADMIN_EMAILS.has(email.toLowerCase()) : false);

  return {
    ok: isAdmin,
    sb,
    user: { id: user.id, email },
    via: isAdmin ? "admin" : "unauthorized",
  };
}
