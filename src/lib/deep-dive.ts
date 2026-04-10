export const DEEP_DIVE_NEXT_ACTION = "Deep Dive";
export const DEEP_DIVE_READY_NEXT_ACTION = "Call researched lead";

export function isDeepDiveNextAction(nextAction: string | null | undefined): boolean {
  return typeof nextAction === "string" && nextAction.trim().toLowerCase().startsWith("deep dive");
}

export function getDefaultDeepDiveDueAt(now = new Date()): string {
  const due = new Date(now);

  // Earlier-day parks should surface again in the same day's prep block.
  if (due.getHours() < 15) {
    due.setHours(16, 30, 0, 0);
    return due.toISOString();
  }

  // Late-day parks should be ready for the next morning prep block.
  due.setDate(due.getDate() + 1);
  due.setHours(8, 30, 0, 0);
  return due.toISOString();
}
