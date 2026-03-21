"use client";

import { useState, useEffect, useCallback } from "react";
import { Palette, Phone, Loader2, Check, SlidersHorizontal, MapPin } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { useSentinelTheme } from "@/providers/theme-provider";
import { SENTINEL_THEMES } from "@/themes/registry";
import type { SentinelThemeId } from "@/themes/types";


export default function SettingsPage() {
  const { theme, setTheme } = useSentinelTheme();
  const { currentUser, setCurrentUser } = useSentinelStore();
  const [personalCell, setPersonalCell] = useState(currentUser.personal_cell ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPersonalCell(currentUser.personal_cell ?? "");
  }, [currentUser.personal_cell]);

  const handleSaveCell = useCallback(async () => {
    if (!currentUser.id) return;
    const cleaned = personalCell.replace(/[^\d+]/g, "");

    setSaving(true);
    setSaved(false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch("/api/settings/personal-cell", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ personalCell: cleaned }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save — check permissions");
      } else {
        setCurrentUser({ ...currentUser, personal_cell: cleaned || undefined });
        toast.success("Personal cell saved — warm transfers will route here");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("Save timed out — please try again");
      } else {
        toast.error("Network error — please try again");
      }
    } finally {
      clearTimeout(timeout);
      setSaving(false);
    }
  }, [currentUser, personalCell, setCurrentUser]);

  return (
    <PageShell
      title="Settings"
      description="Sentinel Settings — System configuration, team management, and compliance"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <GlassCard hover={false}>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Palette className="h-4 w-4 text-cyan" />
              Appearance
            </h3>
            <p className="text-[11px] text-muted-foreground/60 mb-3">
              UI theme pack for the app shell. In Research Only mode, Lead Detail and all <code className="text-[10px]">/dialer/*</code> routes keep the default workflow token stack (layout + modal boundaries).
            </p>
            <label htmlFor="sentinel-theme" className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-1.5">
              Theme
            </label>
            <select
              id="sentinel-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as SentinelThemeId)}
              className="w-full max-w-md rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              {SENTINEL_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.experimental ? " (beta)" : ""}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground/50 mt-2">
              {SENTINEL_THEMES.find((t) => t.id === theme)?.description}
            </p>
          </GlassCard>

          {/* Personal Cell for Warm Transfer */}
          <GlassCard hover={false} glow>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Phone className="h-4 w-4 text-cyan" />
              My Personal Cell
              <Badge variant="cyan" className="text-[9px]">Warm Transfer</Badge>
            </h3>
            <p className="text-[11px] text-muted-foreground/60 mb-3">
              Twilio will ring this number when you dial from the Dialer. Caller ID shows &quot;Dominion Homes&quot;.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={personalCell}
                onChange={(e) => setPersonalCell(e.target.value)}
                placeholder="+1XXXXXXXXXX (E.164 format)"
                className="flex-1 font-mono text-sm bg-white/[0.03] border-white/[0.06] focus:border-cyan/30 focus:ring-cyan/10"
              />
              <Button
                onClick={handleSaveCell}
                disabled={saving}
                className="gap-1.5 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/25"
                size="sm"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saved ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Phone className="h-3.5 w-3.5" />
                )}
                {saving ? "Saving..." : saved ? "Saved" : "Save"}
              </Button>
            </div>
            {currentUser.personal_cell && (
              <p className="text-[10px] text-cyan/60 mt-2 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-pulse" />
                Active — calls transfer to {currentUser.personal_cell}
              </p>
            )}
          </GlassCard>

        </div>

        <div className="space-y-4">
          <GlassCard hover={false} className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-cyan" />
              Control plane
            </h3>
            <p className="text-[11px] text-muted-foreground/60">
              Agent + voice feature flags backed by <code className="text-[10px]">feature_flags</code>.
            </p>
            <Link
              href="/settings/agent-controls"
              className="inline-flex text-xs text-cyan hover:underline font-medium"
            >
              Open agent controls →
            </Link>
          </GlassCard>

          <GlassCard hover={false} className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-cyan" />
              Property lookup
            </h3>
            <p className="text-[11px] text-muted-foreground/60">
              Multi-provider property search and promote-to-lead.
            </p>
            <Link href="/properties/lookup" className="inline-flex text-xs text-cyan hover:underline font-medium">
              Open property lookup →
            </Link>
          </GlassCard>

          <GlassCard hover={false}>
            <h3 className="text-sm font-semibold mb-3">Webhook URL</h3>
            <Input
              value="/api/ingest"
              readOnly
              className="text-xs font-mono"
            />
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}
