import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TinaStageBlueprint } from "@/tina/types";

const STATUS_STYLES: Record<TinaStageBlueprint["status"], string> = {
  live: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
  next: "border-amber-300/20 bg-amber-300/10 text-amber-50",
  planned: "border-white/10 bg-white/5 text-zinc-100",
};

const STATUS_LABELS: Record<TinaStageBlueprint["status"], string> = {
  live: "Live now",
  next: "Next",
  planned: "Planned",
};

export function TinaStageCard({ stage }: { stage: TinaStageBlueprint }) {
  return (
    <Card className="h-full border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.32)]">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="text-base text-white">{stage.title}</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">{stage.summary}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
              STATUS_STYLES[stage.status]
            )}
          >
            {STATUS_LABELS[stage.status]}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Deliverable
          </p>
          <p className="mt-2 text-sm text-zinc-100">{stage.deliverable}</p>
        </div>
      </CardContent>
    </Card>
  );
}

