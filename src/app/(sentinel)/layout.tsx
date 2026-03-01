"use client";

import dynamic from "next/dynamic";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { TeamChat } from "@/components/layout/team-chat";
import { NewProspectModal } from "@/components/sentinel/new-prospect-modal";

const ParticleField = dynamic(
  () => import("@/components/layout/particle-field").then((m) => m.ParticleField),
  { ssr: false }
);

export default function SentinelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden sentinel-gradient sentinel-grid-bg relative">
      <ParticleField />
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 relative z-10">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <TeamChat />
      <NewProspectModal />
    </div>
  );
}
