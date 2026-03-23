"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { NewProspectModal } from "@/components/sentinel/new-prospect-modal";
import { PropertyPreviewModal } from "@/components/sentinel/property-preview-modal";
import { Psalm20ThemeLayer } from "@/components/sentinel/psalm20/theme-layer";

export default function SentinelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden sentinel-gradient relative">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 relative">
        <TopBar />
        <Psalm20ThemeLayer>
          <main className="flex-1 overflow-auto main-gloss">{children}</main>
        </Psalm20ThemeLayer>
      </div>

      <NewProspectModal />
      <PropertyPreviewModal />
    </div>
  );
}
