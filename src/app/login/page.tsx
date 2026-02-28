"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Loader2, Shield, ArrowLeft, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

const TEAM = [
  {
    name: "Adam",
    initials: "AD",
    email: "adam@dominionhomedeals.com",
    color: "#00ff88",
    role: "Admin",
  },
  {
    name: "Nathan",
    initials: "NJ",
    email: "nathan@dominionhomedeals.com",
    color: "#0099ff",
    role: "Admin",
  },
  {
    name: "Logan",
    initials: "LD",
    email: "logan@dominionhomedeals.com",
    color: "#a855f7",
    role: "Admin",
  },
];

export default function LoginPage() {
  const [selectedMember, setSelectedMember] = useState<(typeof TEAM)[number] | null>(null);
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !password) return;

    setSigningIn(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: selectedMember.email,
      password,
    });

    if (authError) {
      console.error("[Login] Auth error:", authError);
      setError(authError.message);
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

  return (
    <div className="min-h-screen sentinel-gradient sentinel-grid-bg flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div
        className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full opacity-[0.04] pointer-events-none"
        style={{ background: "radial-gradient(circle, #00d4ff, transparent 70%)" }}
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
            className="h-16 w-16 rounded-2xl bg-cyan/8 flex items-center justify-center border border-cyan/15 mb-4"
            style={{ boxShadow: "0 0 40px rgba(0,212,255,0.15), 0 0 80px rgba(0,212,255,0.05)" }}
          >
            <Zap className="h-8 w-8 text-cyan" />
          </motion.div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ textShadow: "0 0 20px rgba(0,212,255,0.15)" }}
          >
            SENTINEL
          </h1>
          <p className="text-xs text-muted-foreground tracking-[0.2em] uppercase mt-1">
            Dominion Command System
          </p>
        </div>

        {/* Glass card */}
        <div className="glass-card rounded-2xl p-8">
          <AnimatePresence mode="wait">
            {!selectedMember ? (
              /* ── Step 1: Select profile ────────────────────────── */
              <motion.div
                key="select"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-6">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Select your profile</p>
                </div>

                <div className="space-y-3">
                  {TEAM.map((member, i) => (
                    <motion.button
                      key={member.email}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.08 }}
                      onClick={() => setSelectedMember(member)}
                      className="w-full group relative flex items-center gap-4 rounded-[14px] px-5 py-4 transition-all duration-200 border border-transparent hover:border-white/10"
                      style={{ background: "rgba(255,255,255,0.03)" }}
                      whileHover={{ scale: 1.01, x: 4 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div
                        className="h-12 w-12 rounded-[14px] flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          background: `${member.color}15`,
                          color: member.color,
                          border: `1px solid ${member.color}30`,
                        }}
                      >
                        {member.initials}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                      <div
                        className="text-xs font-mono opacity-0 group-hover:opacity-60 transition-opacity"
                        style={{ color: member.color }}
                      >
                        →
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              /* ── Step 2: Enter password ────────────────────────── */
              <motion.div
                key="password"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>

                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="h-12 w-12 rounded-[14px] flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: `${selectedMember.color}15`,
                      color: selectedMember.color,
                      border: `1px solid ${selectedMember.color}30`,
                      boxShadow: `0 0 20px ${selectedMember.color}20`,
                    }}
                  >
                    {selectedMember.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Sign in as {selectedMember.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedMember.email}</p>
                  </div>
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 rounded-[12px] border border-glass-border bg-glass/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:border-cyan/40 backdrop-blur-xl"
                      style={{ outlineColor: selectedMember.color }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={signingIn || !password}
                    className="w-full py-3 rounded-[12px] text-sm font-semibold text-black transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{
                      background: selectedMember.color,
                      boxShadow: `0 0 20px ${selectedMember.color}30`,
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

          {/* Error display */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mt-4 p-3 rounded-[12px] border border-red-500/20 bg-red-500/5 text-red-400 text-xs"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/40 mt-6 tracking-wide">
          DOMINION HOME DEALS — INTERNAL USE ONLY
        </p>
      </motion.div>
    </div>
  );
}
