"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  lead_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  priority: number;
  status: string;
  task_type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined context
  lead_address?: string | null;
  lead_owner?: string | null;
  lead_phone?: string | null;
  lead_status?: string | null;
  // Last call context
  last_call_date?: string | null;
  last_call_disposition?: string | null;
  last_call_notes?: string | null;
}

export type TaskView = "today" | "upcoming" | "overdue" | "all" | "completed";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function createTask(data: Partial<TaskItem>): Promise<TaskItem> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create task");
  }
  const json = await res.json();
  return json.task;
}

export async function updateTask(id: string, data: Partial<TaskItem>): Promise<TaskItem> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update task");
  }
  const json = await res.json();
  return json.task;
}

export async function completeTask(id: string, reason?: string): Promise<TaskItem> {
  const patch: Partial<TaskItem> = { status: "completed" };
  if (reason) {
    patch.notes = `[Completed: ${reason}]`;
  }
  return updateTask(id, patch);
}

export async function reopenTask(id: string): Promise<TaskItem> {
  return updateTask(id, { status: "pending", completed_at: null } as Partial<TaskItem>);
}

export async function deleteTask(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/tasks/${id}`, {
    method: "DELETE",
    headers: { ...headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete task");
  }
}

export function useTasks(view: TaskView = "all") {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();

      if (view === "completed") {
        params.set("status", "completed");
      } else {
        params.set("status", "pending");
        if (view !== "all") {
          params.set("view", view);
        }
      }

      const res = await fetch(`/api/tasks?${params.toString()}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const json = await res.json();
      setTasks(json.tasks ?? []);
    } catch (err) {
      console.error("[useTasks] Fetch failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    fetchTasks();

    const channel = supabase
      .channel(`tasks_rt_${view}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchTasks())
      .subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchTasks, view]);

  const handleCreate = useCallback(async (data: Partial<TaskItem>) => {
    const task = await createTask(data);
    await fetchTasks();
    return task;
  }, [fetchTasks]);

  const handleUpdate = useCallback(async (id: string, data: Partial<TaskItem>) => {
    const task = await updateTask(id, data);
    await fetchTasks();
    return task;
  }, [fetchTasks]);

  const handleComplete = useCallback(async (id: string, reason?: string) => {
    const task = await completeTask(id, reason);
    await fetchTasks();
    return task;
  }, [fetchTasks]);

  const handleReopen = useCallback(async (id: string) => {
    const task = await reopenTask(id);
    await fetchTasks();
    return task;
  }, [fetchTasks]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteTask(id);
    await fetchTasks();
  }, [fetchTasks]);

  return {
    tasks,
    loading,
    error,
    refetch: fetchTasks,
    createTask: handleCreate,
    updateTask: handleUpdate,
    completeTask: handleComplete,
    reopenTask: handleReopen,
    deleteTask: handleDelete,
  };
}
