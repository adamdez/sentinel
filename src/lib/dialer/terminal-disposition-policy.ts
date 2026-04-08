export function resolveTerminalDispositionTargetStatus(
  disposition: "not_interested" | "disqualified" | "dead_lead",
): "dead" | "nurture" {
  return disposition === "disqualified" ? "nurture" : "dead";
}
