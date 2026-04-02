import { TinaShell } from "@/tina/components/tina-shell";
import { TinaWorkspace } from "@/tina/components/tina-workspace";

export default function TinaPage() {
  return (
    <TinaShell
      eyebrow="Tina Workspace"
      title="Get your tax papers ready with Tina, one clear step at a time."
      description="Add your papers, answer a few simple questions, and let Tina keep your tax prep organized. Today, Tina helps you gather documents and check readiness before final review."
    >
      <TinaWorkspace />
    </TinaShell>
  );
}
