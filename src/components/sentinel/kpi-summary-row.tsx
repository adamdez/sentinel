"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Layers,
  FileCheck,
  DollarSign,
  Phone,
  Clock3,
  AlertTriangle,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatPercent, type TimePeriod } from "@/lib/analytics";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────

interface KpiData {
  new_leads: number;
  qualified_leads: number;
  active_pipeline: number;
  offers_made: number;
  contracts_signed: number;
  deals_closed: number;
  total_revenue: number;
  avg_assignment_fee: number | null;
  contact_rate: number | null;
  contract_conversion_rate: number | null;
  close_rate: number | null;
  median_speed_to_lead_minutes: number | null;
  avg_days_lead_to_contract: number | null;
  overdue_tasks: number;
  tasks_due_today: number;
  tasks_completed_this_period: number;
  pipeline_by_stage: { stage: string; count: number }[];
  top_source: { name: string; leads: number } | null;
  source_count: number;
}

// ── Component ────────────────────────────────────────────────────────

export function KpiSummaryRow({ period }: { period: TimePeriod }) {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchKpis = useCallback(async () => {
    try {
      setError(false);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/analytics/kpi-summary?period=${period}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const payload = await res.json();
      setKpis(payload.kpis ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    fetchKpis();
  }, [fetchKpis]);

  if (loading) {
    return (
      <div className="rounded-[14px] border border-glass-border bg-glass/40 p-4">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading KPIs...
        </div>
      </div>
    );
  }

  if (error || !kpis) {
    return null;
  }

  // Build pipeline subtitle
  const pipelineSubtitle = (() => {
    const stages = kpis.pipeline_by_stage;
    const prospect = stages.find((s) => s.stage === "prospect")?.count ?? 0;
    const lead = stages.find((s) => s.stage === "lead")?.count ?? 0;
    const negotiation = stages.find((s) => s.stage === "negotiation")?.count ?? 0;
    const parts: string[] = [];
    if (prospect > 0) parts.push(`${prospect} prospect`);
    if (lead > 0) parts.push(`${lead} lead`);
    if (negotiation > 0) parts.push(`${negotiation} negotiation`);
    return parts.length > 0 ? parts.join(", ") : "No active leads";
  })();

  const cards: KpiCardProps[] = [
    {
      icon: Users,
      label: "New Leads",
      value: String(kpis.new_leads),
      subtitle: `${kpis.source_count} source${kpis.source_count !== 1 ? "s" : ""}`,
    },
    {
      icon: Layers,
      label: "Pipeline (Current)",
      value: String(kpis.active_pipeline),
      subtitle: pipelineSubtitle,
    },
    {
      icon: FileCheck,
      label: "Contracts",
      value: `${kpis.contracts_signed} of ${kpis.offers_made} offers`,
      subtitle: kpis.deals_closed > 0 ? `${kpis.deals_closed} closed` : null,
    },
    {
      icon: DollarSign,
      label: "Revenue",
      value: formatCurrency(kpis.total_revenue),
      subtitle: kpis.avg_assignment_fee != null ? `Avg fee ${formatCurrency(kpis.avg_assignment_fee)}` : null,
      tone: kpis.total_revenue > 0 ? "positive" : "default",
    },
    {
      icon: Phone,
      label: "Contact Rate",
      value: formatPercent(kpis.contact_rate),
      subtitle: null,
    },
    {
      icon: Clock3,
      label: "Speed to Lead",
      value: kpis.median_speed_to_lead_minutes != null ? `${kpis.median_speed_to_lead_minutes}m` : "n/a",
      subtitle: null,
    },
    {
      icon: AlertTriangle,
      label: "Overdue (Current)",
      value: String(kpis.overdue_tasks),
      subtitle: `${kpis.tasks_due_today} due today`,
      tone: kpis.overdue_tasks > 0 ? "danger" : "positive",
    },
    {
      icon: TrendingUp,
      label: "Close Rate",
      value: formatPercent(kpis.close_rate),
      subtitle: null,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {cards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      {kpis.overdue_tasks > 0 && (
        <Link href="/tasks" className="block">
          <div className="flex items-center gap-2 rounded-[10px] border border-border/30 bg-muted/[0.06] px-3 py-2 text-xs text-foreground hover:bg-muted/[0.1] transition-colors">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              {kpis.overdue_tasks} overdue follow-up task{kpis.overdue_tasks !== 1 ? "s" : ""} need attention
            </span>
            <span className="ml-auto text-foreground/70 text-sm">View Tasks &rarr;</span>
          </div>
        </Link>
      )}
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string | null;
  tone?: "default" | "positive" | "danger";
}

function KpiCard({ icon: Icon, label, value, subtitle, tone = "default" }: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-[12px] border px-3 py-2.5 bg-glass/40 transition-colors",
        tone === "default" && "border-glass-border",
        tone === "positive" && "border-border/25 bg-muted/[0.04]",
        tone === "danger" && "border-border/30 bg-muted/[0.06] shadow-[0_0_12px_rgba(239,68,68,0.08)]"
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-sm uppercase tracking-wider text-muted-foreground truncate">{label}</span>
      </div>
      <p className="text-sm font-semibold tabular-nums leading-tight">{value}</p>
      {subtitle && (
        <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
      )}
    </div>
  );
}
