import { describe, expect, it } from "vitest";

import {
  buildTerminalDispositionLeadPatch,
  resolveTerminalDispositionTargetStatus,
} from "@/lib/dialer/terminal-disposition-policy";

describe("resolveTerminalDispositionTargetStatus", () => {
  it("archives not interested leads as dead", () => {
    expect(resolveTerminalDispositionTargetStatus("not_interested")).toBe("dead");
  });

  it("keeps disqualified leads in nurture", () => {
    expect(resolveTerminalDispositionTargetStatus("disqualified")).toBe("nurture");
  });

  it("archives explicit dead leads as dead", () => {
    expect(resolveTerminalDispositionTargetStatus("dead_lead")).toBe("dead");
  });

  it("archives do not call as dead", () => {
    expect(resolveTerminalDispositionTargetStatus("do_not_call")).toBe("dead");
  });
});

describe("buildTerminalDispositionLeadPatch", () => {
  it("fully clears active work when not interested is published", () => {
    const patch = buildTerminalDispositionLeadPatch({
      disposition: "not_interested",
      lockVersion: 7,
      nowIso: "2026-04-10T18:00:00.000Z",
    });

    expect(patch).toMatchObject({
      status: "dead",
      qualification_route: "dead",
      next_action: null,
      next_action_due_at: null,
      next_call_scheduled_at: null,
      next_follow_up_at: null,
      follow_up_date: null,
      dial_queue_active: false,
      dial_queue_added_at: null,
      dial_queue_added_by: null,
      intro_sop_active: false,
      intro_completed_at: "2026-04-10T18:00:00.000Z",
      intro_exit_category: "dead",
      lock_version: 8,
    });
  });

  it("parks disqualified leads in nurture while clearing immediate call work", () => {
    const patch = buildTerminalDispositionLeadPatch({
      disposition: "disqualified",
      nowIso: "2026-04-10T18:00:00.000Z",
    });

    expect(patch).toMatchObject({
      status: "nurture",
      qualification_route: "nurture",
      next_action: null,
      dial_queue_active: false,
      intro_exit_category: "nurture",
    });
    expect(patch).not.toHaveProperty("lock_version");
  });
});
