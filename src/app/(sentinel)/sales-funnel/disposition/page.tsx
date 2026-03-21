"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DispositionPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dispo");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh] text-sm text-muted-foreground">
      Redirecting to Disposition workspace...
    </div>
  );
}
