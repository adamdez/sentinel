"use client";

import { Share2, Facebook, Globe, Eye, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const listings = [
  {
    platform: "Facebook",
    title: "Motivated Seller — 3BR Phoenix",
    status: "Active",
    views: 234,
    messages: 8,
    posted: "2 days ago",
  },
  {
    platform: "Craigslist",
    title: "Cash Buyer Looking for Deals — Maricopa",
    status: "Active",
    views: 156,
    messages: 3,
    posted: "5 days ago",
  },
  {
    platform: "Facebook",
    title: "We Buy Houses — Any Condition",
    status: "Expired",
    views: 890,
    messages: 22,
    posted: "14 days ago",
  },
];

export default function FacebookCraigslistPage() {
  return (
    <PageShell
      title="Facebook / Craigslist"
      description="Sentinel Social — Marketplace listing management and lead capture"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <RefreshCw className="h-3 w-3" />
            Sync
          </Button>
          <Button size="sm" className="gap-2 text-xs">
            <Plus className="h-3 w-3" />
            New Listing
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 mb-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-[12px] bg-blue-500/10">
              <Facebook className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Facebook Marketplace</p>
              <p className="text-xs text-muted-foreground">2 active listings</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> 1,124 views</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> 30 messages</span>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-[12px] bg-orange-500/10">
              <Globe className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Craigslist</p>
              <p className="text-xs text-muted-foreground">1 active listing</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> 156 views</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> 3 messages</span>
          </div>
        </GlassCard>
      </div>

      <GlassCard hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Share2 className="h-4 w-4 text-cyan" />
            All Listings
          </h2>
        </div>
        <div className="space-y-2">
          {listings.map((listing) => (
            <div
              key={listing.title}
              className="flex items-center gap-4 p-3 rounded-[12px] bg-secondary/20 hover:bg-secondary/30 transition-colors"
            >
              <Badge variant="outline" className="text-[10px] shrink-0">
                {listing.platform}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{listing.title}</p>
                <p className="text-xs text-muted-foreground">{listing.posted}</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {listing.views}</span>
                <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {listing.messages}</span>
              </div>
              <Badge
                variant={listing.status === "Active" ? "neon" : "secondary"}
                className="text-[10px] shrink-0"
              >
                {listing.status}
              </Badge>
            </div>
          ))}
        </div>
        {/* TODO: Auto-post to Facebook Marketplace API */}
        {/* TODO: Craigslist posting automation */}
        {/* TODO: Inbound message parsing → prospect creation */}
      </GlassCard>
    </PageShell>
  );
}
