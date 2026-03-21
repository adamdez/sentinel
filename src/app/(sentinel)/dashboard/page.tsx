"use client";

import { Plus } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { DashboardGrid } from "@/components/sentinel/dashboard/dashboard-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSentinelStore } from "@/lib/store";
import { useModal } from "@/providers/modal-provider";

export default function DashboardPage() {
  const { currentUser, ghostMode } = useSentinelStore();
  const { openModal } = useModal();

  return (
    <PageShell
      title="Today"
      description={`${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2 text-xs" onClick={() => openModal("new-prospect")}>
            <Plus className="h-3 w-3" />
            Add Lead
          </Button>
          {ghostMode && (
            <Badge variant="outline" className="text-sm gap-1 border-border/30 text-foreground">
              Research Only
            </Badge>
          )}
        </div>
      }
    >
      <DashboardGrid />
    </PageShell>
  );
}
