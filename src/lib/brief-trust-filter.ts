/**
 * Brief trust filtering — suppress generic AI filler from pre-call briefs.
 *
 * A bullet/watch-out/goal is "generic" if it would apply to nearly any seller
 * call and does not change the operator's next move. Only lead-specific,
 * continuity-specific, or materially useful content should survive.
 */

const GENERIC_PHRASES: RegExp[] = [
  /\bbuild\s+rapport\b/i,
  /\bestablish\s+(rapport|connection|trust)\b/i,
  /\bcreate\s+(rapport|connection)\b/i,
  /\blisten\s+(carefully|actively|closely)\b/i,
  /\bactive\s+listening\b/i,
  /\bbe\s+(empathetic|empathic|understanding|patient|respectful|honest|transparent|calm)\b/i,
  /\bshow\s+(empathy|respect|understanding|patience)\b/i,
  /\bremain\s+(calm|patient|respectful)\b/i,
  /\bstay\s+(calm|patient|respectful)\b/i,
  /\bmaintain\s+(trust|rapport|composure)\b/i,
  /\bfocus\s+on\s+discovery\b/i,
  /\bdiscovery[- ]first\b/i,
  /\bqualify\s+the\s+(lead|seller|prospect)\b/i,
  /\badvance\s+the\s+(conversation|deal|relationship)\b/i,
  /\bkeep\s+the\s+(conversation|call)\s+(natural|flowing|going|casual)\b/i,
  /\bdon'?t\s+(be\s+)?(pushy|aggressive|rush|pressure)\b/i,
  /\bavoid\s+(being\s+)?(pushy|aggressive|assumptions|rushing)\b/i,
  /\bavoid\s+making\s+assumptions\b/i,
  /\brespect\s+their\s+(time|space|pace|feelings)\b/i,
  /\bbe\s+mindful\s+of\b/i,
  /\btake\s+(your|it)\s+(time|slow)\b/i,
  /\bdon'?t\s+rush\b/i,
  /\bdon'?t\s+come\s+across\s+as\b/i,
  /\bdon'?t\s+make\s+assumptions\b/i,
  /\bapproach\s+with\s+(sensitivity|care|caution|empathy)\b/i,
  /\bbe\s+sensitive\s+to\b/i,
  /\bunderstand\s+their\s+situation\b/i,
  /\blearn\s+about\s+their\s+situation\b/i,
  /\bclarify\s+(situation|motivation|timeline)\b/i,
  /\bunderstand\s+(motivation|timeline|needs)\b/i,
  /\bexplore\s+(motivation|timeline|needs|situation)\b/i,
  /\bassess\s+(condition|situation|needs|readiness)\b/i,
  /\bevaluate\s+(condition|situation|readiness)\b/i,
  /\bask\s+open[- ]ended\s+questions?\b/i,
  /\blet\s+them\s+(talk|speak|share)\b/i,
  /\bgather\s+(information|details|context)\b/i,
  /\bdetermine\s+(decision\s+maker|motivation|timeline)\b/i,
  /\bidentify\s+(decision\s+maker|motivation|needs)\b/i,
];

const GENERIC_GOAL_PHRASES: RegExp[] = [
  /\bclarify\s+situation\b/i,
  /\bunderstand\s+situation\b/i,
  /\bqualify\s+the\s+(lead|seller|prospect)\b/i,
  /\badvance\s+the\s+(conversation|deal)\b/i,
  /\bbuild\s+rapport\b/i,
  /\bexplore\s+motivation\s+and\s+timeline\b/i,
  /\bgather\s+(information|details|context)\b/i,
  /\bdiscover\s+(needs|situation|motivation)\b/i,
];

function isGenericText(text: string, patterns: RegExp[]): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 15) return true;
  return patterns.some((p) => p.test(trimmed));
}

export function filterBriefBullets(bullets: string[]): string[] {
  return bullets.filter((b) => !isGenericText(b, GENERIC_PHRASES));
}

export function filterBriefWatchOuts(watchOuts: string[]): string[] {
  return watchOuts.filter((w) => !isGenericText(w, GENERIC_PHRASES));
}

export function filterBriefGoal(goal: string): string | null {
  if (!goal) return null;
  if (isGenericText(goal, GENERIC_GOAL_PHRASES)) return null;
  return goal;
}
