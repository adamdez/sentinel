"use client";

import { useState } from "react";
import { Search, Plus, Filter, AlertTriangle, Target, Home, Map as MapIcon, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useClientFileV2Store } from "@/stores/use-client-file-v2-store";
import { ClientFileOverlay } from "@/components/sentinel/client-file-v2/client-file-overlay";

// Stub data simulating discovered properties
const DISCOVERED_PROPERTIES = [
  { id: "prop-1", apn: "100-234-A", address: "1424 E Oak St, Spokane, WA", expectedEquity: "65%", distress: ["tax_lien", "vacant"], label: "High Priority" },
  { id: "prop-2", apn: "100-555-B", address: "912 N Ash St, Spokane, WA", expectedEquity: "100%", distress: ["pre_foreclosure"], label: "Imminent" },
  { id: "prop-3", apn: "100-999-C", address: "405 W Main Ave, Spokane, WA", expectedEquity: "42%", distress: ["absentee", "tired_landlord"], label: "Nurture" },
];

export default function DiscoveryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { openLead } = useClientFileV2Store();

  return (
    <div className="p-8 max-w-[1600px] mx-auto min-h-screen flex flex-col">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black font-mono tracking-tight flex items-center gap-3">
            <Target className="w-8 h-8 text-cyan-400" /> Discovery Engine
          </h1>
          <p className="text-muted-foreground mt-2">Find and import wholesale-eligible properties.</p>
        </div>
        
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search APN, Address, or Owner..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-secondary/20 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500/50 w-80 font-mono text-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-secondary/30 border border-white/10 hover:bg-secondary/50 rounded-lg text-sm font-medium transition-colors">
            <Filter className="w-4 h-4" /> Filters
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Discovered List */}
        <div className="col-span-1 border border-white/10 bg-secondary/10 rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/10 bg-black/20 flex justify-between items-center">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Prospecting Radar</h2>
            <Badge variant="outline" className="text-cyan-400 border-cyan-500/30">3 Found</Badge>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {DISCOVERED_PROPERTIES.map((prop) => (
              <div key={prop.id} className="p-4 rounded-lg bg-white/5 border border-white/5 hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer group" onClick={() => openLead(prop.id)}>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground group-hover:text-cyan-400 transition-colors uppercase">APN: {prop.apn}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider ${prop.label === 'Imminent' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-muted-foreground'}`}>
                    {prop.label}
                  </span>
                </div>
                <h3 className="font-semibold text-sm mb-3 flex items-start gap-2 max-w-[90%]">
                  <Home className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  {prop.address}
                </h3>
                
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
                  <div className="flex flex-wrap gap-1.5">
                    {prop.distress.map(d => (
                      <span key={d} className="text-[9px] uppercase tracking-widest font-semibold text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> {d.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Est. Equity</p>
                    <p className="text-sm font-bold font-mono text-emerald-400">{prop.expectedEquity}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Map / Visualization Area */}
        <div className="col-span-2 border border-white/10 bg-black/40 rounded-xl relative flex flex-col items-center justify-center p-12 text-center overflow-hidden">
          <MapIcon className="w-24 h-24 text-white/5 mb-6" />
          <h2 className="text-xl font-bold mb-2">Geospatial Discovery</h2>
          <p className="text-muted-foreground max-w-lg mb-8">
            Select a property from the radar to inspect its geospatial signals, or use the lasso tool to define a search radius for wholesaling opportunities.
          </p>
          
          <button className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold transition-colors">
            Run Macro-Market Scan <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* The Global Overlay */}
      <ClientFileOverlay />
    </div>
  );
}
