"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Loader2, Shield, ArrowLeft, Lock } from "lucide-react";
import { AuthRequestTimeoutError, clearLocalAuthState, signInWithPasswordWithTimeout } from "@/lib/sentinel-auth-headers";
import { usePsalm20 } from "@/components/sentinel/psalm20/use-psalm20";
import { ShieldIcon, BannerLarge, GoldDivider, CrownIcon, BannerIcon } from "@/components/sentinel/psalm20/icons";
import { ScriptureWatermark } from "@/components/sentinel/psalm20/scripture-watermark";

const TEAM = [
  {
    name: "Adam",
    initials: "AD",
    email: "adam@dominionhomedeals.com",
    color: "#6a8f93",
    role: "Admin",
  },
  {
    name: "user 1",
    initials: "U1",
    email: "nathan@dominionhomedeals.com",
    color: "#7a9094",
    role: "Agent",
  },
  {
    name: "Logan",
    initials: "LD",
    email: "logan@dominionhomedeals.com",
    color: "#5f8589",
    role: "Admin",
  },
];

export default function LoginPage() {
  const [selectedMember, setSelectedMember] = useState<(typeof TEAM)[number] | null>(null);
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void clearLocalAuthState();
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !password) return;

    setSigningIn(true);
    setError(null);

    await clearLocalAuthState();

    let timedOut = false;
    const timeoutHandle = window.setTimeout(() => {
      timedOut = true;
      setError("Sentinel auth is not responding right now. Supabase appears degraded.");
      setSigningIn(false);
    }, 12_000);

    let authError: { message: string } | null = null;

    try {
      const { error } = await signInWithPasswordWithTimeout({
        email: selectedMember.email,
        password,
      });
      if (timedOut) return;
      authError = error;
    } catch (error) {
      if (timedOut) return;
      authError = error instanceof Error ? error : new Error(String(error));
    } finally {
      window.clearTimeout(timeoutHandle);
    }

    if (authError) {
      console.error("[Login] Auth error:", authError);
      setError(
        authError instanceof AuthRequestTimeoutError || authError.message === "Failed to fetch"
          ? "Sentinel auth is not responding right now. Supabase appears degraded."
          : authError.message,
      );
      setSigningIn(false);
      return;
    }

    window.location.href = "/dashboard";
  };

  const handleBack = () => {
    setSelectedMember(null);
    setPassword("");
    setError(null);
  };

  const isPsalm20 = usePsalm20();
  const showLocalHelper = process.env.NODE_ENV !== "production";

  // Psalm 20 gold used for member avatars in psalm20 mode
  const memberColor = (member: (typeof TEAM)[number]) =>
    isPsalm20 ? "#c9a84c" : member.color;

  return (
    <div className="min-h-screen sentinel-gradient flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Psalm 20 — full scripture watermark + sanctuary glow */}
      {isPsalm20 && (
        <>
          <ScriptureWatermark />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 70% 50% at 50% 20%, rgba(201,168,76,0.08) 0%, transparent 60%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 40% 80% at 50% 100%, rgba(8,11,20,0.9) 0%, transparent 70%)",
            }}
          />
        </>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          {isPsalm20 ? (
            <>
              {/* Shield emblem */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className="h-20 w-20 rounded-2xl flex items-center justify-center mb-5"
                style={{
                  background: "rgba(201,168,76,0.06)",
                  border: "1px solid rgba(201,168,76,0.15)",
                  boxShadow: "0 0 40px rgba(201,168,76,0.08), 0 8px 32px rgba(0,0,0,0.3)",
                }}
              >
                <ShieldIcon className="h-10 w-10" color="#c9a84c" />
              </motion.div>

              {/* Decorative banner */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="w-64 mb-3"
              >
                <BannerLarge />
              </motion.div>

              <h1
                className="text-3xl font-bold tracking-[0.12em] uppercase"
                style={{ color: "#c9a84c", textShadow: "0 0 30px rgba(201,168,76,0.25)" }}
              >
                SENTINEL
              </h1>
              <p className="text-[11px] tracking-[0.25em] uppercase mt-1.5" style={{ color: "#a08860" }}>
                Banner of Victory
              </p>

              {/* Scripture fragment */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="flex items-center gap-3 mt-5"
              >
                <BannerIcon className="h-3 w-3" color="rgba(201,168,76,0.35)" />
                <span
                  className="text-[10px] tracking-[0.2em] uppercase italic"
                  style={{ color: "rgba(201,168,76,0.45)" }}
                >
                  &ldquo;In the name of our God we will set up our banners.&rdquo;
                </span>
                <BannerIcon className="h-3 w-3" color="rgba(201,168,76,0.35)" />
              </motion.div>
            </>
          ) : (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className="h-16 w-16 rounded-2xl bg-overlay-4 flex items-center justify-center border border-overlay-10 mb-4 shadow-[0_8px_32px_var(--shadow-medium)]"
              >
                <Zap className="h-8 w-8 text-primary" />
              </motion.div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                SENTINEL
              </h1>
              <p className="text-xs text-muted-foreground/70 tracking-[0.2em] uppercase mt-1">
                Dominion Command System
              </p>
            </>
          )}
        </div>

        <div
          className="rounded-[16px] p-8 backdrop-blur-[30px] border"
          style={{
            background: isPsalm20 ? "rgba(10,14,28,0.70)" : "var(--panel)",
            borderColor: isPsalm20 ? "rgba(201,168,76,0.12)" : "var(--overlay-8)",
            boxShadow: isPsalm20
              ? "0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(201,168,76,0.04), inset 0 1px 0 rgba(201,168,76,0.06)"
              : "0 20px 60px var(--shadow-heavy), inset 0 1px 0 var(--overlay-5), inset 0 -1px 0 var(--shadow-medium)",
          }}
        >
          {isPsalm20 && <GoldDivider className="mb-6 opacity-50" />}

          <AnimatePresence mode="wait">
            {!selectedMember ? (
              <motion.div
                key="select"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-6">
                  {isPsalm20 ? (
                    <CrownIcon className="h-4 w-4" color="rgba(201,168,76,0.5)" />
                  ) : (
                    <Shield className="h-4 w-4 text-muted-foreground/60" />
                  )}
                  <p className="text-sm text-muted-foreground/70">Select your profile</p>
                </div>

                <div className="space-y-3">
                  {TEAM.map((member, i) => (
                    <motion.button
                      key={member.email}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.08 }}
                      onClick={() => setSelectedMember(member)}
                      className="w-full group relative flex items-center gap-4 rounded-[14px] px-5 py-4 transition-all duration-200 border border-transparent hover:border-overlay-10"
                      style={{ background: "var(--overlay-3)" }}
                      whileHover={{ scale: 1.01, x: 4 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div
                        className="h-12 w-12 rounded-[14px] flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          background: `${memberColor(member)}18`,
                          color: memberColor(member),
                          border: `1px solid ${memberColor(member)}35`,
                        }}
                      >
                        {member.initials}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground/60">{member.role}</p>
                      </div>
                      <div
                        className="text-xs font-mono opacity-0 group-hover:opacity-60 transition-opacity"
                        style={{ color: memberColor(member) }}
                      >
                        →
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="password"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors mb-5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>

                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="h-12 w-12 rounded-[14px] flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: `${memberColor(selectedMember)}18`,
                      color: memberColor(selectedMember),
                      border: `1px solid ${memberColor(selectedMember)}35`,
                    }}
                  >
                    {selectedMember.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Sign in as {selectedMember.name}
                    </p>
                    <p className="text-xs text-muted-foreground/60">{selectedMember.email}</p>
                  </div>
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 rounded-[12px] border border-glass-border bg-glass/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/35 backdrop-blur-xl"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={signingIn || !password}
                    className="w-full py-3 rounded-[12px] text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{
                      background: isPsalm20 ? "#c9a84c" : memberColor(selectedMember),
                      color: isPsalm20 ? "#0a0e1a" : "black",
                      boxShadow: isPsalm20
                        ? "0 4px 24px rgba(201,168,76,0.25), 0 0 40px rgba(201,168,76,0.08)"
                        : "0 4px 24px var(--shadow-medium)",
                    }}
                  >
                    {signingIn ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mt-4 p-3 rounded-[12px] border border-border/20 bg-muted/5 text-foreground text-xs"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {showLocalHelper && (
            <div className="mt-4 rounded-[12px] border border-primary/15 bg-primary/[0.04] px-4 py-3 text-xs text-foreground/80">
              <p className="font-semibold text-foreground">Local demo access</p>
              <p className="mt-1">Password: <span className="font-mono">Dominion2026!</span></p>
              <p className="mt-1 text-muted-foreground/80">
                If sign-in fails, run <span className="font-mono">npm run ux:access:local</span> from the repo root.
              </p>
            </div>
          )}

          {isPsalm20 && <GoldDivider className="mt-6 opacity-50" />}
        </div>

        <p className="text-center text-sm mt-6 tracking-wide" style={{
          color: isPsalm20 ? "rgba(201,168,76,0.25)" : undefined,
        }}>
          {isPsalm20 ? (
            <span className="tracking-[0.15em] uppercase text-xs">
              DOMINION HOME DEALS — UNDER THE BANNER
            </span>
          ) : (
            <span className="text-muted-foreground/30">
              DOMINION HOME DEALS — INTERNAL USE ONLY
            </span>
          )}
        </p>
      </motion.div>
    </div>
  );
}
