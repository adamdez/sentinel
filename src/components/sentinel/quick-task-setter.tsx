"use client";

import { useCallback, useMemo, useState } from "react";
import { Pin, Calendar as CalendarIcon, X, Loader2 } from "lucide-react";
import { format, addDays, startOfTomorrow, nextMonday, setHours, setMinutes } from "date-fns";

// ── Types ────────────────────────────────────────────────────────────

export const TASK_TYPES = [
  { id: "callback", label: "Call Back" },
  { id: "send_offer", label: "Send Offer" },
  { id: "send_comps", label: "Send Comps" },
  { id: "research", label: "Research" },
  { id: "follow_up", label: "Follow Up" },
  { id: "other", label: "Other" },
] as const;

export type TaskTypeId = (typeof TASK_TYPES)[number]["id"];

const WHEN_OPTIONS = [
  { id: "today", label: "Today", resolve: () => new Date() },
  { id: "tomorrow", label: "Tomorrow", resolve: () => startOfTomorrow() },
  { id: "in_3_days", label: "In 3 Days", resolve: () => addDays(new Date(), 3) },
  { id: "next_week", label: "Next Week", resolve: () => nextMonday(new Date()) },
] as const;

const TIME_OPTIONS = [
  { id: "9am", label: "9am", hours: 9, minutes: 0 },
  { id: "12pm", label: "12pm", hours: 12, minutes: 0 },
  { id: "2pm", label: "2pm", hours: 14, minutes: 0 },
  { id: "5pm", label: "5pm", hours: 17, minutes: 0 },
] as const;

export interface QuickTaskResult {
  taskType: TaskTypeId;
  title: string;
  dueAt: string; // ISO
  notes: string;
}

interface QuickTaskSetterProps {
  onSave: (result: QuickTaskResult) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  /** Pre-select a task type (e.g. "callback" from dialer) */
  defaultType?: TaskTypeId;
  /** Compact mode hides the header */
  compact?: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export function QuickTaskSetter({
  onSave,
  onCancel,
  saving = false,
  defaultType,
  compact = false,
}: QuickTaskSetterProps) {
  const [taskType, setTaskType] = useState<TaskTypeId | null>(defaultType ?? null);
  const [whenId, setWhenId] = useState<string | null>(null);
  const [timeId, setTimeId] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [notes, setNotes] = useState("");

  const typeLabel = useMemo(
    () => TASK_TYPES.find((t) => t.id === taskType)?.label ?? "",
    [taskType],
  );

  const resolvedDueAt = useMemo(() => {
    let base: Date | null = null;

    if (whenId === "custom") {
      if (!customDate) return null;
      base = new Date(customDate + "T00:00:00");
    } else {
      const opt = WHEN_OPTIONS.find((w) => w.id === whenId);
      if (opt) base = opt.resolve();
    }

    if (!base) return null;

    if (timeId === "custom") {
      if (customTime) {
        const [h, m] = customTime.split(":").map(Number);
        base = setHours(setMinutes(base, m ?? 0), h ?? 9);
      }
    } else {
      const tOpt = TIME_OPTIONS.find((t) => t.id === timeId);
      if (tOpt) {
        base = setHours(setMinutes(base, tOpt.minutes), tOpt.hours);
      } else {
        base = setHours(setMinutes(base, 0), 9);
      }
    }

    return base;
  }, [whenId, timeId, customDate, customTime]);

  const title = useMemo(() => {
    if (!taskType || !resolvedDueAt) return "";
    const dateStr = format(resolvedDueAt, "EEE M/d");
    const timeStr = format(resolvedDueAt, "h:mmaaa");
    return `${typeLabel} — ${dateStr} ${timeStr}`;
  }, [taskType, typeLabel, resolvedDueAt]);

  const canSave = taskType && resolvedDueAt && !saving;

  const handleSave = useCallback(() => {
    if (!taskType || !resolvedDueAt) return;
    onSave({
      taskType,
      title,
      dueAt: resolvedDueAt.toISOString(),
      notes: notes.trim(),
    });
  }, [taskType, resolvedDueAt, title, notes, onSave]);

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none border ${
      active
        ? "bg-primary/20 border-primary/40 text-primary-300 shadow-sm"
        : "bg-overlay-3 border-overlay-6 text-muted-foreground/70 hover:border-white/[0.14] hover:text-foreground/80"
    }`;

  const minDate = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary/70">
            <Pin className="h-3.5 w-3.5" /> Set Task
          </h4>
          <button onClick={onCancel} className="text-muted-foreground/40 hover:text-foreground/60">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Task type chips */}
      <div className="flex flex-wrap gap-1.5">
        {TASK_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTaskType(t.id)}
            className={chipClass(taskType === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* When chips */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-1.5">When?</p>
        <div className="flex flex-wrap gap-1.5">
          {WHEN_OPTIONS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => { setWhenId(w.id); setCustomDate(""); }}
              className={chipClass(whenId === w.id)}
            >
              {w.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setWhenId("custom")}
            className={chipClass(whenId === "custom")}
          >
            <CalendarIcon className="h-3 w-3 inline mr-1" />
            Pick Date
          </button>
        </div>
        {whenId === "custom" && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            min={minDate}
            style={{ colorScheme: "dark" }}
            className="mt-1.5 w-44 rounded-lg border border-overlay-6 bg-overlay-3 px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
          />
        )}
      </div>

      {/* Time chips */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-1.5">Time?</p>
        <div className="flex flex-wrap gap-1.5">
          {TIME_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTimeId(t.id); setCustomTime(""); }}
              className={chipClass(timeId === t.id)}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTimeId("custom")}
            className={chipClass(timeId === "custom")}
          >
            Pick Time
          </button>
        </div>
        {timeId === "custom" && (
          <input
            type="time"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            style={{ colorScheme: "dark" }}
            className="mt-1.5 w-32 rounded-lg border border-overlay-6 bg-overlay-3 px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
          />
        )}
      </div>

      {/* Optional note */}
      <div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note..."
          maxLength={300}
          className="w-full rounded-lg border border-overlay-6 bg-overlay-3 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20"
        />
      </div>

      {/* Preview title */}
      {title && (
        <p className="text-[11px] text-muted-foreground/50 truncate">
          → {title}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground/60 hover:text-foreground/80 border border-overlay-6 bg-overlay-3 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pin className="h-3 w-3" />}
          Save
        </button>
      </div>
    </div>
  );
}
