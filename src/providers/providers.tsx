"use client";

import { QueryProvider } from "./query-provider";
import { ModalProvider } from "./modal-provider";
import { RealtimeProvider } from "./realtime-provider";
import { AuthSyncProvider } from "./auth-sync-provider";
import { HydrationProvider } from "./hydration-provider";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { CoachProvider } from "./coach-provider";
import { ThemeProvider } from "./theme-provider";
import { ThemeAwareToaster } from "./theme-aware-toaster";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <HydrationProvider>
      <ThemeProvider>
      <AuthSyncProvider>
        <RealtimeProvider>
          <TooltipProvider delayDuration={200}>
            <ModalProvider>
              <CoachProvider>
              {children}
              </CoachProvider>
            <ThemeAwareToaster />
            </ModalProvider>
          </TooltipProvider>
        </RealtimeProvider>
      </AuthSyncProvider>
      </ThemeProvider>
      </HydrationProvider>
    </QueryProvider>
  );
}
