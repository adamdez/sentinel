import { TinaShell } from "@/tina/components/tina-shell";
import { TinaWorkspace } from "@/tina/components/tina-workspace";

export default function TinaPage() {
  return (
    <TinaShell
      eyebrow="Tina Workspace"
      title="Bring in your papers, answer a few easy questions, and Tina keeps the tax trail steady."
      description="Start with last year's return if you have it. Tina will only ask for the next few things that matter, keep the math steady in code, and save the deeper review work for later."
      activeView="workspace"
    >
      <TinaWorkspace />
    </TinaShell>
  );
}
