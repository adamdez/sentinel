export type IdleRailAttentionSnapshot = {
  hasUnreadSms: boolean;
  hasMissedQueueItems: boolean;
  hasUnseenLocalMissedCalls: boolean;
};

export type IdleRailAttentionAction =
  | {
      type: "backend_synced";
      hasUnreadSms: boolean;
      hasMissedQueueItems: boolean;
    }
  | {
      type: "local_missed";
    }
  | {
      type: "local_missed_seen";
    };

export const DEFAULT_IDLE_RAIL_ATTENTION: IdleRailAttentionSnapshot = {
  hasUnreadSms: false,
  hasMissedQueueItems: false,
  hasUnseenLocalMissedCalls: false,
};

export function idleRailAttentionReducer(
  state: IdleRailAttentionSnapshot,
  action: IdleRailAttentionAction,
): IdleRailAttentionSnapshot {
  switch (action.type) {
    case "backend_synced":
      if (
        state.hasUnreadSms === action.hasUnreadSms
        && state.hasMissedQueueItems === action.hasMissedQueueItems
      ) {
        return state;
      }
      return {
        ...state,
        hasUnreadSms: action.hasUnreadSms,
        hasMissedQueueItems: action.hasMissedQueueItems,
      };
    case "local_missed":
      return state.hasUnseenLocalMissedCalls
        ? state
        : {
            ...state,
            hasUnseenLocalMissedCalls: true,
          };
    case "local_missed_seen":
      return state.hasUnseenLocalMissedCalls
        ? {
            ...state,
            hasUnseenLocalMissedCalls: false,
          }
        : state;
    default:
      return state;
  }
}

export function hasIdleRailMissedAttention(state: IdleRailAttentionSnapshot): boolean {
  return state.hasMissedQueueItems || state.hasUnseenLocalMissedCalls;
}
