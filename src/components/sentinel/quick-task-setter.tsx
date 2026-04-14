"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarClock, Loader2, Pin, X } from "lucide-react";
import { addDays, format } from "date-fns";

export const TASK_TYPES = [
  { id: "callback", label: "Call Back" },
  { id: "follow_up", label: "Follow Up" },
  { id: "drive_by", label: "Drive By" },
  { id: "send_offer", label: "Send Offer" },
  { id: "send_comps", label: "Send Comps" },
  { id: "research", label: "Research" },
  { id: "other", label: "Other" },
] as const;

export type TaskTypeId = (typeof TASK_TYPES)[number]["id"];
type WhenOptionId = "today" | "tomorrow" | "in_3_days" | "next_week";

export interface QuickTaskResult {
  taskType: TaskTypeId;
  title: string;
  dueAt: string;
  notes: string;
}

interface QuickTaskSetterProps {
  onSave: (result: QuickTaskResult) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  defaultType?: TaskTypeId;
  defaultWhen?: WhenOptionId;
  compact?: boolean;
}

function toLocalInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function buildDefaultDueAt(defaultWhen?: WhenOptionId): string {
  const now = new Date();
  let base = new Date(now);
  if (defaultWhen === "tomorrow") {
    base = addDays(now, 1);
  } else if (defaultWhen === "in_3_days") {
    base = addDays(now, 3);
  } else if (defaultWhen === "next_week") {
    base = addDays(now, 7);
  }
  base.setHours(9, 0, 0, 0);
  return toLocalInputValue(base);
}

export function QuickTaskSetter({
  onSave,
  onCancel,
  saving = false,
  defaultType,
  defaultWhen,
  compact = false,
}: QuickTaskSetterProps) {
  const normalizedTaskType: TaskTypeId =
    defaultType === "follow_up" ? "follow_up" : "callback";

  const [taskType] = useState<TaskTypeId>(normalizedTaskType);
  const [dueAtLocal, setDueAtLocal] = useState(() => buildDefaultDueAt(defaultWhen));
  const [notes, setNotes] = useState("");

  const resolvedDueAt = useMemo(() => {
    if (!dueAtLocal) return null;
    const parsed = new Date(dueAtLocal);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [dueAtLocal]);

  const title = useMemo(() => {
    if (!resolvedDueAt) return "";
    const label = taskType === "follow_up" ? "Follow up" : "Call back";
    return `${label} — ${format(resolvedDueAt, "EEE M/d h:mmaaa")}`;
  }, [resolvedDueAt, taskType]);

  const handleSave = useCallback(() => {
    if (!resolvedDueAt) return;
    void onSave({
      taskType,
      title,
      dueAt: resolvedDueAt.toISOString(),
      notes: notes.trim(),
    });
  }, [notes, onSave, resolvedDueAt, taskType, title]);

  const canSave = Boolean(resolvedDueAt) && !saving;

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary/70">
              <Pin className="h-3.5 w-3.5" /> Resurface File
            </h4>
            <p className="text-[11px] text-muted-foreground/55">One date. One note. This date wins.</p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground/40 hover:text-foreground/60">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">Resurface Date</span>
        <input
          type="datetime-local"
          value={dueAtLocal}
          onChange={(e) => setDueAtLocal(e.target.value)}
          className="h-9 w-full rounded-lg border border-overlay-6 bg-overlay-3 px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">Note</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What should you remember when this file comes back?"
          maxLength={300}
          rows={3}
          className="w-full rounded-lg border border-overlay-6 bg-overlay-3 px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none focus:border-primary/20"
        />
      </label>

      {title && (
        <p className="text-[11px] text-muted-foreground/50 truncate">
          {title}
        </p>
      )}

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
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarClock className="h-3 w-3" />}
          Save Resurface
        </button>
      </div>
    </div>
  );
}
