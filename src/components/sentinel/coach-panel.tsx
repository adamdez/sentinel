"use client";

import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  HelpCircle,
  X,
  ShieldAlert,
  Lightbulb,
  ClipboardList,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useCoach } from "@/providers/coach-provider";
import { resolveBody } from "@/lib/coach-engine";
import type { CoachItem, CoachItemType, CoachContext } from "@/lib/coach-types";

// ── Type badge config ──
const TYPE_CONFIG: Record<
  CoachItemType,
  { label: string; className: string }
> = {
  hard_rule: {
    label: "Rule",
    className:
      "bg-muted/20 text-foreground border border-border/30",
  },
  recommended: {
    label: "Recommended",
    className:
      "bg-muted/20 text-foreground border border-border/30",
  },
  suggestion: {
    label: "Suggestion",
    className:
      "bg-muted/20 text-foreground border border-border/30",
  },
};

// ── Category styling ──
const CATEGORY_STYLE: Record<
  string,
  { icon: React.ReactNode; borderColor: string }
> = {
  blocker: {
    icon: <ShieldAlert className="h-3.5 w-3.5 text-foreground shrink-0" />,
    borderColor: "border-l-foreground/50",
  },
  next_step: {
    icon: <Lightbulb className="h-3.5 w-3.5 text-foreground shrink-0" />,
    borderColor: "border-l-muted-foreground/40",
  },
  explainer: {
    icon: <BookOpen className="h-3.5 w-3.5 text-foreground shrink-0" />,
    borderColor: "border-l-border",
  },
  tip: {
    icon: <ClipboardList className="h-3.5 w-3.5 text-primary shrink-0" />,
    borderColor: "border-l-primary/40",
  },
};

// ── Surface labels ──
const SURFACE_LABELS: Record<string, string> = {
  lead_detail: "Lead Detail",
  lead_detail_closeout: "Log Outcome",
  pipeline: "Active",
  leads_inbox: "Lead Inbox",
  dialer: "Dialer",
  import: "Import",
};

// ── Individual coach card ──
function CoachCard({
  item,
  context,
}: {
  item: CoachItem;
  context: CoachContext;
}) {
  const typeConf = TYPE_CONFIG[item.type];
  const catStyle = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE.explainer;
  const bodyText = resolveBody(item, context);

  return (
    <div
      className={`border-l-2 ${catStyle.borderColor} bg-muted/30 rounded-r-md px-3 py-2.5 space-y-1.5`}
    >
      <div className="flex items-start gap-2">
        {catStyle.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground leading-tight">
              {item.title}
            </span>
            <span
              className={`text-sm font-medium px-1.5 py-0.5 rounded-full leading-none ${typeConf.className}`}
            >
              {typeConf.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {bodyText}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ──
function CoachSection({
  title,
  items,
  context,
  defaultOpen = true,
}: {
  title: string;
  items: CoachItem[];
  context: CoachContext;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left group"
      >
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </span>
        <span className="text-sm text-muted-foreground/70 font-medium">
          ({items.length})
        </span>
        {open ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground ml-auto" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
        )}
      </button>
      {open && (
        <div className="space-y-1.5">
          {items.map((item) => (
            <CoachCard key={item.id} item={item} context={context} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Toggle button (floating ? icon) ──
export function CoachToggle({ className = "" }: { className?: string }) {
  const { togglePanel, panelOpen } = useCoach();

  return (
    <button
      onClick={togglePanel}
      className={`
        flex items-center justify-center
        w-8 h-8 rounded-full
        bg-overlay-6 hover:bg-overlay-12
        border border-overlay-8 hover:border-overlay-15
        text-muted-foreground hover:text-foreground
        transition-all duration-200
        ${panelOpen ? "bg-primary/10 text-primary border-primary/20" : ""}
        ${className}
      `}
      title={panelOpen ? "Close Coach" : "Open Coach"}
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  );
}

// ── Main panel component ──
export function CoachPanel({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "modal";
}) {
  const { panelOpen, togglePanel, surface, context, output } = useCoach();
  const totalItems =
    output.blockers.length +
    output.nextSteps.length +
    output.explainers.length +
    output.tips.length;

  // Escape key to close
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") togglePanel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panelOpen, togglePanel]);

  const surfaceLabel = SURFACE_LABELS[surface] ?? surface;
  const leadAddress = context.lead?.address;

  return (
    <AnimatePresence>
      {panelOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={`
            shrink-0 overflow-hidden
            ${variant === "modal" ? "border-l border-overlay-6" : ""}
          `}
        >
          <div
            className={`
              w-[280px] h-full flex flex-col
              bg-card/95 backdrop-blur-xl
              ${variant === "sidebar" ? "border-l border-overlay-6" : ""}
            `}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-overlay-6">
              <div className="flex items-center gap-2 min-w-0">
                <HelpCircle className="h-4 w-4 text-primary-400/60 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate">
                    Coach
                    <span className="text-muted-foreground font-normal ml-1.5">
                      {surfaceLabel}
                    </span>
                  </div>
                  {leadAddress && (
                    <div className="text-sm text-muted-foreground truncate">
                      {leadAddress}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={togglePanel}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin">
              {totalItems === 0 ? (
                <div className="text-center py-8">
                  <HelpCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No guidance for this view right now.
                  </p>
                </div>
              ) : (
                <>
                  <CoachSection
                    title="Blockers"
                    items={output.blockers}
                    context={context}
                    defaultOpen={true}
                  />
                  <CoachSection
                    title="What to do next"
                    items={output.nextSteps}
                    context={context}
                    defaultOpen={true}
                  />
                  <CoachSection
                    title="Tips"
                    items={output.tips}
                    context={context}
                    defaultOpen={true}
                  />
                  <CoachSection
                    title="About this surface"
                    items={output.explainers}
                    context={context}
                    defaultOpen={false}
                  />
                </>
              )}
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
