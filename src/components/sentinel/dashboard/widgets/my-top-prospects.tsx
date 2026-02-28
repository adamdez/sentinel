"use client";

import { motion } from "framer-motion";
import { Phone } from "lucide-react";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProspects } from "@/hooks/use-prospects";
import type { AIScore } from "@/lib/types";

export function MyTopProspects() {
  const { prospects, loading } = useProspects({
    sortField: "composite_score",
    sortDir: "desc",
  });

  const top5 = prospects.slice(0, 5);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5">
            <Skeleton className="h-4 w-3" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-48" />
            </div>
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
    );
  }

  if (top5.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No prospects yet — leads will appear as Ranger Push ingests data.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {top5.map((prospect, i) => {
        const aiScore: AIScore = {
          composite: prospect.composite_score,
          motivation: prospect.motivation_score,
          equityVelocity: Math.round((prospect.equity_percent ?? 50) * 0.9),
          urgency: Math.min(prospect.composite_score + 5, 100),
          historicalConversion: Math.round(prospect.composite_score * 0.7),
          aiBoost: prospect.ai_boost,
          label: prospect.score_label,
        };

        const distressLabel =
          prospect.tags?.length > 0
            ? prospect.tags[0].replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
            : prospect.source ?? "Signal";

        return (
          <motion.div
            key={prospect.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-all group relative ${
              aiScore.label === "fire" ? "neon-glow" : ""
            }`}
            style={aiScore.label === "fire" ? {
              boxShadow: "0 0 15px rgba(0,255,136,0.12), inset 0 0 20px rgba(0,255,136,0.03)",
            } : {}}
          >
            <span className="text-[10px] text-muted-foreground font-mono w-3 shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-semibold truncate text-foreground"
                style={{
                  textShadow: "0 0 8px rgba(0,255,136,0.15), 0 0 16px rgba(0,255,136,0.06)",
                  WebkitFontSmoothing: "antialiased",
                }}
              >
                {prospect.owner_name}
              </p>
              <p
                className="text-[10px] font-medium text-muted-foreground/90 truncate"
                style={{ WebkitFontSmoothing: "antialiased" }}
              >
                {prospect.address}
                {prospect.city ? `, ${prospect.city}` : ""}
                {prospect.state ? ` ${prospect.state}` : ""}
              </p>
            </div>
            <Badge variant="outline" className="text-[9px] shrink-0 hidden sm:flex">
              {distressLabel}
            </Badge>
            <AIScoreBadge score={aiScore} size="sm" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <Phone className="h-3 w-3" />
            </Button>
          </motion.div>
        );
      })}
      <p className="text-[9px] text-muted-foreground text-center pt-1">
        Scored by Dominion Heat Score v1.1 — top {top5.length} of {prospects.length} prospects
      </p>
    </div>
  );
}
