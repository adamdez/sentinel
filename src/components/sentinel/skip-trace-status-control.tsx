"use client";

import { Loader2, Search, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkipTraceUiState } from "@/components/sentinel/master-client-file-helpers";

type SkipTraceControlSize = "sm" | "md";

function getSkipTraceControlConfig(status: SkipTraceUiState) {
  if (status === "skipped") {
    return {
      label: "Skipped",
      icon: CheckCircle2,
      className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
      actionable: false,
    };
  }

  if (status === "skip_empty") {
    return {
      label: "Skipped",
      icon: CheckCircle2,
      className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
      actionable: false,
    };
  }

  if (status === "skip_failed") {
    return {
      label: "Skip Failed",
      icon: AlertCircle,
      className: "border-red-500/25 bg-red-500/10 text-red-300",
      actionable: true,
    };
  }

  return {
    label: "Skip Trace",
    icon: Search,
    className: "border-red-500/25 bg-red-500/10 text-red-300",
    actionable: true,
  };
}

export function SkipTraceStatusControl({
  status,
  onClick,
  loading = false,
  size = "md",
  className,
  disabled = false,
}: {
  status: SkipTraceUiState;
  onClick?: () => void;
  loading?: boolean;
  size?: SkipTraceControlSize;
  className?: string;
  disabled?: boolean;
}) {
  const cfg = getSkipTraceControlConfig(status);
  const Icon = loading ? Loader2 : cfg.icon;
  const isCompact = size === "sm";
  const label = loading ? "Skipping..." : cfg.label;
  const classes = cn(
    "inline-flex items-center rounded-md border font-semibold transition-colors",
    isCompact ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-1.5 px-3 py-1.5 text-xs",
    cfg.className,
    className,
  );

  if (cfg.actionable && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={loading || disabled}
        className={cn(classes, "hover:bg-opacity-80 disabled:opacity-60")}
      >
        <Icon className={cn(isCompact ? "h-3 w-3" : "h-3.5 w-3.5", loading && "animate-spin")} />
        {label}
      </button>
    );
  }

  return (
    <span className={classes}>
      <Icon className={cn(isCompact ? "h-3 w-3" : "h-3.5 w-3.5", loading && "animate-spin")} />
      {label}
    </span>
  );
}
