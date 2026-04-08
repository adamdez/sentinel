export function didInboundDialLegAnswer(dialStatus: string, dialDuration: string | null): boolean {
  if (dialStatus === "in-progress") return true;
  if (dialStatus !== "completed") return false;
  const durationSec = Number.parseInt(dialDuration ?? "", 10);
  return Number.isFinite(durationSec) && durationSec > 0;
}
