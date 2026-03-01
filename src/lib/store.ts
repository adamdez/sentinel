import { create } from "zustand";
import type { User, ChatMessage, FeatureFlags } from "./types";

interface SentinelState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

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
