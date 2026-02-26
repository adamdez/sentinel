"use client";

import { Mail, Inbox, Send, Archive, Star, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function GmailPage() {
  return (
    <PageShell
      title="Gmail"
      description="Sentinel Gmail — Integrated email management with lead context"
      actions={
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <RefreshCw className="h-3 w-3" />
          Sync
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sidebar */}
        <GlassCard hover={false} className="p-3">
          <Button className="w-full mb-4 gap-2">
            <Send className="h-4 w-4" />
            Compose
          </Button>
          <nav className="space-y-1">
            {[
              { icon: Inbox, label: "Inbox", count: 12 },
              { icon: Star, label: "Starred", count: 3 },
              { icon: Send, label: "Sent", count: 0 },
              { icon: Archive, label: "Archive", count: 0 },
            ].map((item) => (
              <button
                key={item.label}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary/50 transition-colors"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.count > 0 && (
                  <Badge variant="neon" className="ml-auto text-[10px]">
                    {item.count}
                  </Badge>
                )}
              </button>
            ))}
          </nav>
        </GlassCard>

        {/* Email List */}
        <div className="lg:col-span-3">
          <GlassCard hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4 text-neon" />
                Inbox
              </h2>
              <Badge variant="outline" className="text-[10px]">
                Google OAuth Required
              </Badge>
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors cursor-pointer"
                >
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-2 w-2/3" />
                  </div>
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
            {/* TODO: Google OAuth integration */}
            {/* TODO: Auto-link emails to lead records */}
            {/* TODO: Template system for outreach */}
            <p className="text-xs text-muted-foreground text-center mt-6 py-4 border-t border-glass-border">
              Sentinel Gmail — Cutting-edge shell ready. Connect Google OAuth to sync.
            </p>
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}
