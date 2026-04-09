"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CRMLeadContext, LeadNotesPreview, RepeatCallMemory } from "@/lib/dialer/types";
import { RecentSellerNotes } from "@/components/sentinel/recent-seller-notes";

export interface SellerMemoryPanelProps {
  sessionId: string;
  context?: CRMLeadContext | null;
  className?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

function buildContextPreview(context: CRMLeadContext | null): LeadNotesPreview | null {
  if (!context) return null;

  const content = context.lastCallNotes?.trim() || context.lastCallAiSummary?.trim() || null;
  if (!content) return null;

  return {
    items: [
      {
        id: `context:${context.leadId}:${context.lastCallDate ?? "latest"}`,
        sourceType: context.lastCallNotes ? "call_summary" : "ai_summary",
        sourceLabel: context.lastCallNotes ? "Last call" : "AI summary",
        content,
        createdAt: context.lastCallDate ?? new Date().toISOString(),
        callLogId: null,
        sessionId: null,
        isAiGenerated: !context.lastCallNotes,
        isConfirmed: Boolean(context.lastCallNotes),
      },
    ],
  };
}

export function SellerMemoryPanel({ sessionId, context: contextProp, className = "" }: SellerMemoryPanelProps) {
  const [context, setContext] = useState<CRMLeadContext | null>(contextProp ?? null);
  const [contextLoading, setContextLoading] = useState(!contextProp);
  const [memory, setMemory] = useState<RepeatCallMemory | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);

  useEffect(() => {
    if (contextProp !== undefined) {
      setContext(contextProp);
      setContextLoading(false);
      return;
    }

    let cancelled = false;
    setContextLoading(true);

    authHeaders()
      .then((headers) => fetch(`/api/dialer/v1/sessions/${sessionId}`, { headers }))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("load failed"))))
      .then((data: { session: { context_snapshot?: CRMLeadContext | null } }) => {
        if (!cancelled) {
          setContext(data.session?.context_snapshot ?? null);
          setContextLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contextProp, sessionId]);

  const fetchMemory = useCallback((leadId: string) => {
    setMemoryLoading(true);

    authHeaders()
      .then((headers) => fetch(`/api/dialer/v1/leads/${leadId}/call-memory`, { headers }))
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { memory?: RepeatCallMemory | null } | null) => {
        setMemory(data?.memory ?? null);
      })
      .catch(() => {
        setMemory(null);
      })
      .finally(() => setMemoryLoading(false));
  }, []);

  useEffect(() => {
    if (!context?.leadId) return;
    fetchMemory(context.leadId);
  }, [context?.leadId, fetchMemory]);

  const preview = useMemo(
    () => (memory?.notesPreview?.items?.length ? memory.notesPreview : buildContextPreview(context)),
    [context, memory?.notesPreview],
  );

  if (!preview) {
    if (contextLoading || memoryLoading) {
      return (
        <div className={`flex items-center gap-2 py-2 text-xs text-muted-foreground/45 ${className}`}>
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading recent notes...
        </div>
      );
    }
    return null;
  }

  return <RecentSellerNotes preview={preview} title="Recent Notes" className={className} maxItems={3} />;
}
