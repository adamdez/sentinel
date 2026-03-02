"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import type { User as SentinelUser } from "@/lib/types";

const TEAM_MAP: Record<string, { name: string; role: SentinelUser["role"] }> = {
  "adam@dominionhomedeals.com": { name: "Adam D.", role: "admin" },
  "nathan@dominionhomedeals.com": { name: "Nathan J.", role: "admin" },
  "logan@dominionhomedeals.com": { name: "Logan D.", role: "admin" },
};

async function ensureProfileAndResolve(
  supabaseUser: { id: string; email?: string },
  accessToken: string,
): Promise<SentinelUser> {
  const email = supabaseUser.email ?? "";
  const mapped = TEAM_MAP[email];

  let personalCell: string | undefined;
  try {
    const res = await fetch("/api/auth/ensure-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      personalCell = data.personal_cell ?? undefined;
    }
  } catch {
    // Non-fatal — profile may already exist, fall back to direct query
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase.from("user_profiles") as any)
        .select("personal_cell")
        .eq("id", supabaseUser.id)
        .single();
      personalCell = profile?.personal_cell ?? undefined;
    } catch {
      // Profile genuinely doesn't exist yet
    }
  }

  return {
    id: supabaseUser.id,
    name: mapped?.name ?? email.split("@")[0] ?? "User",
    email,
    role: mapped?.role ?? "agent",
    avatar_url: undefined,
    personal_cell: personalCell,
    is_active: true,
  };
}

export function AuthSyncProvider({ children }: { children: React.ReactNode }) {
  const { setCurrentUser } = useSentinelStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const syncSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setCurrentUser(await ensureProfileAndResolve(session.user, session.access_token));
      } else if (pathname !== "/login") {
        router.replace("/login");
      }
    };

    syncSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setCurrentUser(await ensureProfileAndResolve(session.user, session.access_token));
      } else if (pathname !== "/login") {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [setCurrentUser, router, pathname]);

  return <>{children}</>;
}
