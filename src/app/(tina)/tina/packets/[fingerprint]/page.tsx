import { TinaPacketReview } from "@/tina/components/tina-packet-review";
import { TinaShell } from "@/tina/components/tina-shell";

type PageProps = {
  params: Promise<{
    fingerprint: string;
  }>;
};

export default async function TinaPacketReviewPage({ params }: PageProps) {
  const { fingerprint } = await params;

  return (
    <TinaShell
      eyebrow="Saved Packet"
      title="Tina can reopen one exact saved packet."
      description="This view shows that saved packet, how it compares with today's work, and lets you redownload that exact revision without changing the live workspace."
      activeView="packets"
    >
      <TinaPacketReview fingerprint={fingerprint} />
    </TinaShell>
  );
}
