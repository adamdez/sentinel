import { TinaPacketHistory } from "@/tina/components/tina-packet-history";
import { TinaShell } from "@/tina/components/tina-shell";

export default function TinaPacketHistoryPage() {
  return (
    <TinaShell
      eyebrow="Saved Packets"
      title="Tina keeps older saved packets on one simple shelf."
      description="Use this history view when you need to reopen or compare an older packet without changing today's live workspace."
      activeView="packets"
    >
      <TinaPacketHistory />
    </TinaShell>
  );
}
