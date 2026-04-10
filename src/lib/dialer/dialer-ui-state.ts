export type DialerQueueLeadLike = {
  id: string;
};

type BuildDialerQueueCollectionsArgs<TLead extends DialerQueueLeadLike> = {
  autoCycleMode: boolean;
  queue: TLead[];
  queueLoading: boolean;
  autoCycleQueue: TLead[];
  autoCycleQueueLoading: boolean;
  isReadyLead: (lead: TLead) => boolean;
};

type SelectFallbackDialerLeadArgs<TLead extends DialerQueueLeadLike> = {
  autoCycleMode: boolean;
  displayedQueue: TLead[];
  executionQueue: TLead[];
  preferredQueue: TLead[];
  fileModalOpen: boolean;
};

export type DialerQueueCollections<TLead extends DialerQueueLeadLike> = {
  displayedQueue: TLead[];
  executionQueue: TLead[];
  preferredQueue: TLead[];
  displayedQueueLoading: boolean;
  powerDialReadyQueueExhausted: boolean;
};

export function buildDialerQueueCollections<TLead extends DialerQueueLeadLike>({
  autoCycleMode,
  queue,
  queueLoading,
  autoCycleQueue,
  autoCycleQueueLoading,
  isReadyLead,
}: BuildDialerQueueCollectionsArgs<TLead>): DialerQueueCollections<TLead> {
  const displayedQueue = autoCycleMode ? autoCycleQueue : queue;
  const executionQueue = autoCycleMode ? autoCycleQueue.filter(isReadyLead) : queue;
  const preferredQueue = executionQueue.length > 0 ? executionQueue : displayedQueue;

  return {
    displayedQueue,
    executionQueue,
    preferredQueue,
    displayedQueueLoading: autoCycleMode ? autoCycleQueueLoading : queueLoading,
    powerDialReadyQueueExhausted: autoCycleMode && executionQueue.length === 0,
  };
}

export function selectInitialDialerLead<TLead extends DialerQueueLeadLike>(
  autoCycleMode: boolean,
  executionQueue: TLead[],
  preferredQueue: TLead[],
): TLead | null {
  return autoCycleMode ? (executionQueue[0] ?? null) : (preferredQueue[0] ?? null);
}

export function selectFallbackDialerLead<TLead extends DialerQueueLeadLike>({
  autoCycleMode,
  displayedQueue,
  executionQueue,
  preferredQueue,
  fileModalOpen,
}: SelectFallbackDialerLeadArgs<TLead>): TLead | null {
  if (fileModalOpen) return null;
  if (autoCycleMode) return executionQueue[0] ?? null;
  return preferredQueue[0] ?? displayedQueue[0] ?? null;
}

export function findRefreshedDialerLead<TLead extends DialerQueueLeadLike>(
  displayedQueue: TLead[],
  currentLeadId: string | null | undefined,
): TLead | null {
  if (!currentLeadId) return null;
  return displayedQueue.find((lead) => lead.id === currentLeadId) ?? null;
}
