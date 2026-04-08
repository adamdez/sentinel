export type InboundOperatorStep = "logan" | "adam";

type InboundRouteReason = "default" | "logan_direct" | "adam_direct" | "override";

export interface InboundRoutePlan {
  primaryStep: InboundOperatorStep;
  secondaryStep: InboundOperatorStep;
  primaryIdentity: string;
  secondaryIdentity: string;
  primaryUserId: string;
  secondaryUserId: string;
  reason: InboundRouteReason;
}

const DEFAULT_LOGAN_USER_ID = "0737e969-2908-4bd6-90bd-7a4380456811";
const DEFAULT_ADAM_USER_ID = "a1ad9af3-6c02-4df4-b25e-0f2fef6d1749";
const DEFAULT_LOGAN_BROWSER_IDENTITY = "logan@dominionhomedeals.com";
const DEFAULT_ADAM_BROWSER_IDENTITY = "adam@dominionhomedeals.com";

function normalizePhoneForMatch(value?: string | null): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function buildPlan(primaryStep: InboundOperatorStep, reason: InboundRouteReason): InboundRoutePlan {
  const loganIdentity = process.env.LOGAN_BROWSER_IDENTITY ?? DEFAULT_LOGAN_BROWSER_IDENTITY;
  const adamIdentity = process.env.ADAM_BROWSER_IDENTITY ?? DEFAULT_ADAM_BROWSER_IDENTITY;
  const loganUserId = process.env.LOGAN_USER_ID ?? DEFAULT_LOGAN_USER_ID;
  const adamUserId = process.env.ADAM_USER_ID ?? DEFAULT_ADAM_USER_ID;

  if (primaryStep === "adam") {
    return {
      primaryStep,
      secondaryStep: "logan",
      primaryIdentity: adamIdentity,
      secondaryIdentity: loganIdentity,
      primaryUserId: adamUserId,
      secondaryUserId: loganUserId,
      reason,
    };
  }

  return {
    primaryStep,
    secondaryStep: "adam",
    primaryIdentity: loganIdentity,
    secondaryIdentity: adamIdentity,
    primaryUserId: loganUserId,
    secondaryUserId: adamUserId,
    reason,
  };
}

export function parseInboundOperatorStep(value?: string | null): InboundOperatorStep | null {
  return value === "logan" || value === "adam" ? value : null;
}

export function resolveInboundRoutePlan(input: {
  toNumber?: string | null;
  primaryStepOverride?: InboundOperatorStep | null;
}): InboundRoutePlan {
  if (input.primaryStepOverride) {
    return buildPlan(input.primaryStepOverride, "override");
  }

  const toNumber = normalizePhoneForMatch(input.toNumber);
  const adamDirect = normalizePhoneForMatch(process.env.TWILIO_PHONE_NUMBER_ADAM);
  const loganDirect = normalizePhoneForMatch(process.env.TWILIO_PHONE_NUMBER_LOGAN);

  if (adamDirect && toNumber && toNumber === adamDirect) {
    return buildPlan("adam", "adam_direct");
  }

  if (loganDirect && toNumber && toNumber === loganDirect) {
    return buildPlan("logan", "logan_direct");
  }

  return buildPlan("logan", "default");
}
