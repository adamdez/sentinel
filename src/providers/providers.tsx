"use client";

import { QueryProvider } from "./query-provider";
import { ModalProvider } from "./modal-provider";
import { RealtimeProvider } from "./realtime-provider";
import { AuthSyncProvider } from "./auth-sync-provider";
import { HydrationProvider } from "./hydration-provider";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Toaster } from "sonner";
import { CoachProvider } from "./coach-provider";
import { ThemeProvider } from "./theme-provider";

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
            <Toaster
              position="bottom-right"
              theme="dark"
              toastOptions={{
                style: {
                  background: "rgba(15, 15, 25, 0.9)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  backdropFilter: "blur(20px)",
                  color: "#e8e8ed",
                },
              }}
            />
            </ModalProvider>
          </TooltipProvider>
        </RealtimeProvider>
      </AuthSyncProvider>
      </ThemeProvider>
      </HydrationProvider>
    </QueryProvider>
  );
}
