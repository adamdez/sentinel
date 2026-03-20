import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import InboundDialerPageClient from "./inbound-page-client";

export const dynamic = "force-dynamic";

/**
 * Server wrapper — Next.js requires `useSearchParams()` to be under `<Suspense>`
 * owned by a Server Component parent (CSR bailout / static generation).
 */
export default function InboundPage() {
  return (
    <Suspense
      fallback={
        <PageShell title="Inbound Calls" description="Review, classify, and recover inbound calls">
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </PageShell>
      }
    >
      <InboundDialerPageClient />
    </Suspense>
  );
}
