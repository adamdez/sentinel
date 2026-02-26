"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { CommandPalette } from "@/components/layout/command-palette";
import { FloatingActionButton } from "@/components/layout/floating-action-button";
import { TeamChat } from "@/components/layout/team-chat";
import { NewProspectModal } from "@/components/sentinel/new-prospect-modal";

export default function SentinelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden sentinel-gradient sentinel-grid-bg">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CommandPalette />
      <FloatingActionButton />
      <TeamChat />
      <NewProspectModal />
    </div>
  );
}
