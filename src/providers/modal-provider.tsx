"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ModalType = "new-prospect" | "edit-lead" | "confirm-action" | "ai-breakdown" | null;

interface ModalContextValue {
  activeModal: ModalType;
  modalData: Record<string, unknown>;
  openModal: (type: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextValue>({
  activeModal: null,
  modalData: {},
  openModal: () => {},
  closeModal: () => {},
});

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalData, setModalData] = useState<Record<string, unknown>>({});

  const openModal = useCallback(
    (type: ModalType, data: Record<string, unknown> = {}) => {
      setActiveModal(type);
      setModalData(data);
    },
    []
  );

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setModalData({});
  }, []);

  return (
    <ModalContext.Provider value={{ activeModal, modalData, openModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  return useContext(ModalContext);
}
