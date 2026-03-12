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
    border: "border-red-500/25",
    bg: "bg-red-500/[0.06]",
    accent: "bg-red-500/50",
    label: "text-red-400/80",
    text: "text-red-300",
    icon: AlertTriangle,
  },
  high: {
    border: "border-amber-500/25",
    bg: "bg-amber-500/[0.06]",
    accent: "bg-amber-500/50",
    label: "text-amber-400/80",
    text: "text-amber-300",
    icon: AlertCircle,
  },
  normal: {
    border: "border-cyan/20",
    bg: "bg-cyan/[0.03]",
    accent: "bg-cyan/40",
    label: "text-cyan/70",
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
            <Badge key={signal} variant="destructive" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 shadow-none border-red-500/20 py-1 flex items-center gap-1.5">
               <AlertTriangle className="w-3 h-3"/>
               {signal.replace("_", " ").toUpperCase()}
            </Badge>
          ))}
          {distressSignals.length === 0 && (
            <Badge variant="outline" className="text-muted-foreground border-white/10">No Active Distress</Badge>
          )}
        </div>
      </div>

      {/* Action Banner — compact urgency line from deriveLeadActionSummary */}
      {showAction && style && (
        <div className={`p-3 rounded-xl border ${style.border} ${style.bg} relative overflow-hidden`}>
          <div className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} />
          <div className="flex items-center gap-2 pl-2">
            <style.icon className={`w-3.5 h-3.5 ${style.label} shrink-0`} />
            <span className={`text-sm font-semibold ${style.text}`}>
              {actionSummary!.action}
            </span>
          </div>
          <p className={`text-[11px] ${style.label} pl-7 mt-0.5 leading-snug`}>
            {actionSummary!.reason}
          </p>
        </div>
      )}

      {/* Suggested Hook */}
      {suggestedOpener && (
        <div className="mt-4 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 relative overflow-hidden group">
          <div className="absolute inset-y-0 left-0 w-1 bg-purple-500/50" />
          <p className="text-[10px] text-purple-400/80 font-mono font-bold tracking-widest uppercase mb-1 flex items-center gap-1.5">
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
