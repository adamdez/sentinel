"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Zap, ArrowRight, Phone, Clock, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProspects } from "@/hooks/use-prospects";
import { useLeads } from "@/hooks/use-leads";

function GlowingOrb() {
  return (
    <div className="relative flex items-center justify-center">
      <motion.div
        className="absolute h-8 w-8 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,212,255,0.4) 0%, rgba(0,212,255,0.1) 50%, transparent 70%)",
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute h-5 w-5 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,212,255,0.6) 0%, rgba(0,212,255,0.2) 60%, transparent 80%)",
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
      />
      <Zap className="h-3.5 w-3.5 text-cyan relative z-10" style={{ filter: "drop-shadow(0 0 4px rgba(0,212,255,0.6))" }} />
    </div>
  );
}

export function NextBestAction() {
  const { prospects, loading: prospectsLoading } = useProspects({
    sortField: "composite_score",
    sortDir: "desc",
  });
  const { leads, loading: leadsLoading } = useLeads();

  const loading = prospectsLoading || leadsLoading;

  const { primary, secondary, hasPredictive } = useMemo(() => {
    const now = new Date();

    // Sort overdue leads by blended predictive priority (higher = more urgent)
    const overdue = leads
      .filter((l) => l.followUpDate && new Date(l.followUpDate) < now)
      .sort((a, b) => b.predictivePriority - a.predictivePriority);

    if (overdue.length > 0) {
      const top = overdue[0];
      const daysOverdue = Math.floor((now.getTime() - new Date(top.followUpDate!).getTime()) / 86400000);
      const predLabel = top.predictivePriority > top.score.composite ? " [AI-boosted]" : "";
      return {
        primary: {
          name: top.ownerName,
          reason: `Follow-up ${daysOverdue}d overdue — predictive priority ${top.predictivePriority} (${top.score.label.toUpperCase()})${predLabel}. ${top.status} stage.`,
          action: "Call Now",
        },
        secondary: overdue[1]
          ? `Next: Follow up with ${overdue[1].ownerName} (priority ${overdue[1].predictivePriority} — ${overdue[1].status})`
          : prospects.length > 0
            ? `Next: Contact new prospect ${prospects[0].owner_name} (scored ${prospects[0].composite_score})`
            : null,
        hasPredictive: top.predictivePriority !== top.score.composite,
      };
    }

    // Sort all leads by predictive priority
    const ranked = [...leads].sort((a, b) => b.predictivePriority - a.predictivePriority);
    const topLead = ranked[0];
    if (topLead) {
      const predLabel = topLead.predictivePriority > topLead.score.composite ? " [AI-boosted]" : "";
      return {
        primary: {
          name: topLead.ownerName,
          reason: `Highest-priority ${topLead.status} lead — predictive priority ${topLead.predictivePriority} (${topLead.score.label.toUpperCase()})${predLabel}. ${topLead.address}.`,
          action: "Call Now",
        },
        secondary: ranked[1]
          ? `Next: ${ranked[1].ownerName} — ${ranked[1].status} (priority ${ranked[1].predictivePriority})`
          : null,
        hasPredictive: topLead.predictivePriority !== topLead.score.composite,
      };
    }

    const topProspect = prospects[0];
    if (topProspect) {
      return {
        primary: {
          name: topProspect.owner_name,
          reason: `New FIRE prospect scored ${topProspect.composite_score} — ${topProspect.address}. First-to-contact window open.`,
          action: "Call Now",
        },
        secondary: prospects[1]
          ? `Next: Contact ${prospects[1].owner_name} (scored ${prospects[1].composite_score})`
          : null,
        hasPredictive: false,
      };
    }

    return { primary: null, secondary: null, hasPredictive: false };
  }, [prospects, leads]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-[12px] bg-cyan/4 border border-cyan/12">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-4 w-40 mb-1" />
          <Skeleton className="h-3 w-56 mb-2.5" />
          <div className="flex gap-2">
            <Skeleton className="h-7 flex-1" />
            <Skeleton className="h-7 w-20" />
          </div>
        </div>
      </div>
    );
  }

  if (!primary) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-[12px] bg-cyan/4 border border-cyan/12 text-center">
          <Zap className="h-6 w-6 text-cyan mx-auto mb-2" style={{ filter: "drop-shadow(0 0 4px rgba(0,212,255,0.6))" }} />
          <p className="text-xs text-muted-foreground">
            No actions queued — waiting for new leads to flow in from Ranger Push.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-[12px] bg-cyan/4 border border-cyan/12 relative overflow-hidden"
      >
        <div
          className="absolute top-0 right-0 w-24 h-24 pointer-events-none"
          style={{
            background: "radial-gradient(circle at top right, rgba(0,212,255,0.06) 0%, transparent 70%)",
          }}
        />
        <div className="flex items-center gap-2 mb-2">
          <GlowingOrb />
          <span className="text-[10px] font-semibold text-cyan uppercase tracking-wider">
            AI Recommendation
          </span>
          {hasPredictive && (
            <span className="flex items-center gap-0.5 text-[9px] text-purple-400 font-medium">
              <Brain className="h-2.5 w-2.5" />
              Predictive
            </span>
          )}
        </div>
        <p className="text-xs font-medium mb-1">
          {primary.action === "Call Now" ? "Call" : "Contact"} {primary.name} now
        </p>
        <p className="text-[10px] text-muted-foreground mb-2.5">
          {primary.reason}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 text-[10px] gap-1 flex-1">
            <Phone className="h-3 w-3" />
            {primary.action}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
            <Clock className="h-3 w-3" />
            Snooze
          </Button>
        </div>
      </motion.div>

      {secondary && (
        <div className="text-[9px] text-muted-foreground flex items-center gap-1">
          <ArrowRight className="h-2.5 w-2.5" />
          {secondary}
        </div>
      )}
    </div>
  );
}
