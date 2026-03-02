"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Zap,
  Loader2,
  Trash2,
  Brain,
  Sparkles,
  ChevronDown,
  Play,
  CheckCircle2,
  XCircle,
  Shield,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { parseActionBlocks, GROK_ACTIONS } from "@/lib/grok-actions";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const STORAGE_KEY = "sentinel_grok_history";

function loadHistory(): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(msgs: ChatMsg[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-100)));
  } catch {/* quota exceeded — ignore */}
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

const SUGGESTIONS = [
  "What are our highest-priority leads right now?",
  "Analyse our crawl performance this week",
  "Which signal types are converting best?",
  "Draft a strategy to hit 20 leads/day",
  "What should we adjust in our scoring weights?",
  "Troubleshoot system — generate Cursor fix prompts for Claude",
];

export default function GrokPage() {
  const { currentUser } = useSentinelStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    setInput("");
    setError(null);

    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    const assistantMsg: ChatMsg = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => {
      const next = [...prev, userMsg, assistantMsg];
      saveHistory(next);
      return next;
    });

    setStreaming(true);

    const apiMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const FIRST_TOKEN_TIMEOUT_MS = 30_000;

    try {
      const authHeaders = await getAuthHeaders();
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/grok/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const serverMsg = err?.error;
        throw new Error(
          serverMsg
            ?? (res.status === 503 ? "Grok API key not configured — contact Adam."
               : res.status === 502 ? "Grok is temporarily unavailable. Please try again in a moment."
               : `Grok request failed (HTTP ${res.status}). Try again.`)
        );
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream reader");

      const decoder = new TextDecoder();
      let accumulated = "";
      let gotFirstToken = false;

      const firstTokenTimer = setTimeout(() => {
        if (!gotFirstToken) controller.abort();
      }, FIRST_TOKEN_TIMEOUT_MS);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                if (!gotFirstToken) {
                  gotFirstToken = true;
                  clearTimeout(firstTokenTimer);
                }
                accumulated += delta;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = { ...last, content: accumulated };
                  }
                  return updated;
                });
              }
            } catch {/* skip unparseable SSE lines */}
          }
        }
      } finally {
        clearTimeout(firstTokenTimer);
      }

      if (!accumulated.trim()) {
        throw new Error("Grok returned an empty response. Please try again.");
      }

      setMessages((prev) => {
        const final = [...prev];
        const last = final[final.length - 1];
        if (last?.role === "assistant") {
          final[final.length - 1] = { ...last, content: accumulated };
        }
        saveHistory(final);
        return final;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        const msg = "Grok took too long to respond. Please try again in a moment.";
        setError(msg);
        setMessages((prev) => {
          const updated = prev.filter((m) => m.id !== assistantMsg.id);
          saveHistory(updated);
          return updated;
        });
        return;
      }
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
      setMessages((prev) => {
        const updated = prev.filter((m) => m.id !== assistantMsg.id);
        saveHistory(updated);
        return updated;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages]);

  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const executeGrokAction = useCallback(async (action: string, params: Record<string, unknown>, description?: string) => {
    const actionDef = GROK_ACTIONS[action];
    if (!actionDef) {
      toast.error(`Unknown action: ${action}`);
      return;
    }

    if (actionDef.requiresConfirmation) {
      const confirmed = window.confirm(
        `Execute action: ${description ?? action}?\n\nThis will ${actionDef.description.toLowerCase()}.`
      );
      if (!confirmed) return;
    }

    const actionKey = `${action}-${Date.now()}`;
    setExecutingAction(actionKey);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/grok/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action, params }),
      });

      const result = await res.json();
      setActionResults((prev) => ({ ...prev, [actionKey]: result }));

      if (result.success) {
        toast.success(result.message?.slice(0, 100) ?? "Action executed");
      } else {
        toast.error(result.message?.slice(0, 100) ?? "Action failed");
      }
    } catch {
      toast.error("Failed to execute action");
      setActionResults((prev) => ({ ...prev, [actionKey]: { success: false, message: "Network error" } }));
    } finally {
      setExecutingAction(null);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-[12px] flex items-center justify-center"
              style={{
                background: "rgba(0, 229, 255, 0.08)",
                border: "1px solid rgba(0, 229, 255, 0.22)",
                boxShadow: "0 0 1px rgba(0,229,255,0.8), 0 0 4px rgba(0,229,255,0.35), 0 0 10px rgba(0,229,255,0.15), 0 0 20px rgba(0,229,255,0.06), inset 0 0 14px rgba(0,229,255,0.04)",
              }}
            >
              <Brain className="h-5 w-5 text-cyan drop-shadow-[0_0_10px_rgba(0,229,255,0.6)]" />
            </div>
            <div>
              <h2
                className="text-sm font-bold tracking-tight"
                style={{ textShadow: "0 0 0.8px rgba(255,255,255,0.5), 0 0 6px rgba(0,229,255,0.25), 0 0 16px rgba(0,229,255,0.1)" }}
              >
                GROK COMMAND CENTER
              </h2>
              <p className="text-[10px] text-muted-foreground/60 tracking-wider">
                xAI grok-3-mini &middot; Sentinel AI Brain
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => sendMessage("Troubleshoot the system. Read event_log errors, diagnose root causes, and generate complete ready-to-paste Cursor Composer prompts for Claude to fix every issue.")}
              disabled={streaming}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all disabled:opacity-40"
              style={{
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px solid rgba(168, 85, 247, 0.22)",
                color: "rgba(192, 132, 252, 0.9)",
                boxShadow: "0 0 8px rgba(168,85,247,0.1), inset 0 0 10px rgba(168,85,247,0.03)",
              }}
              title="Diagnose system errors and generate Cursor Composer prompts for Claude"
            >
              <Wrench className="h-3 w-3" />
              Generate Cursor Fix
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan/5 border border-cyan/10">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan animate-pulse" />
              <span className="text-[10px] text-cyan/80 font-medium">Online</span>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground/50 hover:text-destructive"
                title="Clear history"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
          {messages.length === 0 && !streaming && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center px-4"
            >
              <div
                className="h-16 w-16 rounded-[16px] flex items-center justify-center mb-6"
                style={{
                  background: "rgba(0, 229, 255, 0.06)",
                  border: "1px solid rgba(0, 229, 255, 0.15)",
                  boxShadow: "0 0 1px rgba(0,229,255,0.6), 0 0 8px rgba(0,229,255,0.25), 0 0 24px rgba(0,229,255,0.12), 0 0 52px rgba(0,229,255,0.05), 0 0 100px rgba(179,136,255,0.03), inset 0 0 28px rgba(0,229,255,0.04)",
                }}
              >
                <Sparkles className="h-8 w-8 text-cyan/70 drop-shadow-[0_0_14px_rgba(0,229,255,0.5)]" />
              </div>
              <h3
                className="text-lg font-bold mb-2"
                style={{ textShadow: "0 0 20px rgba(0,212,255,0.15)" }}
              >
                Welcome, {currentUser?.name || "Commander"}
              </h3>
              <p className="text-sm text-muted-foreground/60 max-w-md mb-8">
                I have full knowledge of the Dominion Charter, your scoring engine,
                all active crawlers, and live pipeline metrics. Ask me anything or
                request an action.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    onClick={() => sendMessage(s)}
                    className="text-left px-3 py-2.5 rounded-[12px] text-xs text-muted-foreground/80 hover:text-foreground border border-glass-border hover:border-cyan/22 bg-glass/30 hover:bg-cyan/5 transition-all duration-100"
                    style={{ backdropFilter: "blur(20px) saturate(1.3)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025), inset 0 0 12px rgba(0,229,255,0.01)" }}
                  >
                    <Zap className="h-3 w-3 text-cyan/50 inline mr-1.5" />
                    {s}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-[14px] px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-cyan/10 border border-cyan/20 text-foreground"
                      : "bg-glass/40 border border-glass-border text-foreground/90"
                  }`}
                  style={{
                    backdropFilter: "blur(52px) saturate(1.5) brightness(0.93)",
                    boxShadow: msg.role === "assistant"
                      ? "inset 0 0 4px rgba(0,229,255,0.04), inset 0 0 14px rgba(179,136,255,0.02), 0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)"
                      : "inset 0 0 4px rgba(0,229,255,0.06), 0 4px 20px rgba(0,229,255,0.1), inset 0 1px 0 rgba(0,229,255,0.05)",
                  }}
                >
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Brain className="h-3 w-3 text-cyan/60" />
                      <span className="text-[10px] text-cyan/50 font-medium tracking-wide">GROK</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content || (
                      <span className="inline-flex items-center gap-1 text-muted-foreground/50">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Thinking...
                      </span>
                    )}
                  </div>
                  {msg.role === "assistant" && msg.content && (() => {
                    const actions = parseActionBlocks(msg.content);
                    if (actions.length === 0) return null;
                    return (
                      <div className="mt-3 pt-2 border-t border-white/[0.06] space-y-2">
                        {actions.map((a, i) => {
                          const actionKey = `${msg.id}-${a.action}-${i}`;
                          const result = actionResults[actionKey];
                          const isExecuting = executingAction === actionKey;
                          const actionDef = GROK_ACTIONS[a.action];

                          return (
                            <div
                              key={i}
                              className="flex items-center gap-2 rounded-lg bg-cyan/[0.04] border border-cyan/15 px-3 py-2"
                            >
                              {actionDef?.requiresConfirmation && (
                                <Shield className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium text-cyan/90">
                                  {a.description ?? a.action}
                                </p>
                                <p className="text-[10px] text-muted-foreground/50">
                                  {actionDef?.description ?? a.action}
                                </p>
                              </div>
                              {result ? (
                                <div className="flex items-center gap-1">
                                  {result.success ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-400" />
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => executeGrokAction(a.action, a.params, a.description)}
                                  disabled={isExecuting || !!executingAction}
                                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-cyan/10 border border-cyan/20 text-cyan hover:bg-cyan/20 transition-all disabled:opacity-40"
                                >
                                  {isExecuting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Play className="h-3 w-3" />
                                  )}
                                  Execute
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {streaming && (
            <div className="flex justify-center py-2">
              <button
                onClick={() => abortRef.current?.abort()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground/60 hover:text-foreground border border-glass-border hover:border-cyan/20 transition-all"
              >
                <ChevronDown className="h-3 w-3" />
                Stop generating
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4"
            >
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-2">
                <Zap className="h-3 w-3 shrink-0" />
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-destructive/60 hover:text-destructive"
                >
                  &times;
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="px-4 pb-4 pt-2">
          <div
            className="flex items-end gap-2 rounded-[14px] px-4 py-3 border border-glass-border bg-glass/40"
            style={{
              backdropFilter: "blur(52px) saturate(1.5) brightness(0.93)",
              boxShadow: "inset 0 0 4px rgba(0,229,255,0.04), inset 0 0 14px rgba(179,136,255,0.02), 0 -4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Grok anything about your pipeline, strategy, or data..."
              rows={1}
              disabled={streaming}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none min-h-[24px] max-h-[120px] overflow-y-auto disabled:opacity-50"
              style={{ lineHeight: "1.5" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "24px";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || streaming}
              className="shrink-0 h-8 w-8 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-30"
              style={{
                background: input.trim() ? "rgba(0, 212, 255, 0.15)" : "transparent",
                border: `1px solid ${input.trim() ? "rgba(0, 212, 255, 0.3)" : "transparent"}`,
                boxShadow: input.trim() ? "0 0 12px rgba(0,212,255,0.1)" : "none",
              }}
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin text-cyan/60" />
              ) : (
                <Send className="h-4 w-4 text-cyan" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/30 text-center mt-2">
            Grok has full Charter context, live metrics, and can execute structured commands.
          </p>
        </div>
      </div>
  );
}
