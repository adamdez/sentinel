"use client";

import { Settings, Shield, Bell, Palette, Database, Key, Users, Sliders } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

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
  return (
    <PageShell
      title="Settings"
      description="Sentinel Settings — System configuration, team management, and compliance"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
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
            {/* TODO: Webhook management UI */}
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}
