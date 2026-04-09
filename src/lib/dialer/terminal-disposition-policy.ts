export function resolveTerminalDispositionTargetStatus(
  disposition: "not_interested" | "disqualified" | "dead_lead" | "do_not_call",
): "dead" | "nurture" {
  return disposition === "disqualified" ? "nurture" : "dead";
}
