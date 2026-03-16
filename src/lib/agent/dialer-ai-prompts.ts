/**
 * Dialer AI Prompt Helpers (provider-neutral facade)
 *
 * This module provides provider-neutral exports for dialer prompt builders.
 * Internally it currently reuses existing prompt builders from grok-agents.ts
 * to avoid broad refactors during migration.
 */

export {
  buildCallCoPilotPrompt,
  styleVersionTag,
  type LeadContext,
} from "./grok-agents";

