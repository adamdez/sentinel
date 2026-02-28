"use client";

import dynamic from "next/dynamic";
import { LayoutGrid } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const DashboardGridInner = dynamic(
  () => import("./dashboard-grid-inner").then((m) => m.DashboardGridInner),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-cyan" />
          <span className="text-sm font-semibold">Your Dashboard</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-52 rounded-[14px] bg-glass border border-glass-border"
            />
          ))}
        </div>
      </div>
    ),
  }
);

export function DashboardGrid() {
  return <DashboardGridInner />;
}
