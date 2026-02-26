"use client";

import { motion } from "framer-motion";
import { Zap, Shield } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { DashboardGrid } from "@/components/sentinel/dashboard/dashboard-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSentinelStore } from "@/lib/store";
import { SCORING_MODEL_VERSION } from "@/lib/scoring";

export default function DashboardPage() {
  const { currentUser, ghostMode } = useSentinelStore();

  return (
    <PageShell
      title={`Welcome back, ${currentUser.name.split(" ")[0]}`}
      description="Sentinel command center — your personalized acquisition intelligence"
      actions={
        <div className="flex items-center gap-2">
          {ghostMode && (
            <Badge variant="outline" className="text-[10px] gap-1 border-yellow-500/30 text-yellow-400">
              Ghost Mode — activity not logged
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] gap-1">
            <Shield className="h-2.5 w-2.5" />
            {currentUser.role}
          </Badge>
          <Badge variant="neon" className="text-[10px] gap-1">
            <Zap className="h-2.5 w-2.5" />
            AI Model {SCORING_MODEL_VERSION}
          </Badge>
        </div>
      }
    >
      <DashboardGrid />
    </PageShell>
  );
}
