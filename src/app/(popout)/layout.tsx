import { OperatorSafeBoundary } from "@/components/theme/operator-safe-boundary";

export default function PopoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <OperatorSafeBoundary className="flex min-h-screen min-w-0 flex-col bg-background">
      {children}
    </OperatorSafeBoundary>
  );
}
