import { TinaShell } from "@/tina/components/tina-shell";
import { TinaWorkspace } from "@/tina/components/tina-workspace";

export default function TinaPage() {
  return (
    <TinaShell
      eyebrow="Tina Workspace"
      title="Tina now has a real intake flow."
      description="This slice adds the first working Tina stages: prior-year bootstrap, business organizer, deterministic filing-lane recommendation, and a personalized request list. The draft persists locally while we build Tina's full tax workspace backend."
    >
      <TinaWorkspace />
    </TinaShell>
  );
}
