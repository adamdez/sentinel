"use client";

import { QueryProvider } from "./query-provider";
import { ModalProvider } from "./modal-provider";
import { RealtimeProvider } from "./realtime-provider";
import { AuthSyncProvider } from "./auth-sync-provider";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthSyncProvider>
        <RealtimeProvider>
          <TooltipProvider delayDuration={200}>
            <ModalProvider>
              {children}
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
    </QueryProvider>
  );
}
