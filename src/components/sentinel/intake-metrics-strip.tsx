"use client";

import { AlertCircle, CheckCircle2, XCircle, Clock } from "lucide-react";

interface IntakeMetricsStripProps {
  metrics: {
    total_pending: number;
    claimed_today: number;
    rejected_count: number;
    duplicate_count: number;
  };
}

export function IntakeMetricsStrip({ metrics }: IntakeMetricsStripProps) {
  const totalProcessed = metrics.claimed_today + metrics.rejected_count;
  const rejectionRate = totalProcessed > 0 ? Math.round((metrics.rejected_count / totalProcessed) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Pending Count */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Ready to Claim</p>
            <p className="text-3xl font-bold text-foreground mt-2">
              {metrics.total_pending}
            </p>
          </div>
          <Clock className="w-10 h-10 text-blue-500/20" />
        </div>
      </div>

      {/* Claimed Today */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Claimed Today</p>
            <p className="text-3xl font-bold text-foreground mt-2">
              {metrics.claimed_today}
            </p>
          </div>
          <CheckCircle2 className="w-10 h-10 text-green-500/20" />
        </div>
      </div>

      {/* Rejection Rate */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Rejection Rate</p>
            <p className="text-3xl font-bold text-foreground mt-2">
              {rejectionRate}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ({metrics.rejected_count} rejected)
            </p>
          </div>
          <XCircle className="w-10 h-10 text-red-500/20" />
        </div>
      </div>

      {/* Duplicates Detected */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Duplicates Detected</p>
            <p className="text-3xl font-bold text-foreground mt-2">
              {metrics.duplicate_count}
            </p>
          </div>
          <AlertCircle className="w-10 h-10 text-amber-500/20" />
        </div>
      </div>
    </div>
  );
}
