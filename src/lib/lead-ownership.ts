export function normalizeAssignedUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "unassigned") return null;
  return trimmed;
}

export function isLeadUnclaimed(assignedUserId: unknown): boolean {
  return normalizeAssignedUserId(assignedUserId) === null;
}

export function canUserClaimLead(input: {
  assignedUserId: unknown;
  claimantUserId: string | null | undefined;
}): boolean {
  const claimantUserId = normalizeAssignedUserId(input.claimantUserId);
  if (!claimantUserId) return false;

  const assignedUserId = normalizeAssignedUserId(input.assignedUserId);
  return assignedUserId === null || assignedUserId === claimantUserId;
}
