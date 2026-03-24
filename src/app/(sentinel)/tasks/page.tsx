"use client";

import { Fragment, useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  Calendar,
  Edit3,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Phone,
  List,
} from "lucide-react";
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks } from "date-fns";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTasks, type TaskItem, type TaskView } from "@/hooks/use-tasks";
import { useModal } from "@/providers/modal-provider";
import { supabase } from "@/lib/supabase";
import { useHydrated } from "@/providers/hydration-provider";
import { toast } from "sonner";

function relativeDue(dueAt: string | null): { label: string; color: string } {
  if (!dueAt) return { label: "No date", color: "text-muted-foreground" };
  const now = new Date();
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      label: absDays === 1 ? "1 day overdue" : `${absDays} days overdue`,
      color: "text-red-400",
    };
  }
  if (diffDays === 0) return { label: "Due today", color: "text-amber-400" };
  if (diffDays === 1) return { label: "Tomorrow", color: "text-foreground" };
  if (diffDays <= 7) return { label: `In ${diffDays} days`, color: "text-foreground" };
  return {
    label: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    color: "text-muted-foreground",
  };
}

function priorityDot(priority: number) {
  if (priority >= 3) return "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]";
  if (priority === 2) return "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]";
  return "bg-primary/60";
}

function isCallback(task: TaskItem): boolean {
  const t = (task.task_type ?? "").toLowerCase();
  const title = (task.title ?? "").toLowerCase();
  return t === "callback" || t === "call_back" || title.includes("callback") || title.includes("call back") || title.includes("return call");
}

const TABS: { key: TaskView | "callbacks"; label: string; icon: typeof Clock }[] = [
  { key: "overdue", label: "Overdue", icon: AlertCircle },
  { key: "today", label: "Today", icon: Clock },
  { key: "callbacks", label: "Callbacks", icon: Phone },
  { key: "upcoming", label: "Upcoming", icon: Calendar },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
];

function QuickCreate({ onCreate }: { onCreate: (data: Partial<TaskItem>) => Promise<TaskItem> }) {
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        task_type: "follow_up",
      } as Partial<TaskItem>);
      setTitle("");
      setDueAt("");
      setPriority(1);
      toast.success("Follow-up created");
      inputRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }, [title, dueAt, priority, submitting, onCreate]);

  return (
    <GlassCard className="p-3">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-primary shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Add a follow-up..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="bg-overlay-3 border border-overlay-6 rounded-[6px] px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/30 transition-all"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="bg-overlay-3 border border-overlay-6 rounded-[6px] px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/30 transition-all appearance-none cursor-pointer"
        >
          <option value={1}>Low</option>
          <option value={2}>Medium</option>
          <option value={3}>High</option>
        </select>
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || submitting}
          className={cn(
            "px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all",
            title.trim()
              ? "bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25"
              : "bg-overlay-3 text-muted-foreground/40 border border-overlay-4 cursor-not-allowed"
          )}
        >
          Add
        </button>
      </div>
    </GlassCard>
  );
}

const COMPLETION_REASONS = ["Called", "Texted", "Rescheduled", "Not needed"] as const;

function lastCallLabel(task: TaskItem): string | null {
  if (!task.last_call_date) return null;
  const dispo = task.last_call_disposition ?? "call";
  const diff = Date.now() - new Date(task.last_call_date).getTime();
  const mins = Math.floor(diff / 60000);
  let ago: string;
  if (mins < 1) ago = "just now";
  else if (mins < 60) ago = `${mins}m ago`;
  else { const hrs = Math.floor(mins / 60); ago = hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`; }
  const snippet = task.last_call_notes ? ` — ${task.last_call_notes.slice(0, 60)}` : "";
  return `Last: ${dispo} ${ago}${snippet}`;
}

function FollowUpRow({
  task,
  onComplete,
  onReopen,
  onDelete,
  onEdit,
  idx,
}: {
  task: TaskItem;
  onComplete: (id: string, reason?: string) => void;
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: TaskItem) => void;
  idx: number;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const { openModal } = useModal();
  const isCompleted = task.status === "completed";
  const due = relativeDue(task.due_at);
  const isOverdue = task.due_at && new Date(task.due_at) < new Date() && !isCompleted;
  const cb = isCallback(task);

  const hasLead = !!(task.lead_owner || task.lead_address);
  const primaryLabel = hasLead
    ? [task.lead_owner, task.lead_address].filter(Boolean).join(" — ")
    : task.title;
  const callContext = lastCallLabel(task);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ delay: idx * 0.02, duration: 0.2 }}
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-all border-l-2",
        isOverdue
          ? "border-l-red-500/80 bg-red-500/[0.03]"
          : isCompleted
            ? "border-l-transparent bg-overlay-2 opacity-60"
            : due.label === "Due today"
              ? "border-l-amber-400/60 bg-amber-500/[0.02]"
              : "border-l-transparent bg-overlay-2",
        "hover:bg-overlay-4"
      )}
    >
      <div className={cn("h-2 w-2 rounded-full shrink-0", priorityDot(task.priority))} />

      <button
        onClick={() => {
          if (isCompleted) { onReopen(task.id); return; }
          setShowReasonPicker(true);
        }}
        className={cn(
          "shrink-0 h-5 w-5 rounded-full border flex items-center justify-center transition-all",
          isCompleted
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-overlay-10 hover:border-primary/40 hover:bg-primary/10 text-transparent hover:text-primary"
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </button>

      <div className="flex-1 min-w-0">
        <button
          onClick={() => task.lead_id ? openModal("client-file", { leadId: task.lead_id }) : null}
          className={cn(
            "text-sm font-medium truncate block text-left",
            task.lead_id ? "text-foreground/90 hover:text-primary cursor-pointer" : "text-foreground/90 cursor-default",
            isCompleted && "line-through text-muted-foreground"
          )}
        >
          {primaryLabel}
        </button>
        <div className="flex items-center gap-2 mt-0.5">
          {hasLead && (
            <span className="text-xs text-muted-foreground/50 truncate">{task.title}</span>
          )}
          {task.lead_phone && (
            <span className="text-xs text-muted-foreground/40 shrink-0">{task.lead_phone}</span>
          )}
          {cb && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              Callback
            </span>
          )}
          {task.lead_status && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-overlay-4 text-muted-foreground border border-overlay-6 shrink-0">
              {task.lead_status}
            </span>
          )}
        </div>
        {callContext && (
          <p className="text-[11px] text-muted-foreground/40 mt-0.5 truncate italic">
            {callContext}
          </p>
        )}
      </div>

      {showReasonPicker && !isCompleted ? (
        <div className="flex items-center gap-1 flex-wrap shrink-0">
          {COMPLETION_REASONS.map((reason) => (
            <button
              key={reason}
              onClick={() => { onComplete(task.id, reason); setShowReasonPicker(false); }}
              className="px-2 py-0.5 rounded text-[10px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20"
            >
              {reason}
            </button>
          ))}
          <button
            onClick={() => setShowReasonPicker(false)}
            className="px-1.5 py-0.5 rounded text-[10px] text-muted-foreground/50 hover:text-foreground/70"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          {task.lead_id && !isCompleted && (
            <button
              onClick={() => openModal("client-file", { leadId: task.lead_id! })}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 shrink-0"
            >
              <Phone className="h-3 w-3" /> Call
            </button>
          )}

          <span className={cn("text-sm shrink-0 tabular-nums", due.color)}>
            {isCompleted ? (
              <span className="text-muted-foreground/50">
                Done {task.completed_at
                  ? new Date(task.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : ""}
              </span>
            ) : (
              due.label
            )}
          </span>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {isCompleted ? (
              <button
                onClick={() => onReopen(task.id)}
                className="p-1 rounded hover:bg-overlay-5 text-muted-foreground hover:text-foreground transition-colors"
                title="Reopen"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={() => onEdit(task)}
                className="p-1 rounded hover:bg-overlay-5 text-muted-foreground hover:text-foreground transition-colors"
                title="Edit"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { onDelete(task.id); setConfirmDelete(false); }}
                  className="px-1.5 py-0.5 rounded text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-1.5 py-0.5 rounded text-sm bg-overlay-5 text-muted-foreground hover:bg-overlay-10 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1 rounded hover:bg-muted/10 text-muted-foreground hover:text-foreground transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

function EditOverlay({
  task,
  onSave,
  onClose,
}: {
  task: TaskItem;
  onSave: (id: string, data: Partial<TaskItem>) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueAt, setDueAt] = useState(
    task.due_at ? new Date(task.due_at).toISOString().split("T")[0] : ""
  );
  const [priority, setPriority] = useState(task.priority);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
      } as Partial<TaskItem>);
      toast.success("Updated");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }, [title, description, dueAt, priority, saving, task.id, onSave, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-4"
      >
        <GlassCard className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Edit Follow-Up</h3>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-overlay-3 border border-overlay-6 rounded-[8px] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/30 transition-all"
            placeholder="What needs to happen?"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-overlay-3 border border-overlay-6 rounded-[8px] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/30 transition-all resize-none"
            placeholder="Notes (optional)"
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm uppercase tracking-widest text-muted-foreground mb-1 block">Due</label>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full bg-overlay-3 border border-overlay-6 rounded-[6px] px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/30 transition-all"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm uppercase tracking-widest text-muted-foreground mb-1 block">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full bg-overlay-3 border border-overlay-6 rounded-[6px] px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/30 transition-all appearance-none cursor-pointer"
              >
                <option value={1}>Low</option>
                <option value={2}>Medium</option>
                <option value={3}>High</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-[8px] text-xs text-muted-foreground hover:text-foreground hover:bg-overlay-5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="px-3 py-1.5 rounded-[8px] text-xs font-medium bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>
  );
}

function TaskCounts() {
  const [counts, setCounts] = useState<{ overdue: number; today: number; upcoming: number } | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      const [overdueRes, todayRes, upcomingRes] = await Promise.all([
        fetch("/api/tasks?status=pending&view=overdue", { headers }),
        fetch("/api/tasks?status=pending&view=today", { headers }),
        fetch("/api/tasks?status=pending&view=upcoming", { headers }),
      ]);

      const [overdueJson, todayJson, upcomingJson] = await Promise.all([
        overdueRes.ok ? overdueRes.json() : { tasks: [] },
        todayRes.ok ? todayRes.json() : { tasks: [] },
        upcomingRes.ok ? upcomingRes.json() : { tasks: [] },
      ]);

      setCounts({
        overdue: (overdueJson.tasks ?? []).length,
        today: (todayJson.tasks ?? []).length,
        upcoming: (upcomingJson.tasks ?? []).length,
      });
    } catch (err) {
      console.error("[TaskCounts] fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const channel = supabase
      .channel("task_counts_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchCounts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCounts]);

  if (!counts) return null;

  return (
    <div className="flex items-center gap-2">
      {counts.overdue > 0 && (
        <Badge variant="destructive" className="text-sm">
          <AlertCircle className="h-3 w-3 mr-1" />
          {counts.overdue} Overdue
        </Badge>
      )}
      <Badge variant="gold" className="text-sm">
        <Clock className="h-3 w-3 mr-1" />
        {counts.today} Today
      </Badge>
      <Badge variant="cyan" className="text-sm">
        <Calendar className="h-3 w-3 mr-1" />
        {counts.upcoming} Upcoming
      </Badge>
    </div>
  );
}

function EmptyState({ view }: { view: TaskView | "callbacks" }) {
  const messages: Record<string, { icon: typeof CheckCircle2; text: string }> = {
    overdue: { icon: CheckCircle2, text: "No overdue follow-ups. You're caught up." },
    today: { icon: Clock, text: "Nothing due today." },
    callbacks: { icon: Phone, text: "No scheduled callbacks right now." },
    upcoming: { icon: Calendar, text: "No upcoming follow-ups in the next 7 days." },
    all: { icon: CheckCircle2, text: "No pending follow-ups." },
    completed: { icon: CheckCircle2, text: "No completed follow-ups yet." },
  };
  const msg = messages[view] ?? messages.all;
  const Icon = msg.icon;
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-10 w-10 rounded-full bg-overlay-3 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-muted-foreground/40" />
      </div>
      <p className="text-sm text-muted-foreground/60">{msg.text}</p>
    </div>
  );
}

function WeekCalendar({ tasks, onComplete }: { tasks: TaskItem[]; onComplete: (id: string) => void }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17];

  const tasksBySlot = new Map<string, TaskItem[]>();
  for (const t of tasks) {
    if (!t.due_at) continue;
    const d = new Date(t.due_at);
    const key = `${format(d, "yyyy-MM-dd")}-${d.getHours()}`;
    tasksBySlot.set(key, [...(tasksBySlot.get(key) ?? []), t]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="p-1 rounded hover:bg-overlay-6 text-muted-foreground/50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-foreground/80">
          {format(days[0], "MMM d")} — {format(days[4], "MMM d, yyyy")}
        </span>
        <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="p-1 rounded hover:bg-overlay-6 text-muted-foreground/50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-[60px_repeat(5,1fr)] min-w-[600px]">
          {/* Header */}
          <div className="h-8" />
          {days.map((d) => (
            <div key={d.toISOString()} className={cn(
              "h-8 flex items-center justify-center text-xs font-medium border-b border-overlay-6",
              isSameDay(d, new Date()) ? "text-primary" : "text-muted-foreground/60",
            )}>
              {format(d, "EEE M/d")}
            </div>
          ))}

          {/* Hour rows */}
          {hours.map((h) => (
            <Fragment key={h}>
              <div className="h-14 flex items-start justify-end pr-2 pt-0.5 text-[10px] text-muted-foreground/40 border-r border-overlay-6">
                {h > 12 ? `${h - 12}pm` : h === 12 ? "12pm" : `${h}am`}
              </div>
              {days.map((d) => {
                const key = `${format(d, "yyyy-MM-dd")}-${h}`;
                const slotTasks = tasksBySlot.get(key) ?? [];
                return (
                  <div key={key} className="h-14 border-b border-r border-overlay-4 px-0.5 py-0.5 relative group hover:bg-overlay-2 transition-colors">
                    {slotTasks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onComplete(t.id)}
                        className="block w-full text-left px-1 py-0.5 rounded text-[10px] leading-tight font-medium bg-primary/15 text-primary/90 border border-primary/20 truncate hover:bg-primary/25 transition-colors"
                        title={t.title}
                      >
                        {t.lead_owner ?? t.title.slice(0, 20)}
                      </button>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const hydrated = useHydrated();
  const [activeTab, setActiveTab] = useState<TaskView | "callbacks">("today");
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "schedule">("list");

  const apiView: TaskView = activeTab === "callbacks" ? "all" : activeTab;

  const {
    tasks: rawTasks,
    loading,
    error,
    refetch,
    createTask: handleCreate,
    updateTask: handleUpdate,
    completeTask: handleComplete,
    reopenTask: handleReopen,
    deleteTask: handleDelete,
  } = useTasks(apiView);

  const tasks = activeTab === "callbacks"
    ? rawTasks.filter((t) => isCallback(t) && t.status !== "completed")
    : rawTasks;

  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading) {
      setTimedOut(false);
      timeoutRef.current = setTimeout(() => setTimedOut(true), 10000);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [loading]);

  const showError = error || (timedOut && loading);

  const onComplete = useCallback(async (id: string, reason?: string) => {
    try { await handleComplete(id, reason); toast.success("Completed"); } catch { toast.error("Failed"); }
  }, [handleComplete]);

  const onReopen = useCallback(async (id: string) => {
    try { await handleReopen(id); toast.success("Reopened"); } catch { toast.error("Failed"); }
  }, [handleReopen]);

  const onDelete = useCallback(async (id: string) => {
    try { await handleDelete(id); toast.success("Deleted"); } catch { toast.error("Failed"); }
  }, [handleDelete]);

  const onSaveEdit = useCallback(async (id: string, data: Partial<TaskItem>) => {
    await handleUpdate(id, data);
  }, [handleUpdate]);

  if (!hydrated) return null;

  return (
    <PageShell
      title="Follow-Up Queue"
      description="Promises, callbacks, and follow-up obligations tied to real leads."
    >
      <div className="space-y-4">
        <TaskCounts />

        <QuickCreate onCreate={handleCreate} />

        <div className="flex items-center gap-1 border-b border-overlay-4 pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "relative px-3 py-2 text-xs font-medium transition-all rounded-t-[8px]",
                activeTab === tab.key
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="task-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary"
                  style={{ boxShadow: "0 0 8px var(--overlay-40)" }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-0.5 pr-1">
            <button
              onClick={() => setViewMode("list")}
              className={cn("p-1.5 rounded", viewMode === "list" ? "text-primary bg-primary/10" : "text-muted-foreground/40 hover:text-foreground/60")}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("schedule")}
              className={cn("p-1.5 rounded", viewMode === "schedule" ? "text-primary bg-primary/10" : "text-muted-foreground/40 hover:text-foreground/60")}
              title="Schedule view"
            >
              <Calendar className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {viewMode === "schedule" ? (
          <GlassCard className="p-3">
            {loading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-[8px]" />
                ))}
              </div>
            ) : (
              <WeekCalendar tasks={tasks} onComplete={onComplete} />
            )}
          </GlassCard>
        ) : (
          <GlassCard className="p-2">
            {showError ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <AlertCircle className="h-5 w-5 text-foreground/70" />
                <p className="text-sm text-muted-foreground/60">{error || "Follow-ups took too long to load."}</p>
                <button
                  onClick={() => { setTimedOut(false); refetch(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            ) : loading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-[8px]" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <EmptyState view={activeTab} />
            ) : (
              <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {tasks.map((task, i) => (
                    <FollowUpRow
                      key={task.id}
                      task={task}
                      idx={i}
                      onComplete={onComplete}
                      onReopen={onReopen}
                      onDelete={onDelete}
                      onEdit={setEditingTask}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </GlassCard>
        )}
      </div>

      <AnimatePresence>
        {editingTask && (
          <EditOverlay
            task={editingTask}
            onSave={onSaveEdit}
            onClose={() => setEditingTask(null)}
          />
        )}
      </AnimatePresence>
    </PageShell>
  );
}
