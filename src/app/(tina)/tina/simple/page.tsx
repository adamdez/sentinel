import { TinaShell } from "@/tina/components/tina-shell";
import { TinaSimpleWorkspace } from "@/tina/components/tina-simple-workspace";

export default function TinaSimplePage() {
  return (
    <TinaShell
      eyebrow="Tina Simple"
      title="Simple Tina flow for the real next move."
      description="This route stays tied to Tina's engine truth. It shows what Tina needs right now, what is blocked, what a human still has to answer, and gives you a direct place to import real CPA review batches."
      secondaryLink={{ href: "/tina", label: "Open full workspace" }}
    >
      <TinaSimpleWorkspace />
    </TinaShell>
  );
}
