import { MapPin, AlertTriangle, ShieldAlert, AlertCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ActionSummary } from "@/lib/action-derivation";

interface ClientFileHeaderProps {
  ownerName: string;
  address: string;
  distressSignals: string[];
  suggestedOpener?: string;
  /** Optional action summary from deriveLeadActionSummary() */
  actionSummary?: ActionSummary | null;
}

const URGENCY_STYLES = {
  critical: {
    border: "border-border/25",
    bg: "bg-muted/[0.06]",
    accent: "bg-muted/50",
    label: "text-foreground/80",
    text: "text-foreground",
    icon: AlertTriangle,
  },
  high: {
    border: "border-border/25",
    bg: "bg-muted/[0.06]",
    accent: "bg-muted/50",
    label: "text-foreground/80",
    text: "text-foreground",
    icon: AlertCircle,
  },
  normal: {
    border: "border-primary/20",
    bg: "bg-primary/[0.03]",
    accent: "bg-primary/40",
    label: "text-primary/70",
    text: "text-foreground/70",
    icon: Clock,
  },
} as const;

export function ClientFileHeader({ ownerName, address, distressSignals, suggestedOpener, actionSummary }: ClientFileHeaderProps) {
  const showAction = actionSummary?.isActionable && actionSummary.urgency !== "none" && actionSummary.urgency !== "low";
  const style = showAction ? URGENCY_STYLES[actionSummary!.urgency as keyof typeof URGENCY_STYLES] : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Primary Info */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{ownerName}</h1>
          <div className="flex items-center gap-2 text-muted-foreground mt-1">
            <MapPin className="w-4 h-4" />
            <span className="font-mono text-sm">{address}</span>
          </div>
        </div>

        {/* Distress Badges */}
        <div className="flex flex-col gap-2 items-end">
          {distressSignals.map((signal) => (
            <Badge key={signal} variant="destructive" className="bg-muted/10 text-foreground hover:bg-muted/20 shadow-none border-border/20 py-1 flex items-center gap-1.5">
               <AlertTriangle className="w-3 h-3"/>
               {signal.replace("_", " ").toUpperCase()}
            </Badge>
          ))}
          {distressSignals.length === 0 && (
            <Badge variant="outline" className="text-muted-foreground border-overlay-10">No Active Distress</Badge>
          )}
        </div>
      </div>

      {/* Action Banner — compact urgency line from deriveLeadActionSummary */}
      {showAction && style && (
        <div className={`p-2.5 rounded-xl border ${style.border} ${style.bg} relative overflow-hidden`}>
          <div className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} />
          <div className="flex items-center gap-2 pl-2">
            <style.icon className={`w-3.5 h-3.5 ${style.label} shrink-0`} />
            <span className={`text-sm font-semibold ${style.text}`}>
              Do now · {actionSummary!.action}
            </span>
          </div>
        </div>
      )}

      {/* Suggested Hook */}
      {suggestedOpener && (
        <div className="mt-4 p-4 rounded-xl border border-border/20 bg-muted/5 relative overflow-hidden group">
          <div className="absolute inset-y-0 left-0 w-1 bg-muted/50" />
          <p className="text-sm text-foreground/80 font-mono font-bold tracking-widest uppercase mb-1 flex items-center gap-1.5">
            <ShieldAlert className="w-3 h-3" /> Connect Hook
          </p>
          <p className="text-sm font-medium italic text-foreground/90 leading-relaxed max-w-2xl">
            &ldquo;{suggestedOpener}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
