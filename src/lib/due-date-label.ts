export type DueDateLabel = {
  text: string;
  overdue: boolean;
  urgent: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDueDateLabel(iso: string | null | undefined, nowInput?: Date): DueDateLabel {
  if (!iso) return { text: "n/a", overdue: false, urgent: false };

  const dueAt = new Date(iso);
  if (Number.isNaN(dueAt.getTime())) return { text: "n/a", overdue: false, urgent: false };

  const now = nowInput ?? new Date();
  const diffMs = dueAt.getTime() - now.getTime();

  if (diffMs < 0) {
    const overdueDays = Math.max(1, Math.ceil(Math.abs(diffMs) / DAY_MS));
    if (overdueDays === 1) return { text: "Overdue today", overdue: true, urgent: true };
    return { text: `${overdueDays}d overdue`, overdue: true, urgent: true };
  }

  const dueDays = Math.floor(diffMs / DAY_MS);
  if (dueDays <= 0) return { text: "Due today", overdue: false, urgent: true };
  if (dueDays === 1) return { text: "Due tomorrow", overdue: false, urgent: true };
  return { text: `Due in ${dueDays}d`, overdue: false, urgent: false };
}
