import type { TinaChecklistItem } from "@/tina/types";

function uniqueById(items: TinaChecklistItem[]): TinaChecklistItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function pickFirst(
  items: TinaChecklistItem[],
  predicate: (item: TinaChecklistItem) => boolean
): TinaChecklistItem | null {
  return items.find(predicate) ?? null;
}

function excludePicked(
  items: TinaChecklistItem[],
  picked: TinaChecklistItem[]
): TinaChecklistItem[] {
  const pickedIds = new Set(picked.map((item) => item.id));
  return items.filter((item) => !pickedIds.has(item.id));
}

export function selectTinaVisibleChecklist(
  items: TinaChecklistItem[],
  limit = 3
): TinaChecklistItem[] {
  if (limit <= 0) return [];

  const needed = items.filter((item) => item.status === "needed");
  const first = needed[0] ?? null;
  if (needed.length <= limit && first?.kind !== "follow_up") return needed;

  const picked: TinaChecklistItem[] = [];
  if (first) picked.push(first);

  let remaining = excludePicked(needed, picked);

  if (first?.kind === "follow_up") {
    const secondFollowUp = pickFirst(
      remaining,
      (item) => item.kind === "follow_up" && item.action === "upload"
    );
    if (secondFollowUp) {
      picked.push(secondFollowUp);
      remaining = excludePicked(needed, picked);
    }

    const structuralAsk = pickFirst(
      remaining,
      (item) => item.kind === "replacement" || item.kind === "baseline"
    );
    if (structuralAsk && picked.length < limit) {
      picked.push(structuralAsk);
      remaining = excludePicked(needed, picked);
    }
  }

  if (picked.length < limit) {
    const answerOrReview = pickFirst(
      remaining,
      (item) => item.action === "answer" || item.action === "review"
    );
    if (answerOrReview) {
      picked.push(answerOrReview);
      remaining = excludePicked(needed, picked);
    }
  }

  if (picked.length < limit) {
    picked.push(...remaining.slice(0, limit - picked.length));
  }

  return uniqueById(picked).slice(0, limit);
}
