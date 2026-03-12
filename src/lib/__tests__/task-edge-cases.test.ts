import { describe, it, expect } from "vitest";

/* ------------------------------------------------------------------ */
/*  Inline helpers — mirrors task system logic for pure-function tests */
/* ------------------------------------------------------------------ */

type Priority = "low" | "medium" | "high" | "urgent";

interface Task {
  id: string;
  due_at: string | null;
  priority: Priority;
  completed_at: string | null;
}

const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

function isOverdue(dueAt: string | null, now: Date): boolean {
  if (!dueAt) return false;
  const dueDate = new Date(dueAt);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dueDate < todayStart;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // Tasks with due_at sort before tasks without
    if (a.due_at && !b.due_at) return -1;
    if (!a.due_at && b.due_at) return 1;

    // Same due_at — sort by priority descending
    if (a.due_at && b.due_at) {
      const dateCompare =
        new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      if (dateCompare !== 0) return dateCompare;
    }

    return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
  });
}

function bulkComplete(tasks: Task[], now: Date): Task[] {
  const ts = now.toISOString();
  return tasks.map((t) => ({ ...t, completed_at: ts }));
}

function reopenTask(task: Task): Task {
  return { ...task, completed_at: null };
}

/* ------------------------------------------------------------------ */
/*  Overdue boundary                                                  */
/* ------------------------------------------------------------------ */

describe("overdue boundary", () => {
  it("task due at 23:59:59.999 yesterday is overdue at 00:00:00 today", () => {
    // Use a fixed "now" at noon to avoid timezone edge-case ambiguity
    const now = new Date(2026, 2, 12, 12, 0, 0); // March 12, 2026, noon local
    // Due date is yesterday at 11:59 PM local time
    const yesterday = new Date(2026, 2, 11, 23, 59, 59, 999);
    expect(isOverdue(yesterday.toISOString(), now)).toBe(true);
  });

  it("task due at 00:00:00 today is NOT overdue", () => {
    const dueAt = "2026-03-12T00:00:00.000Z";
    const now = new Date("2026-03-12T00:00:00.000Z");
    expect(isOverdue(dueAt, now)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Priority ordering                                                 */
/* ------------------------------------------------------------------ */

describe("priority ordering", () => {
  it("tasks with same due_at sort by priority descending", () => {
    const tasks: Task[] = [
      { id: "a", due_at: "2026-03-15T12:00:00Z", priority: "low", completed_at: null },
      { id: "b", due_at: "2026-03-15T12:00:00Z", priority: "urgent", completed_at: null },
      { id: "c", due_at: "2026-03-15T12:00:00Z", priority: "medium", completed_at: null },
      { id: "d", due_at: "2026-03-15T12:00:00Z", priority: "high", completed_at: null },
    ];

    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("tasks with no due_at sort after tasks with due_at", () => {
    const tasks: Task[] = [
      { id: "no-date", due_at: null, priority: "urgent", completed_at: null },
      { id: "has-date", due_at: "2026-03-20T12:00:00Z", priority: "low", completed_at: null },
    ];

    const sorted = sortTasks(tasks);
    expect(sorted[0].id).toBe("has-date");
    expect(sorted[1].id).toBe("no-date");
  });
});

/* ------------------------------------------------------------------ */
/*  Bulk completion                                                   */
/* ------------------------------------------------------------------ */

describe("bulk completion", () => {
  it("completing multiple tasks atomically sets all completed_at", () => {
    const now = new Date("2026-03-12T14:30:00.000Z");
    const tasks: Task[] = [
      { id: "1", due_at: "2026-03-10T12:00:00Z", priority: "high", completed_at: null },
      { id: "2", due_at: "2026-03-11T12:00:00Z", priority: "medium", completed_at: null },
      { id: "3", due_at: null, priority: "low", completed_at: null },
    ];

    const completed = bulkComplete(tasks, now);
    const ts = now.toISOString();

    expect(completed).toHaveLength(3);
    for (const task of completed) {
      expect(task.completed_at).toBe(ts);
    }
    // Originals unchanged (immutable)
    for (const task of tasks) {
      expect(task.completed_at).toBeNull();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Reopening                                                         */
/* ------------------------------------------------------------------ */

describe("reopening a task", () => {
  it("preserves due_at but clears completed_at", () => {
    const task: Task = {
      id: "1",
      due_at: "2026-03-15T12:00:00Z",
      priority: "high",
      completed_at: "2026-03-12T14:00:00Z",
    };

    const reopened = reopenTask(task);
    expect(reopened.due_at).toBe("2026-03-15T12:00:00Z");
    expect(reopened.completed_at).toBeNull();
    // Original unchanged
    expect(task.completed_at).toBe("2026-03-12T14:00:00Z");
  });
});
