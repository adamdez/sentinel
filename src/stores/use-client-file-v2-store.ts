import { create } from "zustand";

interface ClientFileV2State {
  activeLeadId: string | null;
  activeTab: "overview" | "contact" | "comps" | "calculator" | "documents";
  isOverlayOpen: boolean;
  
  // Actions
  openLead: (id: string, initialTab?: "overview" | "contact" | "comps" | "calculator" | "documents") => void;
  closeOverlay: () => void;
  setTab: (tab: "overview" | "contact" | "comps" | "calculator" | "documents") => void;
}

export const useClientFileV2Store = create<ClientFileV2State>((set) => ({
  activeLeadId: null,
  activeTab: "overview",
  isOverlayOpen: false,

  openLead: (id, initialTab = "overview") =>
    set({ activeLeadId: id, isOverlayOpen: true, activeTab: initialTab }),
    
  closeOverlay: () => set({ isOverlayOpen: false, activeLeadId: null }),
  
  setTab: (tab) => set({ activeTab: tab }),
}));
