"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  CalendarX,
  ClipboardCheck,
  BrainCircuit,
  AlertTriangle,
  Phone,
  RefreshCw,
  TrendingDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import type { DailyBriefResponse, BriefLead } from "@/app/api/leads/daily-brief/route";

// ─── Signal display config ───────────────────────────────────────────────────

const SIGNAL_META = {
  flagged_ai_output: {
    Icon: BrainCircuit,
    color: "text-foreground",
    bg: "bg-muted/8",
    border: "border-border/20",
    label: "AI Flagged",
  },
  overdue_task: {
    Icon: ClipboardCheck,
    color: "text-foreground",
    bg: "bg-muted/8",
    border: "border-border/20",
    label: "Overdue Task",
  },
  overdue_follow_up_lead: {
    Icon: CalendarX,
    color: "text-foreground",
    bg: "bg-muted/8",
    border: "border-border/20",
    label: "Follow-up Missed",
  },
  defaulted_callback: {
    Icon: AlertTriangle,
    color: "text-muted-foreground/50",
    bg: "bg-secondary/20",
    border: "border-glass-border",
    label: "No Date Set",
  },
} as const;

function openLead(leadId: string) {
  window.location.href = `/leads?open=${leadId}`;
}

function daysLabel(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "1d late";
  return `${days}d late`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ label, icon: Icon, color }: { label: string; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <Icon className={`h-2.5 w-2.5 ${color}`} />
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

function LeadRow({ lead, idx }: { lead: BriefLead; idx: number }) {
  const meta = SIGNAL_META[lead.signal];
  const days = daysLabel(lead.daysOverdue);

  return (
    <motion.button
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 + idx * 0.04 }}
      onClick={() => openLead(lead.leadId)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-[6px] border ${meta.bg} ${meta.border} hover:brightness-110 transition-all text-left`}
    >
      <meta.Icon className={`h-2.5 w-2.5 shrink-0 ${meta.color}`} />
      <span className="flex-1 truncate text-[11px]">{lead.label}</span>
      {lead.detail && (
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[30%] shrink-0">{lead.detail}</span>
      )}
      {days && (
        <span className={`text-[10px] font-semibold shrink-0 ${lead.daysOverdue && lead.daysOverdue > 0 ? meta.color : "text-muted-foreground/40"}`}>
          {days}
        </span>
      )}
    </motion.button>
  );
}

function SlippageBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground/40 text-[10px]">no data</span>;
  const color = pct >= 75 ? "bg-muted" : pct >= 40 ? "bg-muted" : "bg-muted";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-secondary/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-[11px] font-bold shrink-0 ${pct >= 75 ? "text-foreground" : pct >= 40 ? "text-foreground" : "text-foreground"}`}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DailyBrief() {
  const [data, setData] = useState<DailyBriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/leads/daily-brief", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Failed to load brief");
        return;
      }
      setData(await res.json());
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full rounded" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return <div className="text-center py-4 text-xs text-muted-foreground">{error ?? "No data"}</div>;
  }

  const { topCallbackSlippage, topOverdueLead, topOverdueTask, topFlaggedAiOutput, topAttentionLeads, dialerWindow } = data;
  const totalIssues = (topOverdueLead ? 1 : 0) + (topOverdueTask ? 1 : 0) + (topFlaggedAiOutput ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground/60">
          {dialerWindow.callsPublished} calls · {dialerWindow.tasksCreated} tasks · 30d window
        </p>
        <button
          onClick={load}
          className="text-muted-foreground/30 hover:text-muted-foreground transition-colors"
          title="Refresh brief"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Callback slippage */}
      <div>
        <SectionHeader label="Callback Slippage" icon={TrendingDown} color="text-foreground" />
        <div className="space-y-1">
          <SlippageBar pct={topCallbackSlippage.pct} />
          <p className="text-[10px] text-muted-foreground/60 leading-snug">{topCallbackSlippage.message}</p>
        </div>
      </div>

      {/* Top overdue follow-up */}
      <div>
        <SectionHeader label="Top Overdue Follow-up" icon={CalendarX} color="text-foreground" />
        {topOverdueLead ? (
          <LeadRow lead={topOverdueLead} idx={0} />
        ) : (
          <p className="text-[10px] text-muted-foreground/40 pl-1">No overdue follow-up leads.</p>
        )}
      </div>

      {/* Top overdue task */}
      <div>
        <SectionHeader label="Top Overdue Task" icon={ClipboardCheck} color="text-foreground" />
        {topOverdueTask ? (
          <LeadRow lead={topOverdueTask} idx={0} />
        ) : (
          <p className="text-[10px] text-muted-foreground/40 pl-1">No overdue tasks.</p>
        )}
      </div>

      {/* Top flagged AI */}
      <div>
        <SectionHeader label="AI Review Needed" icon={BrainCircuit} color="text-foreground" />
        {topFlaggedAiOutput ? (
          <LeadRow lead={topFlaggedAiOutput} idx={0} />
        ) : (
          <p className="text-[10px] text-muted-foreground/40 pl-1">No flagged AI outputs pending review.</p>
        )}
      </div>

      {/* Top 3 attention leads */}
      {topAttentionLeads.length > 0 && (
        <div>
          <SectionHeader label="Top Leads — Act Now" icon={Phone} color="text-primary-400" />
          <div className="space-y-1">
            {topAttentionLeads.map((lead, i) => (
              <LeadRow key={lead.leadId} lead={lead} idx={i} />
            ))}
          </div>
        </div>
      )}

      {totalIssues === 0 && topAttentionLeads.length === 0 && (
        <div className="text-center py-2 text-xs text-muted-foreground">
          Queue clear — no urgent issues detected.
        </div>
      )}
    </div>
  );
}
