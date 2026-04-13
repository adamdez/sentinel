import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  createServerClient: vi.fn(),
  didInboundDialLegAnswer: vi.fn(),
  getBusinessHoursStatus: vi.fn(),
  getVoiceControlConfig: vi.fn(),
  upsertJeffInteraction: vi.fn(),
  parseInboundOperatorStep: vi.fn(),
  resolveInboundRoutePlan: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: mocks.after,
  };
});

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/twilio-inbound-classification", () => ({
  didInboundDialLegAnswer: mocks.didInboundDialLegAnswer,
}));

vi.mock("@/lib/jeff-interactions", () => ({
  upsertJeffInteraction: mocks.upsertJeffInteraction,
}));

vi.mock("@/lib/voice-control", async () => {
  const actual = await vi.importActual<typeof import("@/lib/voice-control")>("@/lib/voice-control");
  return {
    ...actual,
    getVoiceControlConfig: mocks.getVoiceControlConfig,
    getBusinessHoursStatus: mocks.getBusinessHoursStatus,
  };
});

vi.mock("@/lib/twilio-inbound-routing", () => ({
  parseInboundOperatorStep: mocks.parseInboundOperatorStep,
  resolveInboundRoutePlan: mocks.resolveInboundRoutePlan,
}));

function createFormRequest(url: string, fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return new Request(url, {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/twilio/inbound voicemail routing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.after.mockImplementation(() => {});
    mocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnThis(),
      })),
    });
    mocks.didInboundDialLegAnswer.mockReturnValue(false);
    mocks.getVoiceControlConfig.mockResolvedValue({
      businessHours: {
        monday: { enabled: true, start: "07:00", end: "20:30" },
        tuesday: { enabled: true, start: "07:00", end: "20:30" },
        wednesday: { enabled: true, start: "07:00", end: "20:30" },
        thursday: { enabled: true, start: "07:00", end: "20:30" },
        friday: { enabled: true, start: "07:00", end: "20:30" },
        saturday: { enabled: true, start: "07:00", end: "20:30" },
        sunday: { enabled: true, start: "13:00", end: "17:00" },
      },
      voicemailGreeting: "We missed your call. Leave a message after the tone.",
      noVoicemailMessage: "We did not receive a voicemail. Goodbye.",
      ttsVoice: "Polly.Joanna",
      useUploadedGreeting: false,
      uploadedGreeting: null,
    });
    mocks.getBusinessHoursStatus.mockReturnValue({
      isOpen: true,
      nextOpenTime: "tomorrow at 9 AM",
    });
    mocks.parseInboundOperatorStep.mockImplementation((value: string | null | undefined) => value ?? null);
    mocks.resolveInboundRoutePlan.mockReturnValue({
      primaryStep: "logan",
      primaryIdentity: "logan-browser",
      primaryUserId: "user-logan",
      secondaryStep: "adam",
      secondaryIdentity: "adam-browser",
      secondaryUserId: "user-adam",
    });

    process.env.TWILIO_PHONE_NUMBER = "+15095550000";
    process.env.VAPI_PHONE_NUMBER = "+15095559999";
  });

  it("sends after-hours callers directly to voicemail instead of Jeff", async () => {
    mocks.getBusinessHoursStatus.mockReturnValue({
      isOpen: false,
      nextOpenTime: "tomorrow at 9 AM",
    });

    const { POST } = await import("@/app/api/twilio/inbound/route");
    const response = await POST(createFormRequest("http://localhost/api/twilio/inbound", {
      From: "+15095551234",
      To: "+15095550000",
      CallSid: "CA_after_hours",
    }) as never);

    const twiml = await response.text();

    expect(response.status).toBe(200);
    expect(twiml).toContain("<Record");
    expect(twiml).toContain("Our team is away right now.");
    expect(twiml).not.toContain("<Number>");
    expect(twiml).not.toContain("vapiRoute");
  });

  it("sends exhausted browser chains to voicemail instead of Jeff", async () => {
    const { POST } = await import("@/app/api/twilio/inbound/route");
    const response = await POST(createFormRequest(
      "http://localhost/api/twilio/inbound?type=chain_step&step=adam&primary=logan&sessionId=session-1&callLogId=call-log-1&originalFrom=%2B15095551234&originalTo=%2B15095550000",
      {
        From: "+15095551234",
        CallSid: "CA_chain_exhausted",
        DialCallStatus: "no-answer",
      },
    ) as never);

    const twiml = await response.text();

    expect(response.status).toBe(200);
    expect(twiml).toContain("<Record");
    expect(twiml).not.toContain("<Number>");
    expect(twiml).not.toContain("operator_missed");
  });
});
