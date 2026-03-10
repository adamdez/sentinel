import { MapPin, AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ClientFileHeaderProps {
  ownerName: string;
  address: string;
  distressSignals: string[];
  suggestedOpener?: string;
}

export function ClientFileHeader({ ownerName, address, distressSignals, suggestedOpener }: ClientFileHeaderProps) {
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

      {/* Suggested Hook */}
      {suggestedOpener && (
        <div className="mt-4 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 relative overflow-hidden group">
          <div className="absolute inset-y-0 left-0 w-1 bg-purple-500/50" />
          <p className="text-[10px] text-purple-400/80 font-mono font-bold tracking-widest uppercase mb-1 flex items-center gap-1.5">
            <ShieldAlert className="w-3 h-3" /> Connect Hook
          </p>
          <p className="text-sm font-medium italic text-foreground/90 leading-relaxed max-w-2xl">
            "{suggestedOpener}"
          </p>
        </div>
      )}
    </div>
  );
}
