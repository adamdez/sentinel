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

function resolveUser(supabaseUser: { id: string; email?: string }): SentinelUser {
  const email = supabaseUser.email ?? "";
  const mapped = TEAM_MAP[email];

  return {
    id: supabaseUser.id,
    name: mapped?.name ?? email.split("@")[0] ?? "User",
    email,
    role: mapped?.role ?? "agent",
    avatar_url: undefined,
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
        setCurrentUser(resolveUser(session.user));
      } else if (pathname !== "/login") {
        router.replace("/login");
      }
    };

    syncSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser(resolveUser(session.user));
      } else if (pathname !== "/login") {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [setCurrentUser, router, pathname]);

  return <>{children}</>;
}
