import { OperatorSafeBoundary } from "@/components/theme/operator-safe-boundary";

/**
 * All /dialer/* surfaces inherit operator-safe token resets under Ghost Mode
 * (and future packs) without per-page `PageShell operatorSafe`.
 */
export default function DialerLayout({ children }: { children: React.ReactNode }) {
  return (
    <OperatorSafeBoundary className="flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
    </OperatorSafeBoundary>
  );
}
