import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-test-key";
});

describe("Jeff outbound conversation policy", () => {
  it("uses the new bounded sales-policy prompt", async () => {
    const [{ buildOutboundAssistantConfig }, { JEFF_OUTBOUND_POLICY_VERSION }] = await Promise.all([
      import("@/providers/voice/vapi-adapter"),
      import("@/lib/jeff-control"),
    ]);
    const config = buildOutboundAssistantConfig("https://example.com/api/voice/vapi/webhook");
    const systemPrompt = config.model.messages[0]?.content ?? "";

    expect(systemPrompt).toContain(JEFF_OUTBOUND_POLICY_VERSION);
    expect(systemPrompt).toContain("Steve Trang influence");
    expect(systemPrompt).toContain("NEPQ influence");
    expect(systemPrompt).toContain("Chris Voss influence");
    expect(systemPrompt).toContain("You do NOT negotiate.");
    expect(systemPrompt).toContain("Use a label only when the seller has already given you emotional material.");
    expect(systemPrompt).toContain("Keep pre-transfer discovery under about 2 minutes.");
  });
});
