"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Loader2, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";

const TEAM = [
  {
    name: "Adam",
    initials: "AD",
    email: "adam@dominionhomedeals.com",
    password: "Dominion2026!",
    color: "#00ff88",
    role: "Admin",
  },
  {
    name: "Nathan",
    initials: "NJ",
    email: "nathan@dominionhomedeals.com",
    password: "Dominion2026!",
    color: "#0099ff",
    role: "Admin",
  },
  {
    name: "Logan",
    initials: "LD",
    email: "logan@dominionhomedeals.com",
    password: "Dominion2026!",
    color: "#a855f7",
    role: "Admin",
  },
];

export default function LoginPage() {
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (member: (typeof TEAM)[number]) => {
    setSigningIn(member.email);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: member.email,
      password: member.password,
    });

    if (authError) {
      console.error("[Login] Auth error:", authError);
      setError(`${member.name}: ${authError.message}`);
      setSigningIn(null);
      return;
    }

    window.location.href = "/dashboard";
  };

  return (
    <div className="min-h-screen sentinel-gradient sentinel-grid-bg flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div
        className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full opacity-[0.04] pointer-events-none"
        style={{ background: "radial-gradient(circle, #00ff88, transparent 70%)" }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full opacity-[0.03] pointer-events-none"
        style={{ background: "radial-gradient(circle, #0099ff, transparent 70%)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo + title */}
        <div className="flex flex-col items-center mb-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="h-16 w-16 rounded-2xl bg-neon/10 flex items-center justify-center border border-neon/20 mb-4"
            style={{ boxShadow: "0 0 40px rgba(0,255,136,0.15), 0 0 80px rgba(0,255,136,0.05)" }}
          >
            <Zap className="h-8 w-8 text-neon" />
          </motion.div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ textShadow: "0 0 20px rgba(0,255,136,0.15)" }}
          >
            SENTINEL
          </h1>
          <p className="text-xs text-muted-foreground tracking-[0.2em] uppercase mt-1">
            Dominion Command System
          </p>
        </div>

        {/* Glass card */}
        <div className="glass-card rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Select your profile to continue</p>
          </div>

          <div className="space-y-3">
            {TEAM.map((member, i) => (
              <motion.button
                key={member.email}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                onClick={() => handleSignIn(member)}
                disabled={signingIn !== null}
                className="w-full group relative flex items-center gap-4 rounded-xl px-5 py-4 transition-all duration-200 border border-transparent hover:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: signingIn === member.email
                    ? `rgba(${member.color === "#00ff88" ? "0,255,136" : member.color === "#0099ff" ? "0,153,255" : "168,85,247"},0.12)`
                    : "rgba(255,255,255,0.03)",
                }}
                whileHover={signingIn === null ? { scale: 1.01, x: 4 } : undefined}
                whileTap={signingIn === null ? { scale: 0.99 } : undefined}
              >
                {/* Avatar */}
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 transition-shadow duration-300"
                  style={{
                    background: `${member.color}15`,
                    color: member.color,
                    border: `1px solid ${member.color}30`,
                    boxShadow: signingIn === member.email ? `0 0 20px ${member.color}30` : "none",
                  }}
                >
                  {signingIn === member.email ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    member.initials
                  )}
                </div>

                {/* Name + role */}
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-foreground">
                    Sign in as {member.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
                </div>

                {/* Arrow indicator */}
                <div
                  className="text-xs font-mono opacity-0 group-hover:opacity-60 transition-opacity"
                  style={{ color: member.color }}
                >
                  →
                </div>
              </motion.button>
            ))}
          </div>

          {/* Error display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-xs"
            >
              {error}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground/40 mt-6 tracking-wide">
          DOMINION HOME DEALS — INTERNAL USE ONLY
        </p>
      </motion.div>
    </div>
  );
}
