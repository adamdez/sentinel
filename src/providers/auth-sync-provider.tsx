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

async function resolveUser(supabaseUser: { id: string; email?: string }): Promise<SentinelUser> {
  const email = supabaseUser.email ?? "";
  const mapped = TEAM_MAP[email];

  // Fetch personal_cell from user_profiles
  let personalCell: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from("user_profiles") as any)
      .select("personal_cell")
      .eq("id", supabaseUser.id)
      .single();
    personalCell = profile?.personal_cell ?? undefined;
  } catch {
    // Profile may not exist yet
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
        setCurrentUser(await resolveUser(session.user));
      } else if (pathname !== "/login") {
        router.replace("/login");
      }
    };

    syncSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setCurrentUser(await resolveUser(session.user));
      } else if (pathname !== "/login") {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [setCurrentUser, router, pathname]);

  return <>{children}</>;
}
