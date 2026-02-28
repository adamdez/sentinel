"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, Shield, Bell, Palette, Database, Key, Users, Sliders, Phone, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

const settingSections = [
  {
    icon: Users,
    title: "Team Management",
    description: "Manage team members, roles, and permissions",
    badge: "RBAC",
  },
  {
    icon: Shield,
    title: "Compliance",
    description: "DNC lists, litigant suppression, opt-out management",
    badge: "Sacred",
  },
  {
    icon: Key,
    title: "API Keys",
    description: "Twilio, DocuSign, Google OAuth, webhook secrets",
    badge: null,
  },
  {
    icon: Database,
    title: "Data Management",
    description: "Import/export, backup, identity model settings",
    badge: null,
  },
  {
    icon: Sliders,
    title: "Scoring Configuration",
    description: "Model weights, thresholds, promotion rules",
    badge: "Config-driven",
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "Alert preferences, digest frequency, channels",
    badge: null,
  },
  {
    icon: Palette,
    title: "Appearance",
    description: "Theme, density, sidebar preferences",
    badge: null,
  },
];

export default function SettingsPage() {
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("user_profiles") as any)
        .update({ personal_cell: cleaned || null })
        .eq("id", currentUser.id);

      if (error) {
        toast.error("Failed to save — check permissions");
        console.error("[Settings] personal_cell save:", error);
      } else {
        setCurrentUser({ ...currentUser, personal_cell: cleaned || undefined });
        toast.success("Personal cell saved — warm transfers will route here");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      toast.error("Network error");
    } finally {
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
          {/* Personal Cell for Warm Transfer */}
          <GlassCard hover={false} glow>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Phone className="h-4 w-4 text-cyan" />
              My Personal Cell
              <Badge variant="cyan" className="text-[9px]">Warm Transfer</Badge>
            </h3>
            <p className="text-[11px] text-muted-foreground/60 mb-3">
              Twilio will ring this number when you dial from Power Dialer. Caller ID shows &quot;Dominion Homes&quot;.
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

          {settingSections.map((section) => {
            const Icon = section.icon;
            return (
              <GlassCard key={section.title} className="flex items-center gap-4 cursor-pointer hover:neon-glow transition-all">
                <div className="p-2 rounded-[12px] bg-secondary/50">
                  <Icon className="h-5 w-5 text-cyan" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{section.title}</p>
                    {section.badge && (
                      <Badge variant="outline" className="text-[9px]">{section.badge}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
              </GlassCard>
            );
          })}
        </div>

        <div className="space-y-4">
          <GlassCard hover={false}>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4 text-cyan" />
              Feature Flags
            </h3>
            <div className="space-y-3">
              {[
                { label: "AI Scoring", enabled: true },
                { label: "Dialer", enabled: true },
                { label: "Ghost Mode", enabled: true },
                { label: "Team Chat", enabled: true },
                { label: "Campaigns", enabled: true },
                { label: "Fast Signal Mode", enabled: false },
              ].map((flag) => (
                <div key={flag.label} className="flex items-center justify-between">
                  <span className="text-xs">{flag.label}</span>
                  <Switch defaultChecked={flag.enabled} />
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard hover={false}>
            <h3 className="text-sm font-semibold mb-3">Webhook URL</h3>
            <Input
              value="/api/ingest"
              readOnly
              className="text-xs font-mono mb-2"
            />
            <Button variant="outline" size="sm" className="w-full text-xs">
              Regenerate Secret
            </Button>
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}
