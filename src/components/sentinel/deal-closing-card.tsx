"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardCheck, ChevronDown, ChevronRight, Calendar,
  Building2, CheckSquare, Square, Plus, FileText, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

// ── Types ──

interface ClosingChecklistItem {
  item: string;
  done: boolean;
  date: string | null;
}

interface ClosingData {
  closing_target_date: string | null;
  closing_status: string | null;
  closing_notes: string | null;
  title_company: string | null;
  earnest_money_deposited: boolean;
  inspection_complete: boolean;
  closing_checklist: ClosingChecklistItem[] | null;
  contract_price: number | null;
  deal_status: string;
  closed_at: string | null;
}

interface ClosingTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  priority: number;
  completed_at: string | null;
  created_at: string;
}

// ── Constants ──

const CLOSING_STATUS_OPTIONS = [
  { value: "under_contract", label: "Under Contract" },
  { value: "title_work", label: "Title Work" },
  { value: "inspection", label: "Inspection" },
  { value: "closing_scheduled", label: "Closing Scheduled" },
  { value: "closed", label: "Closed" },
  { value: "fell_through", label: "Fell Through" },
] as const;

const CLOSING_STATUS_COLORS: Record<string, string> = {
  under_contract: "gold",
  title_work: "cyan",
  inspection: "purple",
  closing_scheduled: "neon",
  closed: "default",
  fell_through: "destructive",
};

const DEFAULT_CHECKLIST: ClosingChecklistItem[] = [
  { item: "Earnest money deposited", done: false, date: null },
  { item: "Title work ordered", done: false, date: null },
  { item: "Inspection scheduled", done: false, date: null },
  { item: "Buyer financing confirmed", done: false, date: null },
  { item: "Closing date set", done: false, date: null },
];

// ── Auth helper ──

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Session expired. Please sign in again.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── Component ──

interface DealClosingCardProps {
  dealId: string;
  onUpdate?: () => void;
}

export function DealClosingCard({ dealId, onUpdate }: DealClosingCardProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState<ClosingData | null>(null);
  const [tasks, setTasks] = useState<ClosingTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch ──

  const fetchClosing = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/deals/${dealId}/closing`, { headers });
      if (!res.ok) throw new Error("Failed to fetch closing data");
      const data = await res.json();
      const closingData = data.closing as ClosingData;

      // Initialize default checklist if null
      if (!closingData.closing_checklist) {
        closingData.closing_checklist = DEFAULT_CHECKLIST;
      }

      setClosing(closingData);
      setTasks(data.tasks ?? []);
    } catch (err) {
      console.error("[DealClosingCard] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (open && !closing) {
      fetchClosing();
    }
  }, [open, closing, fetchClosing]);

  // ── Save helper (debounced for text fields, immediate for selects/toggles) ──

  const patchClosing = useCallback(async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    patch: Record<string, any>,
    immediate = false
  ) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const doSave = async () => {
      setSaving(true);
      try {
        const headers = await getAuthHeaders();
        const res = await window.fetch(`/api/deals/${dealId}/closing`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to save");
        }
        const { closing: updated } = await res.json();
        setClosing((prev) => prev ? { ...prev, ...updated } : prev);
        onUpdate?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save closing data");
      } finally {
        setSaving(false);
      }
    };

    if (immediate) {
      await doSave();
    } else {
      saveTimerRef.current = setTimeout(doSave, 600);
    }
  }, [dealId, onUpdate]);

  // ── Checklist toggle ──

  const toggleChecklistItem = useCallback(async (index: number) => {
    if (!closing?.closing_checklist) return;
    const updated = [...closing.closing_checklist];
    updated[index] = {
      ...updated[index],
      done: !updated[index].done,
      date: !updated[index].done ? new Date().toISOString().split("T")[0] : null,
    };
    setClosing((prev) => prev ? { ...prev, closing_checklist: updated } : prev);
    await patchClosing({ closing_checklist: updated }, true);
  }, [closing, patchClosing]);

  // ── Add task ──

  const addTask = useCallback(async () => {
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch("/api/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          deal_id: dealId,
          task_type: "closing",
        }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      const { task } = await res.json();
      setTasks((prev) => [...prev, task]);
      setNewTaskTitle("");
      toast.success("Task added");
    } catch {
      toast.error("Failed to add task");
    } finally {
      setAddingTask(false);
    }
  }, [newTaskTitle, dealId]);

  // ── Status label ──

  const statusLabel = closing?.closing_status
    ? CLOSING_STATUS_OPTIONS.find((o) => o.value === closing.closing_status)?.label ?? closing.closing_status
    : "Not started";

  const statusVariant = closing?.closing_status
    ? (CLOSING_STATUS_COLORS[closing.closing_status] ?? "secondary") as "gold" | "cyan" | "purple" | "neon" | "default" | "destructive" | "secondary"
    : "secondary";

  // ── Shared input classes ──

  const inputClass = "w-full bg-overlay-3 border border-overlay-6 rounded-[6px] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 transition-all";
  const labelClass = "text-sm text-muted-foreground/50 font-medium mb-1";

  // ── Checklist progress ──

  const checklist = closing?.closing_checklist ?? [];
  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistTotal = checklist.length;

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-muted-foreground/60 hover:text-muted-foreground/80 transition-colors w-full"
      >
        <ClipboardCheck className="h-3 w-3" />
        <span className="font-semibold tracking-wide">Closing Coordination</span>
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.1 }}>
          <ChevronRight className="h-3 w-3" />
        </motion.div>
        <Badge variant={statusVariant} className="text-xs ml-1">{statusLabel}</Badge>
        {checklistTotal > 0 && (
          <span className="text-xs text-muted-foreground/40 ml-auto">
            {checklistDone}/{checklistTotal}
          </span>
        )}
        {saving && <Loader2 className="h-3 w-3 animate-spin text-primary/60 ml-1" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-3 rounded-[8px] bg-overlay-2 border border-overlay-4 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-primary/40" />
                </div>
              ) : closing ? (
                <>
                  {/* Status + Target Date row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className={labelClass}>Closing Status</div>
                      <select
                        value={closing.closing_status ?? ""}
                        className={cn(inputClass, "appearance-none cursor-pointer")}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setClosing((prev) => prev ? { ...prev, closing_status: val } : prev);
                          patchClosing({ closing_status: val }, true);
                        }}
                      >
                        <option value="">Not started</option>
                        {CLOSING_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className={labelClass}>Target Close Date</div>
                      <div className="relative">
                        <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/30" />
                        <input
                          type="date"
                          value={closing.closing_target_date ? closing.closing_target_date.split("T")[0] : ""}
                          className={cn(inputClass, "pl-6")}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            setClosing((prev) => prev ? { ...prev, closing_target_date: val } : prev);
                            patchClosing({ closing_target_date: val }, true);
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Title company */}
                  <div>
                    <div className={labelClass}>Title Company</div>
                    <div className="relative">
                      <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/30" />
                      <input
                        type="text"
                        defaultValue={closing.title_company ?? ""}
                        placeholder="Enter title company..."
                        className={cn(inputClass, "pl-6")}
                        onBlur={(e) => patchClosing({ title_company: e.target.value || null })}
                      />
                    </div>
                  </div>

                  {/* Checklist */}
                  <div>
                    <div className={labelClass}>Closing Checklist</div>
                    <div className="space-y-1">
                      {checklist.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => toggleChecklistItem(i)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[4px] hover:bg-overlay-2 transition-colors text-left"
                        >
                          {item.done ? (
                            <CheckSquare className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                          ) : (
                            <Square className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                          )}
                          <span className={cn(
                            "text-xs flex-1",
                            item.done ? "text-muted-foreground/50 line-through" : "text-foreground/70"
                          )}>
                            {item.item}
                          </span>
                          {item.date && (
                            <span className="text-xs text-muted-foreground/40">{item.date}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Closing notes */}
                  <div>
                    <div className={labelClass}>Closing Notes</div>
                    <textarea
                      defaultValue={closing.closing_notes ?? ""}
                      placeholder="Notes about the closing..."
                      rows={2}
                      className={cn(inputClass, "resize-none")}
                      onBlur={(e) => patchClosing({ closing_notes: e.target.value || null })}
                    />
                  </div>

                  {/* Related tasks */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className={labelClass}>Related Tasks</div>
                      <span className="text-xs text-muted-foreground/40">
                        {tasks.filter((t) => t.status === "pending").length} pending
                      </span>
                    </div>

                    {tasks.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {tasks.map((task) => (
                          <div
                            key={task.id}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-[4px] bg-overlay-2 border border-overlay-3",
                              task.status === "completed" && "opacity-50"
                            )}
                          >
                            {task.status === "completed" ? (
                              <CheckSquare className="h-3 w-3 text-primary/50 shrink-0" />
                            ) : (
                              <Square className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                            )}
                            <span className={cn(
                              "text-xs flex-1 truncate",
                              task.status === "completed" ? "line-through text-muted-foreground/40" : "text-foreground/70"
                            )}>
                              {task.title}
                            </span>
                            {task.due_at && (
                              <span className={cn(
                                "text-xs shrink-0",
                                new Date(task.due_at) < new Date() && task.status !== "completed"
                                  ? "text-foreground/70"
                                  : "text-muted-foreground/40"
                              )}>
                                {new Date(task.due_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick add task */}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Add a closing task..."
                        className={cn(inputClass, "flex-1")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTask();
                          }
                        }}
                      />
                      <button
                        onClick={addTask}
                        disabled={!newTaskTitle.trim() || addingTask}
                        className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-primary bg-primary/8 hover:bg-primary/12 rounded-[6px] border border-primary/20 hover:border-primary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-2.5 w-2.5" />
                        Add
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground/40 py-4 text-center">
                  Unable to load closing data.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
