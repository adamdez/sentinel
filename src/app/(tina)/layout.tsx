import type { Metadata } from "next";
import { TinaAuthGate } from "@/tina/components/tina-auth-gate";

export const metadata: Metadata = {
  title: {
    default: "Tina",
    template: "%s | Tina",
  },
  description:
    "Private business-tax workspace for gathering papers, checking numbers, and building a calm filing packet.",
};

export default function TinaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TinaAuthGate>{children}</TinaAuthGate>;
}
