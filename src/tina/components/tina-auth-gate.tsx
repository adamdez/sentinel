"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function TinaAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"checking" | "ready" | "redirecting">("checking");
  const loginHref = `/login?product=tina&next=${encodeURIComponent(pathname || "/tina")}`;

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!alive) return;

      if (!session?.user) {
        setStatus("redirecting");
        router.replace(loginHref);
        return;
      }

      setStatus("ready");
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;

      if (!session?.user) {
        setStatus("redirecting");
        if (pathname !== "/login") {
          router.replace(loginHref);
        }
        return;
      }

      setStatus("ready");
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [loginHref, pathname, router]);

  if (status === "ready") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background px-6 py-16 text-white">
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-[28px] border border-white/10 bg-white/5 px-8 py-14 text-center shadow-[0_18px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
        {status === "redirecting" ? (
          <Lock className="h-8 w-8 text-emerald-200" />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-emerald-200" />
        )}
        <p className="mt-5 text-lg font-semibold">
          {status === "redirecting" ? "Taking you to login..." : "Checking Tina access..."}
        </p>
        <p className="mt-3 max-w-md text-sm leading-6 text-zinc-300">
          Tina is a private tax workspace. She checks for a signed-in session before opening any of
          the tax pages.
        </p>
      </div>
    </div>
  );
}
