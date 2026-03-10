"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";

export interface OptimisticUpdateParams {
  id: string;
  payload: Record<string, unknown>;
  lockVersion: number;
}

interface PatchResponse {
  success: boolean;
  lead_id: string;
  status?: string;
  error?: string;
  detail?: string;
}

async function patchProspect({
  id,
  payload,
  lockVersion,
}: OptimisticUpdateParams): Promise<PatchResponse> {
  const headers = await getAuthenticatedProspectPatchHeaders(lockVersion);
  const res = await fetch("/api/prospects", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ lead_id: id, ...payload }),
  });

  const data: PatchResponse = await res.json();

  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? `PATCH failed (${res.status})`);
  }

  return data;
}

export function useOptimisticUpdate() {
  const queryClient = useQueryClient();

  return useMutation<PatchResponse, Error, OptimisticUpdateParams>({
    mutationFn: patchProspect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
    },
  });
}
