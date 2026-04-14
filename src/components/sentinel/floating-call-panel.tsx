"use client";

import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  Mic,
  MicOff,
  ExternalLink,
  Loader2,
  FileText,
  Brain,
  StickyNote,
} from "lucide-react";
import { useTwilio } from "@/providers/twilio-provider";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useModal } from "@/providers/modal-provider";
import { useSentinelStore } from "@/lib/store";
import { useLiveCoach } from "@/hooks/use-live-coach";
import { usePreCallBrief } from "@/hooks/use-pre-call-brief";
import { LiveAssistPanel } from "@/components/sentinel/live-assist-panel";
import { PostCallPanel } from "@/components/sentinel/post-call-panel";
import { supabase } from "@/lib/supabase";
import type { CallState, CallMeta } from "@/providers/twilio-provider";

function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown";
  const d = raw.replace(/\D/g, "").slice(-10);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function buildIncomingFaviconDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#07111f"/>
      <path d="M21 17c2 0 3 1 4 3l3 7c1 2 0 4-2 5l-4 3c2 4 5 7 9 9l3-4c1-2 3-3 5-2l7 3c2 1 3 2 3 4 0 3-1 6-3 8-2 2-5 3-8 3-11 0-24-13-24-24 0-3 1-6 3-8 2-2 5-3 8-3z" fill="#f8fafc"/>
      <circle cx="49" cy="15" r="9" fill="#ef4444"/>
    </svg>
  `.trim();

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    function playRingBurst() {
      try {
        if (!ctxRef.current) ctxRef.current = new AudioContext();
        const ctx = ctxRef.current;
        const now = ctx.currentTime;

        [440, 480].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.8);
        });
      } catch {
        // Browser may block auto-play until user interaction.
      }
    }

    playRingBurst();
    intervalRef.current = setInterval(playRingBurst, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [active]);
}

function useIncomingCallAttention(active: boolean, incomingFrom: string | null) {
  const pathname = usePathname();
  const originalTitleRef = useRef<string>("");
  const originalFaviconRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const favicon = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (!originalTitleRef.current) {
      originalTitleRef.current = document.title;
    }
    if (favicon && originalFaviconRef.current == null) {
      originalFaviconRef.current = favicon.href;
    }

    if (!active || pathname === "/dialer") {
      document.title = originalTitleRef.current || document.title;
      if (favicon && originalFaviconRef.current) {
        favicon.href = originalFaviconRef.current;
      }
      return;
    }

    const callerLabel = formatPhone(incomingFrom);
    const incomingTitle = `Incoming Call - ${callerLabel}`;
    let alternate = false;

    if (favicon) {
      favicon.href = buildIncomingFaviconDataUrl();
    }

    document.title = incomingTitle;
    const interval = window.setInterval(() => {
      document.title = alternate ? incomingTitle : (originalTitleRef.current || "Sentinel");
      alternate = !alternate;
    }, 1000);

    return () => {
      window.clearInterval(interval);
      document.title = originalTitleRef.current || document.title;
      if (favicon && originalFaviconRef.current) {
        favicon.href = originalFaviconRef.current;
      }
    };
  }, [active, incomingFrom, pathname]);
}

type SavedNote = { content: string; time: string };

function buildGroupedNotes(chunks: string[]) {
  const grouped: string[] = [];
  let currentGroup = "";

  for (const chunk of chunks) {
    if (currentGroup.length + chunk.length > 300) {
      if (currentGroup) grouped.push(`Seller: "${currentGroup}"`);
      currentGroup = chunk;
    } else {
      currentGroup = currentGroup ? `${currentGroup} ${chunk}` : chunk;
    }
  }

  if (currentGroup) grouped.push(`Seller: "${currentGroup}"`);
  return grouped.slice(-12);
}

function GlobalCallWorkspace({
  callState,
  callMeta,
  elapsed,
  formatted,
  isMuted,
  endCall,
  toggleMute,
  clearCallState,
}: {
  callState: CallState;
  callMeta: CallMeta | null;
  elapsed: number;
  formatted: string;
  isMuted: boolean;
  endCall: () => void;
  toggleMute: () => void;
  clearCallState: () => void;
}) {
  const { currentUser } = useSentinelStore();
  const { openModal } = useModal();
  const sessionId = callMeta?.sessionId ?? null;
  const [callNotes, setCallNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [liveNotes, setLiveNotes] = useState<string[]>([]);
  const noteSeqRef = useRef(0);
  const pendingSavedNoteContentRef = useRef<string | null>(null);
  const transcriptSyncRef = useRef<{
    sessionId: string | null;
    lastSequence: number;
    sellerChunks: string[];
  }>({
    sessionId: null,
    lastSequence: 0,
    sellerChunks: [],
  });

  const { brief } = usePreCallBrief(callMeta?.leadId ?? null, callMeta?.phone ?? null);
  const {
    coach,
    loading: coachLoading,
    error: coachError,
  } = useLiveCoach({
    sessionId,
    enabled: Boolean(sessionId && (callState === "connected" || callState === "ended")),
    mode: callMeta?.direction === "inbound" ? "inbound" : "outbound",
    intervalMs: 1500,
  });

  useEffect(() => {
    setCallNotes("");
    setSavedNotes([]);
    setLiveNotes([]);
    noteSeqRef.current = 0;
    pendingSavedNoteContentRef.current = null;
    transcriptSyncRef.current = {
      sessionId,
      lastSequence: 0,
      sellerChunks: [],
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || (callState !== "connected" && callState !== "ended")) return;

    if (transcriptSyncRef.current.sessionId !== sessionId) {
      transcriptSyncRef.current = {
        sessionId,
        lastSequence: 0,
        sellerChunks: [],
      };
    }

    let cancelled = false;
    let timer: number | null = null;

    const pollNotes = async () => {
      try {
        const headers = await authHeaders();
        const syncState = transcriptSyncRef.current;
        const searchParams = new URLSearchParams({ note_type: "transcript_chunk" });
        if (syncState.lastSequence > 0) {
          searchParams.set("after_sequence", String(syncState.lastSequence));
          searchParams.set("limit", "120");
        }

        const res = await fetch(
          `/api/dialer/v1/sessions/${sessionId}/notes?${searchParams.toString()}`,
          { headers },
        );
        if (!res.ok) return;

        const data = await res.json() as {
          notes?: Array<{
            content: string | null;
            speaker: "operator" | "seller" | "ai" | null;
            sequence_num: number;
          }>;
        };

        if (cancelled) return;

        const notes = data.notes ?? [];
        if (notes.length > 0) {
          const newestSequence = Math.max(
            transcriptSyncRef.current.lastSequence,
            ...notes.map((note) => note.sequence_num),
          );
          transcriptSyncRef.current.lastSequence = newestSequence;

          const sellerChunks = notes
            .filter((note) => note.speaker === "seller" && typeof note.content === "string")
            .map((note) => note.content!.trim())
            .filter((content) => content.length > 0);

          transcriptSyncRef.current.sellerChunks = [
            ...transcriptSyncRef.current.sellerChunks,
            ...sellerChunks,
          ].slice(-60);
        }

        setLiveNotes(buildGroupedNotes(transcriptSyncRef.current.sellerChunks));
      } catch (error) {
        if (!cancelled) {
          console.warn("[FloatingCallPanel] transcript poll failed:", error);
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => {
            void pollNotes();
          }, 1800);
        }
      }
    };

    void pollNotes();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [callState, sessionId]);

  const displayedLiveNotes = useMemo(() => {
    if (liveNotes.length > 0) return liveNotes;
    if (coach?.structuredLiveNotes?.length) {
      return coach.structuredLiveNotes.map((note) => note.text);
    }
    return [];
  }, [coach?.structuredLiveNotes, liveNotes]);

  const persistOperatorDraftNote = useCallback(async (options?: {
    toastOnSaved?: boolean;
    toastOnDuplicate?: boolean;
  }) => {
    if (!sessionId) return false;
    const content = callNotes.trim();
    if (!content) return false;

    const alreadySaved = savedNotes.some((note) => note.content.trim() === content);
    if (alreadySaved || pendingSavedNoteContentRef.current === content) {
      if (options?.toastOnDuplicate) {
        toast.info("Latest note is already saved", { duration: 1500 });
      }
      return false;
    }

    noteSeqRef.current += 1;
    pendingSavedNoteContentRef.current = content;

    try {
      const res = await fetch(`/api/dialer/v1/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          note_type: "operator_note",
          content,
          speaker: "operator",
          sequence_num: noteSeqRef.current,
          is_ai_generated: false,
        }),
      });

      if (!res.ok) return false;

      setSavedNotes((prev) => {
        if (prev.some((note) => note.content.trim() === content)) return prev;
        return [...prev, { content, time: new Date().toISOString() }];
      });

      if (options?.toastOnSaved) {
        toast.success("Note saved", { duration: 1500 });
      }

      return true;
    } catch {
      return false;
    } finally {
      if (pendingSavedNoteContentRef.current === content) {
        pendingSavedNoteContentRef.current = null;
      }
    }
  }, [callNotes, savedNotes, sessionId]);

  const handleSaveNote = useCallback(async () => {
    if (!sessionId || !callNotes.trim() || savingNote) return;
    setSavingNote(true);
    try {
      await persistOperatorDraftNote({ toastOnSaved: true, toastOnDuplicate: true });
    } finally {
      setSavingNote(false);
    }
  }, [callNotes, persistOperatorDraftNote, savingNote, sessionId]);

  const handleOpenFile = useCallback(() => {
    if (!callMeta?.leadId) return;
    openModal("client-file", { leadId: callMeta.leadId });
  }, [callMeta?.leadId, openModal]);

  const ownerLabel = callMeta?.leadName || "Live Call";
  const phoneLabel = formatPhone(callMeta?.phone ?? null);
  const statusTone = callState === "dialing"
    ? "text-amber-300"
    : callState === "ended"
      ? "text-muted-foreground"
      : "text-emerald-300";

  if (callState === "ended" && sessionId) {
    return (
      <div className="max-h-[80vh] overflow-y-auto p-3">
        <PostCallPanel
          sessionId={sessionId}
          callLogId={callMeta?.callLogId ?? null}
          userId={currentUser.id}
          timerElapsed={elapsed}
          initialSummary={callNotes}
          phoneNumber={callMeta?.phone ?? null}
          leadId={callMeta?.leadId ?? null}
          beforePublish={() => persistOperatorDraftNote()}
          onComplete={() => clearCallState()}
          onSkip={() => clearCallState()}
        />
      </div>
    );
  }

  if (callState === "ended") {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-overlay-8 bg-overlay-2 p-4">
          <p className="text-sm font-semibold text-foreground">Call ended</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sentinel could not keep a full closeout session for this call, so there is nothing else you need to save here.
          </p>
          <button
            onClick={clearCallState}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-overlay-8 bg-overlay-3 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear call workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <div className="border-b border-overlay-8 px-4 py-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
              callState === "dialing"
                ? "border-amber-400/20 bg-amber-500/10 text-amber-300"
                : "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
            )}
          >
            {callState === "dialing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{ownerLabel}</p>
              <span className={cn("text-[11px] uppercase tracking-[0.18em]", statusTone)}>
                {callState === "dialing" ? "Dialing" : formatted}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{phoneLabel}</p>
            {callMeta?.propertyAddress && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/70">
                {callMeta.propertyAddress}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={toggleMute}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              isMuted
                ? "border-amber-400/20 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                : "border-overlay-8 bg-overlay-3 text-muted-foreground hover:text-foreground",
            )}
          >
            {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {isMuted ? "Unmute" : "Mute"}
          </button>

          <button
            onClick={endCall}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            Hang up
          </button>

          {callMeta?.leadId && (
            <button
              onClick={handleOpenFile}
              className="inline-flex items-center gap-1.5 rounded-lg border border-overlay-8 bg-overlay-3 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" />
              Open file
            </button>
          )}

          <Link
            href="/dialer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-overlay-8 bg-overlay-3 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            title="Open in Dialer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Dialer
          </Link>
        </div>
      </div>

      {(callState === "connected" || displayedLiveNotes.length > 0) && (
        <div className="border-b border-overlay-8 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <StickyNote className="h-3.5 w-3.5 text-primary/70" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {coach?.structuredLiveNotes?.length ? "Structured Live Notes" : "Live Notes"}
            </p>
          </div>
          {displayedLiveNotes.length > 0 ? (
            <ul className="space-y-1.5">
              {displayedLiveNotes.map((note, index) => (
                <li key={`${note}-${index}`} className="flex items-start gap-1.5 text-sm text-foreground/80">
                  <span className="mt-0.5 shrink-0 text-primary/40">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-muted-foreground/45">
              Notes will appear as the conversation progresses...
            </p>
          )}
        </div>
      )}

      <div className="border-b border-overlay-8 px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <StickyNote className="h-3.5 w-3.5 text-primary/70" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Operator Notes
          </p>
        </div>
        <textarea
          value={callNotes}
          onChange={(event) => setCallNotes(event.target.value)}
          placeholder="Take notes while you talk... these carry straight into closeout."
          className="h-24 w-full resize-none rounded-xl border border-overlay-8 bg-overlay-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/35"
        />
        {callState === "connected" && sessionId && (
          <div className="mt-2 border-t border-overlay-6 pt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveNote}
                disabled={savingNote || !callNotes.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
              >
                {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save note with timestamp
              </button>
              {savedNotes.length > 0 && (
                <span className="text-xs text-muted-foreground/45">{savedNotes.length} saved</span>
              )}
            </div>
            {savedNotes.length > 0 && (
              <div className="mt-2 space-y-1">
                {savedNotes.map((note, index) => (
                  <div key={`${note.time}-${index}`} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 font-mono text-muted-foreground/45">
                      {new Date(note.time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="text-foreground/65">{note.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-primary/70" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Sales Coach
          </p>
        </div>
        <LiveAssistPanel
          brief={brief}
          coach={coach}
          loading={coachLoading}
          error={coachError}
          className="border border-overlay-8 bg-overlay-2"
        />
      </div>
    </div>
  );
}

export function FloatingCallPanel() {
  const {
    callState,
    callMeta,
    elapsed,
    formatted,
    isMuted,
    incomingCall,
    incomingFrom,
    incomingMeta,
    endCall,
    toggleMute,
    answerIncoming,
    rejectIncoming,
    clearCallState,
  } = useTwilio();
  const { openModal } = useModal();
  const pathname = usePathname();

  const isIncoming = callState === "incoming" && !!incomingCall;

  useRingtone(isIncoming && pathname !== "/dialer");
  useIncomingCallAttention(isIncoming, incomingFrom);

  if (pathname === "/dialer") return null;
  if (callState === "idle") return null;

  if (isIncoming) {
    return (
      <>
        <div className="fixed inset-0 z-[9998] bg-black/75 backdrop-blur-sm" />

        <div className="fixed inset-0 z-[9999] animate-in fade-in duration-200">
          <div className="flex h-full items-center justify-center p-4 sm:p-8">
            <div className="relative w-full max-w-4xl overflow-hidden rounded-[28px] border border-emerald-400/30 bg-[#06131f]/95 shadow-[0_30px_120px_rgba(16,185,129,0.25)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.16),transparent_50%)]" />
              <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr,auto] lg:items-center">
                <div className="flex items-start gap-5">
                  <div className="relative mt-1">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/18 ring-4 ring-emerald-300/15">
                      <PhoneIncoming className="h-10 w-10 text-emerald-200" />
                    </div>
                    <span className="absolute -right-1 -top-1 h-5 w-5 animate-ping rounded-full bg-emerald-300" />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-emerald-200/75">
                        Incoming Call
                      </p>
                      <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                        {formatPhone(incomingFrom)}
                      </h2>
                      {(incomingMeta?.leadName || incomingMeta?.propertyAddress) && (
                        <div className="pt-1">
                          {incomingMeta?.leadName && (
                            <p className="text-sm font-medium text-emerald-100">
                              {incomingMeta.leadName}
                            </p>
                          )}
                          {incomingMeta?.propertyAddress && (
                            <p className="max-w-2xl text-sm leading-6 text-emerald-100/80">
                              {incomingMeta.propertyAddress}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-emerald-100/80 sm:text-base">
                      Answer here and Sentinel will keep the full call workspace with notes, coach, and closeout available wherever you are.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <button
                    onClick={() => { void answerIncoming(); }}
                    className="flex min-w-[180px] items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-6 py-4 text-base font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-200"
                  >
                    <Phone className="h-5 w-5" />
                    Answer now
                  </button>
                  <button
                    onClick={rejectIncoming}
                    className="flex min-w-[180px] items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/15 px-6 py-4 text-base font-semibold text-red-100 transition-all hover:bg-red-500/25"
                  >
                    <PhoneOff className="h-5 w-5" />
                    Reject
                  </button>
                  {incomingMeta?.leadId && (
                    <button
                      onClick={() => openModal("client-file", { leadId: incomingMeta.leadId })}
                      className="flex min-w-[180px] items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 px-6 py-4 text-base font-semibold text-white/90 transition-all hover:bg-white/10"
                    >
                      <FileText className="h-5 w-5" />
                      Open file
                    </button>
                  )}
                  <Link
                    href="/dialer"
                    className="flex min-w-[180px] items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 px-6 py-4 text-base font-semibold text-white/90 transition-all hover:bg-white/10"
                    title="Open in Dialer for full context"
                  >
                    <ExternalLink className="h-5 w-5" />
                    Open dialer
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-overlay-10 bg-card/95 shadow-[0_24px_80px_var(--shadow-heavy)] backdrop-blur-xl">
      <GlobalCallWorkspace
        callState={callState}
        callMeta={callMeta}
        elapsed={elapsed}
        formatted={formatted}
        isMuted={isMuted}
        endCall={endCall}
        toggleMute={toggleMute}
        clearCallState={clearCallState}
      />
    </div>
  );
}
