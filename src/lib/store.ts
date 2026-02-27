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

  chatMessages: [
    {
      id: "msg-1",
      user_id: "user-sarah",
      user_name: "Sarah K.",
      content: "Just closed the Henderson deal — $42k assignment fee 🔥",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "msg-2",
      user_id: "user-adam",
      user_name: "Adam D.",
      content: "Nice! That probate lead scored 94. AI nailed it.",
      timestamp: new Date(Date.now() - 3000000).toISOString(),
    },
    {
      id: "msg-3",
      user_id: "user-mike",
      user_name: "Mike R.",
      content: "Got 3 new prospects from the tax lien batch — all high equity.",
      timestamp: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
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
