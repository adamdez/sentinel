import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  requireAuth: vi.fn(),
  syncTaskToLead: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/task-lead-sync", () => ({
  isCallDrivingTaskType: () => false,
  pickPrimaryCallTask: () => null,
  syncTaskToLead: (...args: unknown[]) => mocks.syncTaskToLead(...args),
}));

type TaskRow = {
  id: string;
  title: string | null;
  description: string | null;
  assigned_to: string | null;
  lead_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  priority: number | null;
  status: string | null;
  task_type: string | null;
  source_type: string | null;
  source_key: string | null;
  voice_session_id: string | null;
  jeff_interaction_id: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function createTasksClient(initialTasks: TaskRow[]) {
  const tasks = initialTasks.map((task) => ({ ...task }));

  function applyFilters(
    rows: TaskRow[],
    filters: Array<{ field: string; value: unknown }>,
  ) {
    return rows.filter((row) => filters.every((filter) => row[filter.field as keyof TaskRow] === filter.value));
  }

  function buildQuery(table: string) {
    const state: {
      filters: Array<{ field: string; value: unknown }>;
      insertPayload?: Partial<TaskRow>;
      updatePayload?: Partial<TaskRow>;
    } = {
      filters: [],
    };

    const query = {
      select() {
        return query;
      },
      eq(field: string, value: unknown) {
        state.filters.push({ field, value });
        return query;
      },
      limit() {
        return query;
      },
      maybeSingle: vi.fn(async () => {
        if (table !== "tasks") throw new Error(`Unexpected maybeSingle() on ${table}`);
        return { data: applyFilters(tasks, state.filters)[0] ?? null, error: null };
      }),
      insert(payload: Partial<TaskRow>) {
        state.insertPayload = payload;
        return query;
      },
      update(payload: Partial<TaskRow>) {
        state.updatePayload = payload;
        return query;
      },
      single: vi.fn(async () => {
        if (table !== "tasks") throw new Error(`Unexpected single() on ${table}`);

        if (state.insertPayload) {
          const duplicate = tasks.find((task) =>
            task.source_type != null
            && task.source_type === state.insertPayload?.source_type
            && task.source_key === state.insertPayload?.source_key,
          );

          if (duplicate) {
            return {
              data: null,
              error: {
                message: "duplicate key value violates unique constraint",
                code: "23505",
              },
            };
          }

          const inserted: TaskRow = {
            id: `task-${tasks.length + 1}`,
            title: state.insertPayload.title ?? null,
            description: state.insertPayload.description ?? null,
            assigned_to: state.insertPayload.assigned_to ?? null,
            lead_id: state.insertPayload.lead_id ?? null,
            deal_id: state.insertPayload.deal_id ?? null,
            contact_id: state.insertPayload.contact_id ?? null,
            due_at: state.insertPayload.due_at ?? null,
            completed_at: state.insertPayload.completed_at ?? null,
            priority: state.insertPayload.priority ?? null,
            status: state.insertPayload.status ?? null,
            task_type: state.insertPayload.task_type ?? null,
            source_type: state.insertPayload.source_type ?? null,
            source_key: state.insertPayload.source_key ?? null,
            voice_session_id: state.insertPayload.voice_session_id ?? null,
            jeff_interaction_id: state.insertPayload.jeff_interaction_id ?? null,
            notes: state.insertPayload.notes ?? null,
            created_at: state.insertPayload.created_at ?? null,
            updated_at: state.insertPayload.updated_at ?? null,
          };
          tasks.push(inserted);
          return { data: inserted, error: null };
        }

        if (state.updatePayload) {
          const existing = applyFilters(tasks, state.filters)[0] ?? null;
          if (!existing) return { data: null, error: { message: "not found" } };
          Object.assign(existing, state.updatePayload);
          return { data: existing, error: null };
        }

        throw new Error("Unsupported tasks single() operation");
      }),
    };

    return query;
  }

  return {
    tasks,
    client: {
      from(table: string) {
        return buildQuery(table);
      },
    },
  };
}

describe("POST /api/tasks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
    mocks.syncTaskToLead.mockResolvedValue(undefined);
  });

  it("reuses an existing pending task when the source identity already exists", async () => {
    const existingTask: TaskRow = {
      id: "task-1",
      title: "Research missing probate case",
      description: null,
      assigned_to: "user-1",
      lead_id: "lead-1",
      deal_id: null,
      contact_id: null,
      due_at: "2026-04-11T16:00:00.000Z",
      completed_at: null,
      priority: 1,
      status: "pending",
      task_type: "research",
      source_type: "deep_search_gap",
      source_key: "missing-pr-case",
      voice_session_id: null,
      jeff_interaction_id: null,
      notes: null,
      created_at: "2026-04-10T12:00:00.000Z",
      updated_at: "2026-04-10T12:00:00.000Z",
    };
    const sb = createTasksClient([existingTask]);
    mocks.createServerClient.mockReturnValue(sb.client);

    const { POST } = await import("@/app/api/tasks/route");
    const response = await POST(new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      body: JSON.stringify({
        title: "Verify probate case and personal representative",
        lead_id: "lead-1",
        due_at: "2026-04-11T09:00:00.000Z",
        task_type: "research",
        source_type: "deep_search_gap",
        source_key: "missing-pr-case",
      }),
    }) as never);

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.reused_existing).toBe(true);
    expect(payload.reopened).toBe(false);
    expect(payload.task.id).toBe("task-1");
    expect(payload.task.title).toBe("Verify probate case and personal representative");
    expect(payload.task.status).toBe("pending");
    expect(payload.task.assigned_to).toBe("user-1");
    expect(mocks.syncTaskToLead).toHaveBeenCalledWith(
      sb.client,
      "lead-1",
      "Verify probate case and personal representative",
      "2026-04-11T09:00:00.000Z",
    );
    expect(sb.tasks).toHaveLength(1);
  });

  it("preserves the original assignee when reusing a task without an explicit reassignment", async () => {
    const existingTask: TaskRow = {
      id: "task-1",
      title: "Research missing probate case",
      description: null,
      assigned_to: "user-2",
      lead_id: "lead-1",
      deal_id: null,
      contact_id: null,
      due_at: "2026-04-11T16:00:00.000Z",
      completed_at: null,
      priority: 1,
      status: "pending",
      task_type: "research",
      source_type: "deep_search_gap",
      source_key: "missing-pr-case",
      voice_session_id: null,
      jeff_interaction_id: null,
      notes: null,
      created_at: "2026-04-10T12:00:00.000Z",
      updated_at: "2026-04-10T12:00:00.000Z",
    };
    const sb = createTasksClient([existingTask]);
    mocks.createServerClient.mockReturnValue(sb.client);

    const { POST } = await import("@/app/api/tasks/route");
    const response = await POST(new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      body: JSON.stringify({
        title: "Verify probate case and personal representative",
        lead_id: "lead-1",
        due_at: "2026-04-11T09:00:00.000Z",
        task_type: "research",
        source_type: "deep_search_gap",
        source_key: "missing-pr-case",
      }),
    }) as never);

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.reused_existing).toBe(true);
    expect(payload.task.assigned_to).toBe("user-2");
    expect(sb.tasks[0]?.assigned_to).toBe("user-2");
  });

  it("allows an explicit reassignment when the caller provides assigned_to", async () => {
    const existingTask: TaskRow = {
      id: "task-1",
      title: "Research missing probate case",
      description: null,
      assigned_to: "user-2",
      lead_id: "lead-1",
      deal_id: null,
      contact_id: null,
      due_at: "2026-04-11T16:00:00.000Z",
      completed_at: null,
      priority: 1,
      status: "pending",
      task_type: "research",
      source_type: "deep_search_gap",
      source_key: "missing-pr-case",
      voice_session_id: null,
      jeff_interaction_id: null,
      notes: null,
      created_at: "2026-04-10T12:00:00.000Z",
      updated_at: "2026-04-10T12:00:00.000Z",
    };
    const sb = createTasksClient([existingTask]);
    mocks.createServerClient.mockReturnValue(sb.client);

    const { POST } = await import("@/app/api/tasks/route");
    const response = await POST(new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      body: JSON.stringify({
        title: "Verify probate case and personal representative",
        lead_id: "lead-1",
        due_at: "2026-04-11T09:00:00.000Z",
        task_type: "research",
        source_type: "deep_search_gap",
        source_key: "missing-pr-case",
        assigned_to: "user-3",
      }),
    }) as never);

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.reused_existing).toBe(true);
    expect(payload.task.assigned_to).toBe("user-3");
    expect(sb.tasks[0]?.assigned_to).toBe("user-3");
  });

  it("reopens a completed task when the same source identity is created again", async () => {
    const existingTask: TaskRow = {
      id: "task-1",
      title: "Verify next of kin",
      description: "Old completed task",
      assigned_to: "user-1",
      lead_id: "lead-2",
      deal_id: null,
      contact_id: null,
      due_at: "2026-04-09T09:00:00.000Z",
      completed_at: "2026-04-09T18:30:00.000Z",
      priority: 1,
      status: "completed",
      task_type: "research",
      source_type: "deep_search_gap",
      source_key: "missing-next-of-kin",
      voice_session_id: null,
      jeff_interaction_id: null,
      notes: "resolved once",
      created_at: "2026-04-09T08:00:00.000Z",
      updated_at: "2026-04-09T18:30:00.000Z",
    };
    const sb = createTasksClient([existingTask]);
    mocks.createServerClient.mockReturnValue(sb.client);

    const { POST } = await import("@/app/api/tasks/route");
    const response = await POST(new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      body: JSON.stringify({
        title: "Verify surviving relatives and contact path",
        lead_id: "lead-2",
        due_at: "2026-04-11T09:00:00.000Z",
        task_type: "research",
        source_type: "deep_search_gap",
        source_key: "missing-next-of-kin",
      }),
    }) as never);

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.reused_existing).toBe(true);
    expect(payload.reopened).toBe(true);
    expect(payload.task.id).toBe("task-1");
    expect(payload.task.status).toBe("pending");
    expect(payload.task.completed_at).toBeNull();
    expect(payload.task.title).toBe("Verify surviving relatives and contact path");
    expect(sb.tasks[0]?.status).toBe("pending");
    expect(sb.tasks[0]?.completed_at).toBeNull();
  });
});
