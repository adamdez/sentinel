"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.access_token)
    headers["Authorization"] = `Bearer ${session.access_token}`;
  return headers;
}

function toE164(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return `+1${digits.slice(0, 10)}`;
}

export type DeviceStatus = "initializing" | "ready" | "error" | "offline";
export type CallState = "idle" | "incoming" | "dialing" | "connected" | "ended";

export interface CallMeta {
  phone: string;
  leadId?: string;
  leadName?: string;
  callLogId?: string;
  sessionId?: string;
}

interface TwilioContextValue {
  deviceStatus: DeviceStatus;
  activeCall: Call | null;
  callState: CallState;
  callMeta: CallMeta | null;
  incomingCall: Call | null;
  incomingFrom: string | null;
  isMuted: boolean;
  elapsed: number;
  formatted: string;
  voipCallerId: string;
  deviceRef: React.RefObject<Device | null>;
  startCall: (
    phone: string,
    leadId?: string,
    leadName?: string,
  ) => Promise<void>;
  endCall: () => void;
  answerIncoming: () => void;
  rejectIncoming: () => void;
  toggleMute: () => void;
  initDevice: () => Promise<void>;
  setSuppressIncoming: (v: boolean) => void;
}

const TwilioContext = createContext<TwilioContextValue | null>(null);

export function useTwilio(): TwilioContextValue {
  const ctx = useContext(TwilioContext);
  if (!ctx)
    throw new Error("useTwilio must be used within a TwilioProvider");
  return ctx;
}

export function TwilioProvider({ children }: { children: ReactNode }) {
  const { currentUser, ghostMode } = useSentinelStore();

  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("initializing");
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [callMeta, setCallMeta] = useState<CallMeta | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [voipCallerId, setVoipCallerId] = useState("");

  // Call timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStart = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, []);
  const timerStop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const timerReset = useCallback(() => {
    timerStop();
    setElapsed(0);
  }, [timerStop]);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  const formatted = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`;

  // Request notification permission for incoming calls
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // When true, the provider skips its own incoming-call state management
  // so the dialer page's richer handler runs alone (no duplicate toasts/listeners).
  const suppressIncomingRef = useRef(false);
  const setSuppressIncoming = useCallback((v: boolean) => {
    suppressIncomingRef.current = v;
  }, []);

  // Track callState in a ref so the incoming handler can guard against
  // a second inbound arriving while already on a call.
  const callStateRef = useRef<CallState>("idle");
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  const deviceRef = useRef<Device | null>(null);
  const initDeviceCancelRef = useRef<(() => void) | null>(null);

  const initDevice = useCallback(async () => {
    if (!currentUser.id) return;

    if (initDeviceCancelRef.current) initDeviceCancelRef.current();
    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }

    let cancelled = false;
    const cancel = () => { cancelled = true; };
    initDeviceCancelRef.current = cancel;
    setDeviceStatus("initializing");

    try {
      const hdrs = await authHeaders();
      const res = await fetch("/api/twilio/token", { headers: hdrs });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Token fetch failed" }));
        console.warn("[VoIP] Token error:", err.error);
        if (!cancelled) setDeviceStatus("error");
        return;
      }

      const { token, callerId: cid } = await res.json();
      if (cancelled) return;
      setVoipCallerId(cid || "");

      const device = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        closeProtection: "A call is in progress. Are you sure you want to leave?",
      });

      device.on("registered", () => {
        if (!cancelled) {
          setDeviceStatus("ready");
          console.log("[VoIP] Device registered");
        }
      });

      device.on("error", (err: { message?: string }) => {
        console.error("[VoIP] Device error:", err);
        if (!cancelled) setDeviceStatus("error");
      });

      device.on("unregistered", () => {
        if (!cancelled) setDeviceStatus("offline");
      });

      device.on("tokenWillExpire", async () => {
        try {
          const hdrs2 = await authHeaders();
          const r = await fetch("/api/twilio/token", { headers: hdrs2 });
          if (r.ok) {
            const { token: newToken } = await r.json();
            device.updateToken(newToken);
            console.log("[VoIP] Token refreshed");
          }
        } catch {
          console.warn("[VoIP] Token refresh failed");
        }
      });

      device.on("incoming", (call: Call) => {
        if (cancelled) return;

        // Dialer page registers its own richer handler — skip provider state
        if (suppressIncomingRef.current) return;

        // Guard: reject if already on a call (prevents UI state corruption)
        const current = callStateRef.current;
        if (current === "connected" || current === "dialing" || current === "incoming") {
          console.log("[VoIP] Rejecting incoming — already in state:", current);
          call.reject();
          return;
        }

        const from = call.parameters?.From ?? "Unknown";
        console.log("[VoIP] Incoming call from", from);
        setIncomingCall(call);
        setIncomingFrom(from);
        setCallState("incoming");

        toast("Incoming call", {
          description: from,
          duration: 30_000,
        });

        // Browser notification
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Incoming Call", {
            body: `Call from ${from}`,
            icon: "/icon.svg",
            requireInteraction: true,
          });
        }

        call.on("cancel", () => {
          console.log("[VoIP] Incoming call cancelled");
          setIncomingCall(null);
          setIncomingFrom(null);
          setCallState((prev) => prev === "incoming" ? "idle" : prev);
        });

        call.on("disconnect", () => {
          setIncomingCall(null);
          setIncomingFrom(null);
        });
      });

      await device.register();
      if (!cancelled) deviceRef.current = device;
    } catch (err) {
      console.error("[VoIP] Device init failed:", err);
      if (!cancelled) setDeviceStatus("error");
    }
  }, [currentUser.id]);

  useEffect(() => {
    if (!currentUser.id) return;
    initDevice();

    const timeout = setTimeout(() => {
      if (deviceRef.current === null) {
        setDeviceStatus("error");
        console.warn("[VoIP] Connection timed out");
      }
    }, 15_000);

    return () => {
      clearTimeout(timeout);
      if (initDeviceCancelRef.current) initDeviceCancelRef.current();
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, [currentUser.id, initDevice]);

  const startCall = useCallback(
    async (phone: string, leadId?: string, leadName?: string) => {
      if (!deviceRef.current || deviceStatus !== "ready") {
        toast.error("VoIP not connected — click Reconnect and try again");
        return;
      }

      setCallState("dialing");
      setIsMuted(false);
      timerStart();

      const meta: CallMeta = { phone, leadId, leadName };

      try {
        let newSessionId: string | null = null;
        if (leadId) {
          try {
            const sessionRes = await fetch("/api/dialer/v1/sessions", {
              method: "POST",
              headers: await authHeaders(),
              body: JSON.stringify({ lead_id: leadId, phone_dialed: toE164(phone) }),
            });
            if (sessionRes.ok) {
              const sessionData = await sessionRes.json();
              newSessionId = sessionData.session?.id ?? null;
            }
          } catch {
            console.warn("[Dialer] Session creation failed — call will proceed without session tracking");
          }
        }

        meta.sessionId = newSessionId ?? undefined;

        const res = await fetch("/api/dialer/call", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            phone,
            leadId,
            userId: currentUser.id,
            ghostMode,
            mode: "voip",
            sessionId: newSessionId,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error ?? "Call failed");
          setCallState("idle");
          setCallMeta(null);
          timerReset();
          return;
        }

        meta.callLogId = data.callLogId;
        setCallMeta(meta);

        const call = await deviceRef.current.connect({
          params: {
            To: toE164(phone),
            callLogId: data.callLogId ?? "",
            agentId: currentUser.id,
            callerId: voipCallerId,
            sessionId: newSessionId ?? "",
          },
        });

        setActiveCall(call);
        setCallState("connected");

        call.on("ringing", () => {
          if (newSessionId) {
            authHeaders().then((hdrs) =>
              fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
                method: "PATCH",
                headers: hdrs,
                body: JSON.stringify({ status: "ringing" }),
              }),
            ).catch(() => {});
          }
        });

        call.on("accept", () => {
          toast.success("Call connected via VoIP");
          if (newSessionId) {
            authHeaders().then((hdrs) =>
              fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
                method: "PATCH",
                headers: hdrs,
                body: JSON.stringify({ status: "connected" }),
              }),
            ).catch(() => {});
          }
        });

        call.on("disconnect", () => {
          setActiveCall(null);
          setCallState("ended");
          timerStop();
          if (newSessionId) {
            authHeaders().then(async (hdrs) => {
              const r = await fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
                method: "PATCH",
                headers: hdrs,
                body: JSON.stringify({ status: "ended" }),
              });
              if (!r.ok) {
                await fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
                  method: "PATCH",
                  headers: hdrs,
                  body: JSON.stringify({ status: "failed" }),
                });
              }
            }).catch(() => {});
          }
          setTimeout(() => {
            setCallState("idle");
            setCallMeta(null);
            timerReset();
          }, 3000);
        });

        call.on("error", (err: { message?: string }) => {
          toast.error(`Call error: ${err.message ?? "unknown"}`);
          setActiveCall(null);
          setCallState("idle");
          setCallMeta(null);
          timerReset();
          if (newSessionId) {
            authHeaders().then((hdrs) =>
              fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
                method: "PATCH",
                headers: hdrs,
                body: JSON.stringify({ status: "failed" }),
              }),
            ).catch(() => {});
          }
        });

        call.on("cancel", () => {
          setActiveCall(null);
          setCallState("idle");
          setCallMeta(null);
          timerReset();
        });
      } catch (err) {
        console.error("[VoIP] startCall failed:", err);
        toast.error("Failed to start call");
        setCallState("idle");
        setCallMeta(null);
        timerReset();
      }
    },
    [currentUser.id, deviceStatus, ghostMode, voipCallerId, timerStart, timerStop, timerReset],
  );

  const endCall = useCallback(() => {
    if (activeCall) {
      activeCall.disconnect();
    }
  }, [activeCall]);

  const answerIncoming = useCallback(() => {
    if (!incomingCall) return;
    incomingCall.accept();
    setActiveCall(incomingCall);
    setCallState("connected");
    setCallMeta({ phone: incomingFrom ?? "Unknown" });
    setIncomingCall(null);
    setIncomingFrom(null);
    setIsMuted(false);
    timerStart();

    incomingCall.on("disconnect", () => {
      setActiveCall(null);
      setCallState("ended");
      timerStop();
      setTimeout(() => {
        setCallState("idle");
        setCallMeta(null);
        timerReset();
      }, 3000);
    });

    incomingCall.on("error", (err: { message?: string }) => {
      console.error("[VoIP] Incoming call error:", err);
      toast.error(`Call error: ${err.message ?? "unknown"}`);
      setActiveCall(null);
      setCallState("idle");
      setCallMeta(null);
      timerReset();
    });
  }, [incomingCall, incomingFrom, timerStart, timerStop, timerReset]);

  const rejectIncoming = useCallback(() => {
    if (!incomingCall) return;
    incomingCall.reject();
    setIncomingCall(null);
    setIncomingFrom(null);
    setCallState("idle");
  }, [incomingCall]);

  const toggleMute = useCallback(() => {
    if (activeCall) {
      const newMuted = !activeCall.isMuted();
      activeCall.mute(newMuted);
      setIsMuted(newMuted);
    }
  }, [activeCall]);

  return (
    <TwilioContext.Provider
      value={{
        deviceStatus,
        activeCall,
        callState,
        callMeta,
        incomingCall,
        incomingFrom,
        isMuted,
        elapsed,
        formatted,
        voipCallerId,
        deviceRef,
        startCall,
        endCall,
        answerIncoming,
        rejectIncoming,
        toggleMute,
        initDevice,
        setSuppressIncoming,
      }}
    >
      {children}
    </TwilioContext.Provider>
  );
}
