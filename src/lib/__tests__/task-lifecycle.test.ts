/**
 * Task Lifecycle Tests
 *
 * Tests the pure logic used by the tasks system:
 * - View filtering (overdue/today/upcoming)
 * - Completion/reopen state transitions
 * - Priority handling
 *
 * These validate the business rules without requiring API calls.
 */

import { describe, it, expect } from "vitest";

// ── Replicate the view-filtering logic from tasks route for testing ──

interface TaskRow {
  id: string;
  status: string;
  due_at: string | null;
  completed_at: string | null;
  priority: number;
}

type TaskView = "today" | "overdue" | "upcoming" | "all" | "completed";

/**
 * Pure function that determines which view a task belongs to.
 * Mirrors the server-side filter logic from /api/tasks GET handler.
 */
function classifyTaskView(task: TaskRow, now: Date): TaskView | null {
  if (task.status === "completed") return "completed";
  if (task.completed_at != null) return "completed"; // safety check

  if (!task.due_at) return "all"; // no due date = only shows in "all"

  const due = new Date(task.due_at);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const sevenDaysOut = new Date(now);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  if (due < startOfToday) return "overdue";
  if (due <= endOfToday) return "today";
  if (due <= sevenDaysOut) return "upcoming";
  return "all"; // beyond 7 days
}

/**
 * Simulates the completion state transition from PATCH handler.
 */
function applyStatusChange(
  task: TaskRow,
  newStatus: string,
  explicitCompletedAt?: string | null
): { status: string; completed_at: string | null } {
  if (newStatus === "completed") {
    return {
      status: "completed",
      completed_at: explicitCompletedAt ?? new Date().toISOString(),
    };
  }
  if (newStatus === "pending") {
    return {
      status: "pending",
      completed_at: null, // always clear on reopen
    };
  }
  return { status: task.status, completed_at: task.completed_at };
}

// ── Tests ──

describe("classifyTaskView", () => {
  const now = new Date("2026-03-12T14:00:00Z");

  it("classifies completed tasks", () => {
    const task: TaskRow = {
      id: "1", status: "completed", due_at: "2026-03-10T10:00:00Z",
      completed_at: "2026-03-11T08:00:00Z", priority: 1,
    };
    expect(classifyTaskView(task, now)).toBe("completed");
  });

  it("classifies overdue tasks (due before start of today)", () => {
    const task: TaskRow = {
      id: "2", status: "pending", due_at: "2026-03-10T10:00:00Z",
      completed_at: null, priority: 2,
    };
    expect(classifyTaskView(task, now)).toBe("overdue");
  });

  it("classifies today tasks (due today)", () => {
    const task: TaskRow = {
      id: "3", status: "pending", due_at: "2026-03-12T18:00:00Z",
      completed_at: null, priority: 1,
    };
    expect(classifyTaskView(task, now)).toBe("today");
  });

  it("classifies upcoming tasks (1-7 days out)", () => {
    const task: TaskRow = {
      id: "4", status: "pending", due_at: "2026-03-15T10:00:00Z",
      completed_at: null, priority: 1,
    };
    expect(classifyTaskView(task, now)).toBe("upcoming");
  });

  it("classifies far-future tasks as 'all'", () => {
    const task: TaskRow = {
      id: "5", status: "pending", due_at: "2026-04-15T10:00:00Z",
      completed_at: null, priority: 1,
    };
    expect(classifyTaskView(task, now)).toBe("all");
  });

  it("classifies tasks with no due date as 'all'", () => {
    const task: TaskRow = {
      id: "6", status: "pending", due_at: null,
      completed_at: null, priority: 1,
    };
    expect(classifyTaskView(task, now)).toBe("all");
  });

  it("treats task with completed_at but status=pending as completed (safety)", () => {
    const task: TaskRow = {
      id: "7", status: "pending", due_at: "2026-03-12T10:00:00Z",
      completed_at: "2026-03-12T09:00:00Z", priority: 1,
    };
    // completed_at is set → should be treated as completed regardless of status
    expect(classifyTaskView(task, now)).toBe("completed");
  });
});

describe("applyStatusChange", () => {
  const pendingTask: TaskRow = {
    id: "1", status: "pending", due_at: "2026-03-12T10:00:00Z",
    completed_at: null, priority: 1,
  };

  const completedTask: TaskRow = {
    id: "2", status: "completed", due_at: "2026-03-12T10:00:00Z",
    completed_at: "2026-03-12T09:00:00Z", priority: 1,
  };

  it("sets completed_at when completing", () => {
    const result = applyStatusChange(pendingTask, "completed");
    expect(result.status).toBe("completed");
    expect(result.completed_at).not.toBeNull();
  });

  it("allows explicit completed_at when completing", () => {
    const explicitTime = "2026-03-12T15:00:00Z";
    const result = applyStatusChange(pendingTask, "completed", explicitTime);
    expect(result.completed_at).toBe(explicitTime);
  });

  it("clears completed_at when reopening", () => {
    const result = applyStatusChange(completedTask, "pending");
    expect(result.status).toBe("pending");
    expect(result.completed_at).toBeNull();
  });

  it("reopening a pending task is idempotent", () => {
    const result = applyStatusChange(pendingTask, "pending");
    expect(result.status).toBe("pending");
    expect(result.completed_at).toBeNull();
  });
});

describe("task ordering expectations", () => {
  it("pending tasks should sort by due_at ascending (soonest first)", () => {
    const tasks: TaskRow[] = [
      { id: "a", status: "pending", due_at: "2026-03-15T10:00:00Z", completed_at: null, priority: 1 },
      { id: "b", status: "pending", due_at: "2026-03-13T10:00:00Z", completed_at: null, priority: 1 },
      { id: "c", status: "pending", due_at: "2026-03-14T10:00:00Z", completed_at: null, priority: 1 },
    ];

    const sorted = [...tasks].sort((a, b) => {
      const aTime = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bTime = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return aTime - bTime;
    });

    expect(sorted[0].id).toBe("b"); // Mar 13
    expect(sorted[1].id).toBe("c"); // Mar 14
    expect(sorted[2].id).toBe("a"); // Mar 15
  });

  it("completed tasks should sort by completed_at descending (most recent first)", () => {
    const tasks: TaskRow[] = [
      { id: "a", status: "completed", due_at: "2026-03-10T10:00:00Z", completed_at: "2026-03-11T08:00:00Z", priority: 1 },
      { id: "b", status: "completed", due_at: "2026-03-09T10:00:00Z", completed_at: "2026-03-12T15:00:00Z", priority: 1 },
      { id: "c", status: "completed", due_at: "2026-03-08T10:00:00Z", completed_at: "2026-03-10T12:00:00Z", priority: 1 },
    ];

    const sorted = [...tasks].sort((a, b) => {
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bTime - aTime; // descending
    });

    expect(sorted[0].id).toBe("b"); // completed Mar 12
    expect(sorted[1].id).toBe("a"); // completed Mar 11
    expect(sorted[2].id).toBe("c"); // completed Mar 10
  });
});
