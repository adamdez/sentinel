"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { MessageSquare, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const POLL_INTERVAL = 12_000;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = {};
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

/**
 * Mounts invisibly — polls /api/notifications/check and fires
 * sonner toasts + browser notifications for new SMS and webform leads.
 */
export function GlobalNotificationWatcher() {
  const sinceRef = useRef(new Date().toISOString());
  const seenIdsRef = useRef(new Set<string>());
  const router = useRouter();

  const requestBrowserPermission = useCallback(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const showBrowserNotification = useCallback((title: string, body: string) => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(title, { body, icon: "/favicon.ico" });
      } catch { /* mobile / restricted */ }
    }
  }, []);

  const playSound = useCallback(() => {
    try {
      const audio = new Audio("/sounds/notification.mp3");
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch { /* no sound file */ }
  }, []);

  const poll = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers["Authorization"]) return;

      const res = await fetch(
        `/api/notifications/check?since=${encodeURIComponent(sinceRef.current)}`,
        { headers },
      );
      if (!res.ok) return;

      const data = await res.json();
      let hasNew = false;

      // SMS notifications
      for (const sms of data.sms ?? []) {
        if (seenIdsRef.current.has(sms.id)) continue;
        seenIdsRef.current.add(sms.id);
        hasNew = true;

        const label = sms.name ?? sms.phoneFormatted;
        toast(
          `New text from ${label}`,
          {
            description: sms.preview || "(empty message)",
            icon: <MessageSquare className="h-4 w-4 text-blue-400" />,
            duration: 10_000,
            action: {
              label: "Open Dialer",
              onClick: () => router.push("/dialer"),
            },
          },
        );
        showBrowserNotification(`New text from ${label}`, sms.preview || "(empty)");
      }

      // New lead notifications
      for (const lead of data.leads ?? []) {
        if (seenIdsRef.current.has(lead.id)) continue;
        seenIdsRef.current.add(lead.id);
        hasNew = true;

        const label = lead.name ?? lead.address ?? "Unknown";
        toast(
          `New website lead: ${label}`,
          {
            description: lead.address ?? "Web form submission",
            icon: <UserPlus className="h-4 w-4 text-emerald-400" />,
            duration: 15_000,
            action: {
              label: "View Lead Queue",
              onClick: () => router.push("/leads"),
            },
          },
        );
        showBrowserNotification("New Website Lead", `${label}${lead.address ? ` — ${lead.address}` : ""}`);
      }

      if (hasNew) playSound();

      sinceRef.current = new Date().toISOString();
    } catch { /* network error, skip cycle */ }
  }, [router, showBrowserNotification, playSound]);

  useEffect(() => {
    requestBrowserPermission();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [poll, requestBrowserPermission]);

  return null;
}
