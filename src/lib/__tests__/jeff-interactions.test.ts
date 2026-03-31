import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(),
  supabase: {},
}));

vi.mock("@/lib/voice-registry", () => ({
  getActiveHandoffRule: vi.fn(async () => ({
    version: "test",
    rule_config: {
      callback_default_hours_ahead: 24,
    },
  })),
}));

vi.mock("@/lib/task-lead-sync", () => ({
  syncTaskToLead: vi.fn(),
}));

import { createServerClient } from "@/lib/supabase";
import { deriveJeffInteractionDecision, syncJeffTaskForInteraction, type JeffInteractionRecord } from "@/lib/jeff-interactions";

function createSupabaseMock(config: {
  existingTask?: { id: string; status: string } | null;
  leadAssignee?: string | null;
  profiles?: Array<{ id: string; email: string | null }>;
}) {
  const tasksUpdateEq = vi.fn(async () => ({ data: null, error: null }));
  const tasksUpdate = vi.fn(() => ({ eq: tasksUpdateEq }));
  const tasksInsertSingle = vi.fn(async () => ({ data: { id: "new-task-1" }, error: null }));
  const tasksInsertSelect = vi.fn(() => ({ single: tasksInsertSingle }));
  const tasksInsert = vi.fn(() => ({ select: tasksInsertSelect }));
  const tasksMaybeSingle = vi.fn(async () => ({ data: config.existingTask ?? null, error: null }));
  const tasksSelect = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: tasksMaybeSingle })) })) }));

  const leadsMaybeSingle = vi.fn(async () => ({ data: { assigned_to: config.leadAssignee ?? null }, error: null }));
  const leadsSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: leadsMaybeSingle })) }));

  const profilesIn = vi.fn(async () => ({ data: config.profiles ?? [], error: null }));
  const profilesSelect = vi.fn(() => ({ in: profilesIn }));

  const interactionsUpdateEq = vi.fn(async () => ({ data: null, error: null }));
  const interactionsUpdate = vi.fn(() => ({ eq: interactionsUpdateEq }));

  const from = vi.fn((table: string) => {
    if (table === "tasks") {
      return {
        select: tasksSelect,
        update: tasksUpdate,
        insert: tasksInsert,
      };
    }
    if (table === "leads") {
      return {
        select: leadsSelect,
      };
    }
    if (table === "user_profiles") {
      return {
        select: profilesSelect,
      };
    }
    if (table === "jeff_interactions") {
      return {
        update: interactionsUpdate,
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return {
    from,
    tasksUpdateEq,
    tasksInsertSingle,
    interactionsUpdateEq,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deriveJeffInteractionDecision", () => {
  it("tracks successful warm transfers without creating a task", () => {
    const result = deriveJeffInteractionDecision({
      direction: "outbound",
      leadId: "lead-1",
      callerType: "seller",
      disposition: "answered",
      callbackRequested: false,
      callbackTime: null,
      wasTransferred: true,
      transferTarget: "+15095551234",
      summary: "Seller wanted to talk now and Jeff handed off successfully.",
    });

    expect(result.shouldTrack).toBe(true);
    if (!result.shouldTrack) throw new Error("expected tracked result");
    expect(result.interactionType).toBe("warm_transfer");
    expect(result.shouldCreateTask).toBe(false);
  });

  it("creates callback work when a transfer fails", () => {
    const result = deriveJeffInteractionDecision({
      direction: "outbound",
      leadId: "lead-2",
      callerType: "seller",
      disposition: "answered",
      callbackRequested: false,
      callbackTime: null,
      wasTransferred: false,
      transferTarget: "+15095551234",
      summary: "Seller was ready but transfer did not complete.",
    });

    expect(result.shouldTrack).toBe(true);
    if (!result.shouldTrack) throw new Error("expected tracked result");
    expect(result.interactionType).toBe("transfer_failed");
    expect(result.shouldCreateTask).toBe(true);
  });

  it("creates callback work when Jeff captures a callback request", () => {
    const result = deriveJeffInteractionDecision({
      direction: "outbound",
      leadId: "lead-3",
      callerType: "seller",
      disposition: "callback",
      callbackRequested: true,
      callbackTime: "tomorrow morning",
      wasTransferred: false,
      transferTarget: null,
      summary: "Seller asked for a callback tomorrow morning.",
    });

    expect(result.shouldTrack).toBe(true);
    if (!result.shouldTrack) throw new Error("expected tracked result");
    expect(result.interactionType).toBe("callback_request");
    expect(result.shouldCreateTask).toBe(true);
  });

  it("creates follow-up work for meaningful human answers without transfer", () => {
    const result = deriveJeffInteractionDecision({
      direction: "outbound",
      leadId: "lead-4",
      callerType: "seller",
      disposition: "interested",
      callbackRequested: false,
      callbackTime: null,
      wasTransferred: false,
      transferTarget: null,
      summary: "Seller is interested but could not transfer right now.",
    });

    expect(result.shouldTrack).toBe(true);
    if (!result.shouldTrack) throw new Error("expected tracked result");
    expect(result.interactionType).toBe("follow_up_needed");
    expect(result.shouldCreateTask).toBe(true);
  });

  it("does not create Jeff interaction noise for voicemail outcomes", () => {
    const result = deriveJeffInteractionDecision({
      direction: "outbound",
      leadId: "lead-5",
      callerType: "seller",
      disposition: "voicemail",
      callbackRequested: false,
      callbackTime: null,
      wasTransferred: false,
      transferTarget: null,
      summary: "Left a voicemail.",
    });

    expect(result.shouldTrack).toBe(false);
  });

  it("tracks inbound warm transfers without requiring a linked lead", () => {
    const result = deriveJeffInteractionDecision({
      direction: "inbound",
      leadId: null,
      callerType: "seller",
      disposition: "completed",
      callbackRequested: false,
      callbackTime: null,
      wasTransferred: true,
      transferTarget: "logan",
      summary: "Caller gave an address and Jeff transferred to Logan.",
    });

    expect(result.shouldTrack).toBe(true);
    if (!result.shouldTrack) throw new Error("expected tracked result");
    expect(result.interactionType).toBe("warm_transfer");
    expect(result.shouldCreateTask).toBe(false);
  });

  it("creates inbound callback work without a linked lead", () => {
    const result = deriveJeffInteractionDecision({
      direction: "inbound",
      leadId: null,
      callerType: "unknown",
      disposition: "completed",
      callbackRequested: true,
      callbackTime: "tomorrow at 2pm",
      wasTransferred: false,
      transferTarget: null,
      summary: "Caller asked for Adam to call back tomorrow about 123 Main St.",
    });

    expect(result.shouldTrack).toBe(true);
    if (!result.shouldTrack) throw new Error("expected tracked result");
    expect(result.interactionType).toBe("callback_request");
    expect(result.shouldCreateTask).toBe(true);
  });

  it("does not reopen a resolved Jeff interaction when the linked task is already completed", async () => {
    const sb = createSupabaseMock({
      existingTask: { id: "task-1", status: "completed" },
      leadAssignee: "logan-id",
    });
    vi.mocked(createServerClient).mockReturnValue(sb as never);

    const interaction: JeffInteractionRecord = {
      id: "interaction-1",
      voice_session_id: "voice-1",
      lead_id: "lead-1",
      calls_log_id: "call-1",
      direction: "outbound",
      caller_phone: "+15095550000",
      caller_name: null,
      property_address: null,
      interaction_type: "callback_request",
      status: "task_open",
      summary: "Seller asked for a callback tomorrow.",
      callback_requested: true,
      callback_due_at: "2026-03-31T17:00:00.000Z",
      callback_timing_text: "tomorrow afternoon",
      transfer_outcome: "callback_requested",
      assigned_to: null,
      task_id: null,
      policy_version: "test",
      metadata: {},
      reviewed_at: null,
      resolved_at: null,
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-03-30T00:00:00.000Z",
    };

    const taskId = await syncJeffTaskForInteraction(interaction);

    expect(taskId).toBe("task-1");
    expect(sb.tasksInsertSingle).not.toHaveBeenCalled();
    expect(sb.interactionsUpdateEq).toHaveBeenCalled();
    expect(sb.interactionsUpdateEq.mock.calls[0][0]).toBe("id");
  });

  it("creates an inbound Jeff task even when no lead is linked yet", async () => {
    const sb = createSupabaseMock({
      existingTask: null,
      leadAssignee: null,
      profiles: [
        { id: "logan-id", email: "logan@dominionhomedeals.com" },
        { id: "adam-id", email: "adam@dominionhomedeals.com" },
      ],
    });
    vi.mocked(createServerClient).mockReturnValue(sb as never);

    const interaction: JeffInteractionRecord = {
      id: "interaction-2",
      voice_session_id: "voice-2",
      lead_id: null,
      calls_log_id: "call-2",
      direction: "inbound",
      caller_phone: "+15095907091",
      caller_name: "Pat Seller",
      property_address: "123 Main St",
      interaction_type: "callback_request",
      status: "task_open",
      summary: "5095907091 called in. Spoke briefly with Jeff. Property address: 123 Main St. Requested a callback tomorrow at 2pm.",
      callback_requested: true,
      callback_due_at: "2026-03-31T21:00:00.000Z",
      callback_timing_text: "tomorrow at 2pm",
      transfer_outcome: "callback_requested",
      assigned_to: null,
      task_id: null,
      policy_version: "inbound-v1",
      metadata: {},
      reviewed_at: null,
      resolved_at: null,
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-03-30T00:00:00.000Z",
    };

    const taskId = await syncJeffTaskForInteraction(interaction);

    expect(taskId).toBe("new-task-1");
    expect(sb.tasksInsertSingle).toHaveBeenCalled();
  });
});
