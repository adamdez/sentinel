import { describe, expect, it } from "vitest";

import { didInboundDialLegAnswer } from "@/lib/twilio-inbound-classification";

describe("didInboundDialLegAnswer", () => {
  it("treats in-progress dial legs as answered", () => {
    expect(didInboundDialLegAnswer("in-progress", null)).toBe(true);
  });

  it("requires real duration before a completed dial leg counts as answered", () => {
    expect(didInboundDialLegAnswer("completed", "12")).toBe(true);
    expect(didInboundDialLegAnswer("completed", "0")).toBe(false);
    expect(didInboundDialLegAnswer("completed", null)).toBe(false);
  });

  it("does not treat failed browser rings as answered", () => {
    expect(didInboundDialLegAnswer("no-answer", null)).toBe(false);
    expect(didInboundDialLegAnswer("busy", null)).toBe(false);
    expect(didInboundDialLegAnswer("canceled", null)).toBe(false);
  });
});
