"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { RepeatCallMemory } from "@/lib/dialer/types";
import { RecentSellerNotes } from "@/components/sentinel/recent-seller-notes";

interface Props {
  leadId: string;
  className?: string;
}

export function SellerMemoryPreview({ leadId, className = "" }: Props) {
  const [memory, setMemory] = useState<RepeatCallMemory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMemory(null);

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const response = await fetch(`/api/dialer/v1/leads/${leadId}/call-memory`, { headers }).catch(() => null);
      if (cancelled) return;

      if (response?.ok) {
        const data = await response.json().catch(() => ({} as { memory?: RepeatCallMemory | null }));
        setMemory(data.memory ?? null);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 py-2 text-xs text-muted-foreground/45 ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading recent notes...
      </div>
    );
  }

  return (
    <RecentSellerNotes
      preview={memory?.notesPreview}
      title="Recent Notes"
      className={className}
      maxItems={2}
    />
  );
}
