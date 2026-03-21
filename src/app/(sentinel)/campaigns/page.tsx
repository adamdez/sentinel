"use client";

import { useEffect, useState } from "react";
import { Megaphone, Loader2, Inbox } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  sent_count: number;
  response_count: number;
  created_at: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCampaigns() {
      setLoading(true);
      setError(null);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: fetchErr } = await (supabase.from("campaigns") as any)
          .select("id, name, campaign_type, status, sent_count, response_count, created_at")
          .order("created_at", { ascending: false });

        if (fetchErr) {
          console.error("[Campaigns] fetch error:", fetchErr);
          setError(fetchErr.message);
          return;
        }
        setCampaigns((data as Campaign[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchCampaigns();
  }, []);

  return (
    <PageShell
      title="Campaigns"
      description="Sentinel Campaigns — Multi-channel outreach automation"
    >
      {loading && (
        <div className="p-12 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading campaigns...
        </div>
      )}

      {error && (
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-foreground mb-2">Failed to load campaigns: {error}</p>
        </GlassCard>
      )}

      {!loading && !error && campaigns.length === 0 && (
        <GlassCard className="p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground mb-2">
            No campaigns configured.
          </p>
          <p className="text-xs text-muted-foreground/60 mb-4">
            Campaigns will appear here when the outbound pilot is activated.
          </p>
          <Link
            href="/settings/outbound-pilot"
            className="text-xs text-primary hover:underline"
          >
            Go to Outbound Pilot Settings &rarr;
          </Link>
        </GlassCard>
      )}

      {!loading && !error && campaigns.length > 0 && (
        <GlassCard hover={false}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Active Campaigns
            </h2>
          </div>
          <div className="overflow-hidden rounded-[12px] border border-glass-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Campaign</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Sent</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Responses</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Rate</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const rate = c.sent_count > 0 ? ((c.response_count / c.sent_count) * 100).toFixed(1) + "%" : "—";
                  return (
                    <tr key={c.id} className="border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                      <td className="p-3 text-sm font-medium">{c.name}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-sm">{c.campaign_type}</Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={c.status === "active" ? "neon" : "secondary"} className="text-sm">
                          {c.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm text-right tabular-nums">{c.sent_count}</td>
                      <td className="p-3 text-sm text-right tabular-nums">{c.response_count}</td>
                      <td className="p-3 text-sm text-right font-medium text-primary tabular-nums">{rate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </PageShell>
  );
}
