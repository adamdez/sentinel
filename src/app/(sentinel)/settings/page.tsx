"use client";

import { useState, useEffect, useCallback } from "react";
import { Palette, Phone, Loader2, Check } from "lucide-react";
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
      description="System configuration and control plane"
    >
      <div className="space-y-6">
        {/* Operator Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GlassCard hover={false}>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Palette className="h-4 w-4 text-foreground" />
              Appearance
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Theme preference saved on this device.
            </p>
            <select
              id="sentinel-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as SentinelThemeId)}
              className="w-full max-w-md rounded-md border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              {SENTINEL_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.experimental ? " (beta)" : ""}
                </option>
              ))}
            </select>
          </GlassCard>

          <GlassCard hover={false}>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Phone className="h-4 w-4 text-foreground" />
              My Personal Cell
              <Badge variant="outline" className="text-xs">Warm Transfer</Badge>
            </h3>
            <p className="text-xs text-muted-foreground/60 mb-3">
              Twilio rings this number when you dial. The outbound number is yours, but branded business name display depends on carrier support plus Twilio trust registration.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={personalCell}
                onChange={(e) => setPersonalCell(e.target.value)}
                placeholder="+1XXXXXXXXXX"
                className="flex-1 font-mono text-sm bg-overlay-3 border-overlay-6 focus:border-ring focus:ring-ring/20"
              />
              <Button
                onClick={handleSaveCell}
                disabled={saving}
                className="gap-1.5 bg-primary text-primary-foreground border border-overlay-15 hover:opacity-95"
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
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/50 animate-pulse" />
                Active — {currentUser.personal_cell}
              </p>
            )}
          </GlassCard>
        </div>

        {/* Control Plane — AI / Voice / Policies */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 mb-2">
            Control Plane
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Jeff Outbound", href: "/settings/jeff-outbound", desc: "Adam control center for outbound AI calls" },
              { label: "Prompt Registry", href: "/settings/prompt-registry", desc: "AI prompt versions and tracking" },
              { label: "Voice Registry", href: "/settings/voice-registry", desc: "Voice scripts and handoff rules" },
              { label: "Source Policies", href: "/settings/source-policies", desc: "Evidence source trust policies" },
              { label: "Agent Controls", href: "/settings/agent-controls", desc: "Feature flags and rollout" },
            ].map((tool) => (
              <Link key={tool.href} href={tool.href}>
                <GlassCard hover className="!p-3 h-full">
                  <p className="text-sm font-medium text-foreground">{tool.label}</p>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">{tool.desc}</p>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>

        {/* Review Surfaces */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 mb-2">
            Review & QA
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Research Review", href: "/dialer/review/dossier-queue", desc: "Approve or reject AI research" },
              { label: "Call QA", href: "/dialer/qa", desc: "Flagged call findings" },
              { label: "AI Evals", href: "/dialer/review/eval", desc: "Model output review" },
              { label: "Call Review", href: "/dialer/war-room", desc: "Operational call review" },
            ].map((tool) => (
              <Link key={tool.href} href={tool.href}>
                <GlassCard hover className="!p-3 h-full">
                  <p className="text-sm font-medium text-foreground">{tool.label}</p>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">{tool.desc}</p>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>

        {/* Data & Utilities */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 mb-2">
            Data & Utilities
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Import", href: "/admin/import", desc: "Bulk data import and normalization" },
              { label: "Analytics", href: "/analytics", desc: "Source and market attribution" },
              { label: "Trust Language", href: "/settings/trust-language", desc: "Approved seller-facing language" },
              { label: "Predictive Calibration", href: "/analytics/predictive-calibration", desc: "Scoring model tuning" },
            ].map((tool) => (
              <Link key={tool.href} href={tool.href}>
                <GlassCard hover className="!p-3 h-full">
                  <p className="text-sm font-medium text-foreground">{tool.label}</p>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">{tool.desc}</p>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>

        {/* Webhook */}
        <GlassCard hover={false} className="max-w-md">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Webhook URL</h3>
          <Input
            value="/api/ingest"
            readOnly
            className="text-xs font-mono"
          />
        </GlassCard>
      </div>
    </PageShell>
  );
}
