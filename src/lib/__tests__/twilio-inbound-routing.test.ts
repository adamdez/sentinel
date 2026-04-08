import { afterEach, describe, expect, it } from "vitest";
import { parseInboundOperatorStep, resolveInboundRoutePlan } from "@/lib/twilio-inbound-routing";

const ORIGINAL_ENV = {
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  TWILIO_PHONE_NUMBER_LOGAN: process.env.TWILIO_PHONE_NUMBER_LOGAN,
  TWILIO_PHONE_NUMBER_ADAM: process.env.TWILIO_PHONE_NUMBER_ADAM,
  LOGAN_USER_ID: process.env.LOGAN_USER_ID,
  ADAM_USER_ID: process.env.ADAM_USER_ID,
  LOGAN_BROWSER_IDENTITY: process.env.LOGAN_BROWSER_IDENTITY,
  ADAM_BROWSER_IDENTITY: process.env.ADAM_BROWSER_IDENTITY,
};

afterEach(() => {
  process.env.TWILIO_PHONE_NUMBER = ORIGINAL_ENV.TWILIO_PHONE_NUMBER;
  process.env.TWILIO_PHONE_NUMBER_LOGAN = ORIGINAL_ENV.TWILIO_PHONE_NUMBER_LOGAN;
  process.env.TWILIO_PHONE_NUMBER_ADAM = ORIGINAL_ENV.TWILIO_PHONE_NUMBER_ADAM;
  process.env.LOGAN_USER_ID = ORIGINAL_ENV.LOGAN_USER_ID;
  process.env.ADAM_USER_ID = ORIGINAL_ENV.ADAM_USER_ID;
  process.env.LOGAN_BROWSER_IDENTITY = ORIGINAL_ENV.LOGAN_BROWSER_IDENTITY;
  process.env.ADAM_BROWSER_IDENTITY = ORIGINAL_ENV.ADAM_BROWSER_IDENTITY;
});

describe("twilio inbound routing", () => {
  it("defaults to Logan-first for the shared inbound line", () => {
    process.env.TWILIO_PHONE_NUMBER = "+15099921136";
    process.env.TWILIO_PHONE_NUMBER_LOGAN = "+15099921136";
    process.env.TWILIO_PHONE_NUMBER_ADAM = "+15099923344";
    process.env.LOGAN_USER_ID = "user-logan";
    process.env.ADAM_USER_ID = "user-adam";

    const plan = resolveInboundRoutePlan({ toNumber: "+1 (509) 992-1136" });

    expect(plan.primaryStep).toBe("logan");
    expect(plan.secondaryStep).toBe("adam");
    expect(plan.primaryUserId).toBe("user-logan");
  });

  it("routes Adam direct calls to Adam first and Logan second", () => {
    process.env.TWILIO_PHONE_NUMBER = "+15099921136";
    process.env.TWILIO_PHONE_NUMBER_LOGAN = "+15099921136";
    process.env.TWILIO_PHONE_NUMBER_ADAM = "+15099923344";
    process.env.LOGAN_USER_ID = "user-logan";
    process.env.ADAM_USER_ID = "user-adam";
    process.env.LOGAN_BROWSER_IDENTITY = "logan@example.com";
    process.env.ADAM_BROWSER_IDENTITY = "adam@example.com";

    const plan = resolveInboundRoutePlan({ toNumber: "+1 509-992-3344" });

    expect(plan.primaryStep).toBe("adam");
    expect(plan.secondaryStep).toBe("logan");
    expect(plan.primaryUserId).toBe("user-adam");
    expect(plan.primaryIdentity).toBe("adam@example.com");
    expect(plan.secondaryIdentity).toBe("logan@example.com");
  });

  it("honors an explicit primary override for transfer-style routing", () => {
    const plan = resolveInboundRoutePlan({
      toNumber: "+15099923344",
      primaryStepOverride: "logan",
    });

    expect(plan.primaryStep).toBe("logan");
    expect(plan.secondaryStep).toBe("adam");
  });

  it("parses only the supported operator step values", () => {
    expect(parseInboundOperatorStep("adam")).toBe("adam");
    expect(parseInboundOperatorStep("logan")).toBe("logan");
    expect(parseInboundOperatorStep("jeff")).toBeNull();
    expect(parseInboundOperatorStep(null)).toBeNull();
  });
});
