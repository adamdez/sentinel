export function resolveTerminalDispositionTargetStatus(
  disposition: "not_interested" | "disqualified" | "dead_lead" | "wrong_number" | "disconnected" | "do_not_call",
): "dead" | "nurture" {
  return disposition === "disqualified" ? "nurture" : "dead";
}
