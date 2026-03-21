"use client";

import { Plus } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { DashboardGrid } from "@/components/sentinel/dashboard/dashboard-grid";
import { BreakingLeadsSidebar } from "@/components/sentinel/dashboard/breaking-leads-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSentinelStore } from "@/lib/store";
import { useModal } from "@/providers/modal-provider";

export default function DashboardPage() {
  const { currentUser, ghostMode } = useSentinelStore();
  const { openModal } = useModal();

  return (
    <PageShell
      title={`Welcome back, ${currentUser.name ? currentUser.name.split(" ")[0] : "..."}`}
      description="Sentinel command center — your personalized acquisition intelligence"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2 text-xs" onClick={() => openModal("new-prospect")}>
            <Plus className="h-3 w-3" />
            Add Lead
          </Button>
          {ghostMode && (
            <Badge variant="outline" className="text-[11px] gap-1 border-yellow-500/30 text-yellow-400">
              Ghost Mode — activity not logged
            </Badge>
          )}
        </div>
      }
    >
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <DashboardGrid />
        </div>
        <BreakingLeadsSidebar />
      </div>
    </PageShell>
  );
}
