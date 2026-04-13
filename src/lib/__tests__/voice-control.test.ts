import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_CONTROL_CONFIG,
  getBusinessHoursStatus,
  normalizeVoiceControlConfig,
} from "@/lib/voice-control";

describe("normalizeVoiceControlConfig", () => {
  it("fills missing values from defaults", () => {
    const config = normalizeVoiceControlConfig({});

    expect(config.voicemailGreeting).toBe(DEFAULT_VOICE_CONTROL_CONFIG.voicemailGreeting);
    expect(config.businessHours.sunday.start).toBe("13:00");
    expect(config.uploadedGreeting).toBeNull();
    expect(config.useUploadedGreeting).toBe(false);
  });

  it("disables uploaded-greeting mode when the uploaded asset is invalid", () => {
    const config = normalizeVoiceControlConfig({
      useUploadedGreeting: true,
      uploadedGreeting: { nope: true },
    });

    expect(config.useUploadedGreeting).toBe(false);
    expect(config.uploadedGreeting).toBeNull();
  });
});

describe("getBusinessHoursStatus", () => {
  it("reports open during an enabled window", () => {
    const status = getBusinessHoursStatus(
      DEFAULT_VOICE_CONTROL_CONFIG.businessHours,
      new Date("2026-04-13T18:00:00.000Z"),
    );

    expect(status.isOpen).toBe(true);
    expect(status.nextOpenTime).toBe("");
  });

  it("reports the next opening when currently closed", () => {
    const status = getBusinessHoursStatus(
      DEFAULT_VOICE_CONTROL_CONFIG.businessHours,
      new Date("2026-04-13T05:00:00.000Z"),
    );

    expect(status.isOpen).toBe(false);
    expect(status.nextOpenTime).toBe("Monday at 7am");
  });

  it("skips disabled days when finding the next opening", () => {
    const status = getBusinessHoursStatus(
      {
        ...DEFAULT_VOICE_CONTROL_CONFIG.businessHours,
        monday: { enabled: false, start: "07:00", end: "20:30" },
        tuesday: { enabled: true, start: "09:30", end: "17:00" },
      },
      new Date("2026-04-13T06:00:00.000Z"),
    );

    expect(status.isOpen).toBe(false);
    expect(status.nextOpenTime).toBe("Tuesday at 9:30am");
  });
});
