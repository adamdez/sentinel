import { describe, expect, it } from "vitest";

import { resolveTerminalDispositionTargetStatus } from "@/lib/dialer/terminal-disposition-policy";

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
