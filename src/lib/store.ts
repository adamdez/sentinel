import { create } from "zustand";
import type { User, ChatMessage, FeatureFlags } from "./types";

const SIDEBAR_WIDTH_KEY = "sentinel_sidebar_width";
const DEFAULT_SIDEBAR_WIDTH = 200;

function loadSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
  try {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (n >= 140 && n <= 320) return n;
    }
  } catch { /* SSR or quota */ }
  return DEFAULT_SIDEBAR_WIDTH;
}

interface SentinelState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;

  ghostMode: boolean;
  setGhostMode: (on: boolean) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;

  currentUser: User;
  setCurrentUser: (user: User) => void;

  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;

  featureFlags: FeatureFlags;
  setFeatureFlags: (flags: FeatureFlags) => void;
}

export const useSentinelStore = create<SentinelState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  sidebarWidth: loadSidebarWidth(),
  setSidebarWidth: (w) => {
    const clamped = Math.max(140, Math.min(320, w));
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped)); } catch { /* quota */ }
    set({ sidebarWidth: clamped });
  },

  ghostMode: false,
  setGhostMode: (on) => set({ ghostMode: on }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  chatOpen: false,
  setChatOpen: (open) => set({ chatOpen: open }),

  currentUser: {
    id: "",
    name: "",
    email: "",
    role: "agent",
    avatar_url: undefined,
    is_active: false,
  },
  setCurrentUser: (user) => set({ currentUser: user }),

  chatMessages: [],
  addChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

  featureFlags: {
    aiScoring: true,
    dialer: true,
    ghostMode: true,
    teamChat: true,
    campaigns: true,
  },
  setFeatureFlags: (flags) => set({ featureFlags: flags }),
}));
