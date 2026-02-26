/**
 * Compliance wrapper — DNC scrub, litigant suppression, opt-out enforcement.
 * No lead enters the dial queue without passing all compliance checks.
 */

export interface ComplianceResult {
  eligible: boolean;
  blockedReasons: string[];
  checkedAt: string;
}

const DNC_STUB: Set<string> = new Set([
  "+15555550100",
  "+15555550101",
]);

const LITIGANT_STUB: Set<string> = new Set([
  "litigant-001",
  "litigant-002",
]);

const OPT_OUT_STUB: Set<string> = new Set();

export function checkDialEligibility(
  phone: string,
  propertyId: string,
  ownerId: string
): ComplianceResult {
  const blockedReasons: string[] = [];

  if (DNC_STUB.has(phone)) {
    blockedReasons.push("DNC_REGISTERED");
  }

  if (LITIGANT_STUB.has(ownerId)) {
    blockedReasons.push("KNOWN_LITIGANT");
  }

  if (OPT_OUT_STUB.has(propertyId) || OPT_OUT_STUB.has(ownerId)) {
    blockedReasons.push("OPT_OUT");
  }

  return {
    eligible: blockedReasons.length === 0,
    blockedReasons,
    checkedAt: new Date().toISOString(),
  };
}

export function addToDnc(phone: string): void {
  DNC_STUB.add(phone);
}

export function addToOptOut(entityId: string): void {
  OPT_OUT_STUB.add(entityId);
}

export function checkNegativeStack(propertyId: string): boolean {
  // TODO: Check negative-stack suppression list
  return false;
}
