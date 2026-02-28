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
    color: "#00E5FF",
    role: "Admin",
  },
  {
    name: "Logan",
    initials: "LD",
    email: "logan@dominionhomedeals.com",
    color: "#A855F7",
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
        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full opacity-[0.03] pointer-events-none"
        style={{ background: "radial-gradient(circle, #00E5FF, transparent 70%)", filter: "blur(40px)" }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.025] pointer-events-none"
        style={{ background: "radial-gradient(circle, #A855F7, transparent 70%)", filter: "blur(40px)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="h-16 w-16 rounded-[16px] bg-cyan/[0.08] flex items-center justify-center border border-cyan/15 mb-4"
            style={{ boxShadow: "0 0 40px rgba(0,229,255,0.12), 0 0 80px rgba(0,229,255,0.04)" }}
          >
            <Zap className="h-8 w-8 text-cyan" style={{ filter: "drop-shadow(0 0 8px rgba(0,229,255,0.5))" }} />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground title-glow">
            SENTINEL
          </h1>
          <p className="text-xs text-muted-foreground/50 tracking-[0.2em] uppercase mt-1">
            Dominion Command System
          </p>
        </div>

        <div
          className="rounded-[16px] p-8 bg-[rgba(10,10,18,0.55)] backdrop-blur-[30px] border border-white/[0.07]"
          style={{
            boxShadow: "0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.3)",
          }}
        >
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
                  <Shield className="h-4 w-4 text-muted-foreground/60" />
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
                      className="w-full group relative flex items-center gap-4 rounded-[12px] px-5 py-4 transition-all duration-200 border border-transparent hover:border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
                      whileHover={{ scale: 1.01, x: 4 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div
                        className="h-12 w-12 rounded-[12px] flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          background: `${member.color}12`,
                          color: member.color,
                          border: `1px solid ${member.color}20`,
                          boxShadow: `0 0 15px ${member.color}15`,
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
                        style={{ color: member.color }}
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
                    className="h-12 w-12 rounded-[12px] flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: `${selectedMember.color}12`,
                      color: selectedMember.color,
                      border: `1px solid ${selectedMember.color}20`,
                      boxShadow: `0 0 20px ${selectedMember.color}15`,
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
                      className="w-full pl-10 pr-4 py-3 rounded-[12px] border border-white/[0.07] bg-white/[0.03] text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-cyan/25 focus:border-cyan/20 backdrop-blur-xl transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={signingIn || !password}
                    className="w-full py-3 rounded-[12px] text-sm font-semibold text-[#0A0A0F] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{
                      background: selectedMember.color,
                      boxShadow: `0 0 25px ${selectedMember.color}25, 0 0 50px ${selectedMember.color}10`,
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
                className="mt-4 p-3 rounded-[10px] border border-red-500/15 bg-red-500/[0.04] text-red-400 text-xs"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/30 mt-6 tracking-wide">
          DOMINION HOME DEALS — INTERNAL USE ONLY
        </p>
      </motion.div>
    </div>
  );
}
