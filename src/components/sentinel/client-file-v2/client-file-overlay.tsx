"use client";

import { useEffect } from "react";
import { X, LayoutDashboard, Contact2, Map, Calculator, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useClientFileV2Store } from "@/stores/use-client-file-v2-store";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "contact", label: "Contact", icon: Contact2 },
  { id: "comps", label: "Comps & ARV", icon: Map },
  { id: "calculator", label: "Deal Calculator", icon: Calculator },
  { id: "documents", label: "Documents / PSA", icon: FileText },
] as const;

export function ClientFileOverlay() {
  const { isOverlayOpen, activeLeadId, activeTab, closeOverlay, setTab } = useClientFileV2Store();

  // Prevent background scrolling when open
  useEffect(() => {
    if (isOverlayOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [isOverlayOpen]);

  if (!isOverlayOpen) return null;

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeOverlay}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      />
      
      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, x: "100%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed inset-y-2 right-2 z-50 w-full max-w-[1200px] bg-background/95 border border-overlay-10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header - Modularized */}
        <div className="flex-none p-6 border-b border-overlay-10 flex justify-between items-start bg-secondary/10">
          <div>
            <h2 className="text-2xl font-bold font-mono">Client File V2</h2>
            <p className="text-muted-foreground mt-1">Lead ID: {activeLeadId}</p>
          </div>
          <button onClick={closeOverlay} className="p-2 bg-overlay-5 hover:bg-overlay-10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex-none border-b border-overlay-10 px-6 pt-4 flex gap-6 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 pb-3 px-1 border-b-2 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary-500 text-primary-500"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="text-center text-muted-foreground py-12">
            <p>The {activeTab} content will be loaded here from modular components.</p>
            <p className="text-xs mt-2">No more monolithic files!</p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
