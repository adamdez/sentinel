"use client";

import { useEffect, useState, useCallback } from "react";
import { useModal } from "@/providers/modal-provider";
import { supabase } from "@/lib/supabase";
import { clientFileFromRaw, type ClientFile } from "@/components/sentinel/master-client-file-helpers";
import { MasterClientFileModal } from "@/components/sentinel/master-client-file-modal";

export function GlobalLeadModal() {
  const { activeModal, modalData, closeModal } = useModal();
  const [clientFile, setClientFile] = useState<ClientFile | null>(null);
  const [loading, setLoading] = useState(false);

  const leadId = activeModal === "client-file" ? (modalData.leadId as string) : null;

  useEffect(() => {
    if (!leadId) {
      setClientFile(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: lead } = await (supabase.from("leads") as any)
        .select("*")
        .eq("id", leadId)
        .single();
      if (cancelled || !lead) { setLoading(false); return; }

      const { data: prop } = await (supabase.from("properties") as any)
        .select("*")
        .eq("id", lead.property_id)
        .single();
      if (cancelled) return;

      setClientFile(clientFileFromRaw(lead, prop ?? {}));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [leadId]);

  const handleClose = useCallback(() => {
    closeModal();
    setClientFile(null);
  }, [closeModal]);

  if (!leadId) return null;

  return (
    <MasterClientFileModal
      clientFile={loading ? null : clientFile}
      open={!!leadId}
      onClose={handleClose}
    />
  );
}
