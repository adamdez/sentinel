/**
 * Voice AI Types
 *
 * Shared types for the Vapi voice front office integration.
 * These types are used by the adapter, webhook handler, and function endpoints.
 */

// ── Voice Session (DB row shape) ────────────────────────────────────────────

export interface VoiceSession {
  id: string;
  call_sid: string | null;
  vapi_call_id: string | null;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  lead_id: string | null;
  caller_type: CallerType | null;
  caller_intent: string | null;
  status: VoiceSessionStatus;
  transferred_to: string | null;
  transfer_reason: string | null;
  summary: string | null;
  extracted_facts: ExtractedFact[];
  callback_requested: boolean;
  callback_time: string | null;
  assistant_id: string | null;
  model_used: string | null;
  duration_seconds: number | null;
  cost_cents: number | null;
  recording_url: string | null;
  transcript: string | null;
  feature_flag: string;
  run_id: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

export type CallerType = "seller" | "buyer" | "vendor" | "spam" | "unknown";
export type VoiceSessionStatus = "ringing" | "ai_handling" | "transferred" | "completed" | "failed" | "voicemail";

export interface ExtractedFact {
  field: string;
  value: string;
  confidence: "low" | "medium" | "high";
}

// ── Vapi Webhook Events ─────────────────────────────────────────────────────

export type VapiWebhookEvent =
  | "assistant-request"
  | "function-call"
  | "status-update"
  | "end-of-call-report"
  | "transfer-destination-request"
  | "hang"
  | "speech-update"
  | "transcript";

export interface VapiWebhookPayload {
  message: {
    type: VapiWebhookEvent;
    call?: VapiCallObject;
    // function-call specific
    functionCall?: {
      name: string;
      parameters: Record<string, unknown>;
    };
    // status-update specific
    status?: string;
    // end-of-call-report specific
    endedReason?: string;
    transcript?: string;
    summary?: string;
    recordingUrl?: string;
    cost?: number;
    durationSeconds?: number;
    // assistant-request specific
    phoneNumber?: { number: string };
    // transfer-destination-request specific
    destination?: {
      type: string;
      number?: string;
      message?: string;
    };
  };
}

export interface VapiCallObject {
  id: string;
  orgId?: string;
  type?: "inboundPhoneCall" | "outboundPhoneCall" | "webCall";
  status?: string;
  phoneCallProvider?: string;
  phoneCallProviderId?: string; // Twilio call SID
  customer?: {
    number?: string;
    name?: string;
  };
  phoneNumber?: {
    number?: string;
    twilioPhoneNumber?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

// ── Vapi Function Call Types ────────────────────────────────────────────────

export interface VapiFunctionResult {
  result: string; // JSON string that Vapi reads back to the caller
}

export interface LeadLookupParams {
  phone_number: string;
}

export interface BookCallbackParams {
  caller_name?: string;
  phone_number: string;
  preferred_time?: string;
  reason?: string;
}

export interface TransferCallParams {
  reason: string;
  caller_type: CallerType;
  transfer_to?: "logan" | "adam";
}

// ── Vapi Assistant Configuration ────────────────────────────────────────────

export interface VapiAssistantConfig {
  name: string;
  model: {
    provider: string;
    model: string;
    temperature: number;
    systemMessage: string;
    functions: VapiFunctionDef[];
  };
  voice: {
    provider: string;
    voiceId: string;
    model?: string;
    stability?: number;
    similarityBoost?: number;
  };
  firstMessage: string;
  endCallMessage: string;
  transcriber: {
    provider: string;
    model: string;
    language: string;
  };
  serverUrl: string;
  endCallFunctionEnabled: boolean;
  maxDurationSeconds: number;
  silenceTimeoutSeconds: number;
  responseDelaySeconds: number;
  /** Vapi transfer plan — tells Vapi how to handle call transfers */
  transferPlan?: {
    mode: "server" | "blind-transfer" | "blind-transfer-add-summary-to-sip-header";
    message?: string;
    summaryPlan?: {
      enabled: boolean;
      messages?: Array<{ role: string; content: string }>;
    };
  };
}

export interface VapiFunctionDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}
