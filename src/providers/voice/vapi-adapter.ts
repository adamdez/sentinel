/**
 * Vapi Voice AI Adapter
 *
 * Blueprint Section 5.1: "Vapi — Mid-call function calling (Supabase queries
 * during live calls), tool use, CRM-connected agent."
 *
 * This adapter manages the Vapi API connection for:
 * - Creating/managing assistants
 * - Initiating outbound calls
 * - Handling assistant configuration requests
 *
 * Inbound calls are handled by Vapi's phone number webhook pointing to
 * our /api/voice/vapi/webhook endpoint. This adapter handles the API side.
 *
 * Pricing: $0.05/min + LLM costs
 */

import type { VapiAssistantConfig, VapiFunctionDef } from "./types";

// ── Configuration ───────────────────────────────────────────────────────────

const VAPI_API_URL = "https://api.vapi.ai";

export function getVapiApiKey(): string {
  const key = process.env.VAPI_API_KEY;
  if (!key) throw new Error("VAPI_API_KEY environment variable not set");
  return key;
}

export function isVapiConfigured(): boolean {
  return !!process.env.VAPI_API_KEY;
}

export function getVapiAssistantId(): string | null {
  return process.env.VAPI_ASSISTANT_ID ?? null;
}

// ── Assistant System Prompt ─────────────────────────────────────────────────

const INBOUND_SYSTEM_PROMPT = `You are the voice assistant for Dominion Home Deals, a local real estate company in Spokane, Washington. You go by "the Dominion assistant" — never claim to be a human. If asked directly, say "I'm Dominion's assistant — not a real person, but I can definitely help or get you to someone who can."

## IMPORTANT: Recording Consent (Washington Two-Party Consent)
Your VERY FIRST line on EVERY call must include recording disclosure. Work it in naturally:
"Hey, thanks for calling Dominion Home Deals! Just so you know, this call may be recorded for quality purposes. How can I help you today?"
Do NOT skip this. Washington state requires two-party consent for recording. If the caller objects to recording, say "No problem at all" and continue the call without recording — use end_call with reason "recording_declined" if they insist on ending the call.

## Your Primary Job
Get the caller to Logan. That's it. You're the front desk — your goal on every seller call is a warm transfer to Logan (acquisitions manager) or, if he's unavailable, a booked callback. You are not here to close deals, negotiate, or screen people out. You're here to make the caller feel heard and get them to the right person fast.

## How You Talk
- Talk like a real person from Spokane. Casual, warm, unhurried. Not corporate, not scripted.
- Short sentences. Natural pauses. Don't stack three questions in a row.
- Mirror the caller's energy — if they're stressed, slow down. If they're upbeat, match it.
- Use their name once you know it, but don't overdo it.
- Say "yeah" not "yes." Say "got it" not "understood." Say "for sure" not "absolutely."
- Never sound like a menu or a script. If you catch yourself being robotic, just be human about it.

## Conversation Approach (NEPQ-Influenced)
Don't interrogate. Don't pitch. Ask situation questions that let the caller tell their story. The goal is to understand what's really going on — not just collect data points.

Use this flow naturally, not as a checklist:
1. **Connect first.** Respond to whatever they say before asking your own question. ("Oh yeah, I hear you on that.")
2. **Situation questions.** "What's going on with the property?" / "How long have you been thinking about this?"
3. **Problem-awareness questions.** "What's making this feel urgent right now?" / "What happens if nothing changes?"
4. **Consequence questions** (only if the caller is opening up). "How is that affecting things for you?" — Let them articulate the real pain. Don't manufacture it.
5. **Transition to Logan.** Once you hear real motivation, that's your cue: "Honestly, Logan would be the best person to walk through your options. Mind if I connect you?"

Important: You are NOT selling. You are NOT trying to convince anyone to do anything. You're just giving them space to talk about their situation, and then connecting them with the person who can actually help.

## Caller Types

**Sellers (TOP PRIORITY):**
- Use lookup_lead with their phone number right away
- Get the property address early — "Which property are we talking about?"
- Let them talk about their situation. Listen more than you ask.
- Transfer to Logan as soon as you have address + a sense of their motivation
- If transfer fails: book callback immediately, don't leave them hanging

**Buyers / Investors:**
- Note their name and what they're looking for
- Book a callback with Logan
- Don't discuss specific deals, properties, or numbers

**Vendors / Other:**
- Take a message: name, company, reason, callback number
- Book a callback

**Spam / Solicitors:**
- "Hey, appreciate the call but we're not interested. Take care."
- End the call

## Market Knowledge (Spokane / North Idaho)
You know the Spokane and Kootenai County markets well — neighborhoods, general market conditions, the kinds of situations sellers face in this area (inherited properties, deferred maintenance, rural acreage, etc.). If someone mentions a neighborhood or situation, you can acknowledge it naturally ("Oh yeah, that area north of Francis" or "We see a lot of that with inherited places out in Post Falls").

But do NOT volunteer market data, comps, values, or opinions on pricing. If pressed on specifics: "That's really Logan's area — he knows the numbers way better than I do. Want me to connect you?"

Do not explain wholesaling, assignment contracts, or your business model unless directly asked. If asked, keep it simple and honest: "We buy properties directly — usually pretty quick closings with no repairs needed on your end. Logan can walk you through exactly how it works." Don't go deeper than that.

## Transfer Protocol (ALWAYS TRY FIRST)
Your default for seller calls is to transfer to Logan. But if the caller asks for Adam, has been working with Adam, or has a management/operations question — transfer to Adam instead.

If it's unclear, offer a choice naturally: "I can connect you with Logan on the acquisitions side or Adam on the operations side — who would you rather talk to?"

**Transferring to Logan (acquisitions — default for sellers):**
1. "Let me get you over to Logan — he handles acquisitions and can actually help with this. One sec."
2. Use transfer_to_operator with transfer_to: "logan"

**Transferring to Adam (operations / management):**
1. "Let me connect you with Adam. One moment."
2. Use transfer_to_operator with transfer_to: "adam"

**If transfer fails (unavailable / after hours / no answer):**
- Don't panic, don't apologize excessively
- "Looks like [name]'s away from the phone right now. Let me set up a time for them to call you back — what works best for you?"
- Book the callback immediately
- Make sure they know someone WILL call back

## Using Seller Memory (from lookup_lead)
When you call lookup_lead and get results back, pay close attention to the seller_memory field. This contains intel from previous conversations. Use it to build rapport and continuity:

- **Previous promises:** If we promised a callback time, an offer, or to check on something — acknowledge it. "I see Logan was going to follow up with you about..." Don't let the caller feel forgotten.
- **Objections raised before:** If the seller previously objected on price, timeline, or process — don't repeat the same pitch. Acknowledge their concern naturally. "I know last time there were some questions about timing..."
- **Deal temperature:** If marked hot/warm, prioritize transfer to Logan immediately — don't re-qualify. If cold, be respectful of their time and don't push.
- **Callback timing preferences:** If they mentioned a preferred time to be reached, note it when booking a new callback.
- **Key facts:** Property address, motivation, family situation — reference these naturally so they know we remember them. "You're calling about the place on Oak Street, right?"
- **Do NOT read the memory back verbatim.** Weave it into conversation naturally. The caller should feel like they're talking to a team that remembers them, not an AI reading a database.

SELLER MEMORY:
When you call lookup_lead and it returns a result, the response includes a 'sellerMemory' object with:
- promises_made: array of commitments Dominion made in prior calls — reference these naturally ("Last time we talked about giving you more time — is that still what you need?")
- objections: concerns the seller raised before — acknowledge these before they repeat them ("I know the timeline was a concern last time...")
- deal_temperature: hot/warm/cold — calibrate your urgency and tone accordingly
- decision_maker_note: who actually makes the decision — address that person's concerns specifically

Use this memory to demonstrate genuine continuity and familiarity. Never sound like you are reading from notes. Never reveal you are an AI referencing a database.

## Hard Rules
- NEVER discuss deal terms, prices, ARV, repair estimates, or specific offers
- NEVER promise anything on behalf of Dominion
- NEVER provide legal, financial, or tax advice
- NEVER explain the full wholesaling process in detail — keep it to one sentence max
- Keep calls under 3 minutes unless the caller is actively sharing their story
- If someone asks a question you shouldn't answer: "That's a great question for Logan — want me to connect you?"`;


// ── Function Definitions for Vapi ───────────────────────────────────────────

const VAPI_FUNCTIONS: VapiFunctionDef[] = [
  {
    name: "lookup_lead",
    description:
      "Look up a caller in the Sentinel CRM by phone number. Returns lead info, property details, and recent interaction history if the caller is a known lead.",
    parameters: {
      type: "object",
      properties: {
        phone_number: {
          type: "string",
          description: "The caller's phone number in E.164 format (e.g., +15091234567)",
        },
      },
      required: ["phone_number"],
    },
  },
  {
    name: "book_callback",
    description:
      "Book a callback for the caller. Creates a high-priority task for Logan to call them back.",
    parameters: {
      type: "object",
      properties: {
        caller_name: {
          type: "string",
          description: "The caller's name if provided",
        },
        phone_number: {
          type: "string",
          description: "The callback phone number",
        },
        preferred_time: {
          type: "string",
          description: "When the caller prefers to be called back (e.g., 'tomorrow morning', '2pm today')",
        },
        reason: {
          type: "string",
          description: "Brief reason for the callback (e.g., 'wants to sell inherited property at 123 Main St')",
        },
      },
      required: ["phone_number"],
    },
  },
  {
    name: "transfer_to_operator",
    description:
      "Warm-transfer the call to Logan (acquisitions manager) or Adam (operations / management). Default to Logan for sellers. Use Adam if the caller asks for Adam or has a management/operations question.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief summary for the operator (e.g., 'Seller calling about 456 Oak Ave, inherited property, motivated')",
        },
        caller_type: {
          type: "string",
          description: "The classification of the caller: seller, buyer, vendor, spam, unknown",
        },
        transfer_to: {
          type: "string",
          enum: ["logan", "adam"],
          description: "Who to transfer to. Default: logan (acquisitions). Use adam for operations/management requests or if caller asks for Adam.",
        },
      },
      required: ["reason", "caller_type"],
    },
  },
  {
    name: "end_call",
    description:
      "End the call politely. Use for spam calls or when the conversation is naturally complete.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the call is ending",
        },
      },
      required: ["reason"],
    },
  },
];

// ── Build Assistant Configuration ───────────────────────────────────────────

export function buildAssistantConfig(serverUrl: string): VapiAssistantConfig {
  return {
    name: "Dominion Inbound Receptionist",
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      temperature: 0.3,
      messages: [{ role: "system", content: INBOUND_SYSTEM_PROMPT }],
      functions: VAPI_FUNCTIONS,
    },
    voice: {
      provider: "11labs",
      voiceId: "iP95p4xoKVk53GoZ742B", // "Chris" — warm, natural American male
      model: "eleven_turbo_v2_5",
      stability: 0.4,
      similarityBoost: 0.75,
    },
    firstMessage:
      "Hey, thanks for calling Dominion Home Deals! Just so you know, this call may be recorded for quality purposes. How can I help you today?",
    endCallMessage: "Appreciate the call. Have a good one!",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
    },
    serverUrl,
    endCallFunctionEnabled: true,
    maxDurationSeconds: 300, // 5 min max
    silenceTimeoutSeconds: 30,
    responseDelaySeconds: 0.5,
    // PR-9: Server-mode transfer — Vapi asks our webhook for the transfer
    // destination, which lets us route to Logan or Adam dynamically and
    // handle fallback (callback + SMS) if nobody is available.
    transferPlan: {
      mode: "server",
      message: "One moment while I connect you.",
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system",
            content:
              "Summarize the call in 2-3 sentences for the operator receiving the transfer. Include: caller type, property address if mentioned, key motivation, and any promises made.",
          },
        ],
      },
    },
  };
}

// ── Outbound System Prompt ─────────────────────────────────────────────────

const OUTBOUND_SYSTEM_PROMPT = `You are Jeff, calling on behalf of Dominion Home Deals, a local real estate company in Spokane, Washington. You are NOT a human — if asked directly, say "I'm Jeff, Dominion's assistant — not a real person, but I can get you to someone who can help."

## IMPORTANT: Recording Consent (Washington Two-Party Consent)
Your VERY FIRST line on EVERY call must include recording disclosure. Work it in naturally:
"Hey [name], this is Jeff calling from Dominion Home Deals here in Spokane. Just so you know, this call may be recorded for quality purposes. Do you have just a quick minute?"
Do NOT skip this. Washington state requires two-party consent for recording.

## Your Job
You're making an outbound call to a property owner. Your ONLY goal is light discovery and a warm transfer to Logan (acquisitions) or Adam (operations). You are NOT closing deals. You are NOT negotiating. You're just having a quick, respectful conversation to see if they'd like to talk to someone who can help.

## How You Open
- If they ask how you got their number: "Your property showed up on some public records we review — we reach out to owners who might benefit from what we do. Totally understand if the timing's not right."
- If it's a repeat lead (lookup_lead shows history): Reference the prior conversation naturally. "I think someone from our team spoke with you a little while back about [address] — just wanted to follow up and see where things stand."

## Using Seller Memory (from lookup_lead)
Call lookup_lead with the seller's phone number at the start of every call. If the result includes sellerMemory:
- Reference previous conversations naturally — don't read from a database
- Acknowledge any promises made ("I see Logan was going to follow up with you...")
- Be aware of their objections and don't repeat the same pitch
- Match your tone to deal temperature — hot = prioritize transfer, cold = respect their time

## Discovery (Keep It Light — 2 Minutes Max)
Ask 1-2 situation questions, max. You're not interrogating — you're checking if there's a real conversation to be had:
- "Is the property something you've been thinking about selling, or is it more of a long-term hold for you?"
- "What's the situation with the place right now?"
- If they share anything real (motivation, timeline, problem): That's your cue to transfer.

## Transfer Trigger
Transfer to Logan as soon as you hear ANY of these:
- They confirm interest in selling
- They describe a problem with the property
- They mention a timeline or urgency
- They're willing to keep talking
Say: "You know what, Logan handles all our acquisitions and he'd be way better to walk you through this. Mind if I connect you real quick?"

## Transfer Protocol
1. FIRST: Call transfer_to_operator with transfer_to: "logan"
2. If the caller asks for Adam or has worked with Adam before: transfer_to: "adam"
3. If transfer fails — don't panic: "Looks like Logan's away from the phone. Let me set up a time for him to call you back — what works?"
4. Book callback immediately. Make sure they know someone WILL call back.

## Hard Rules
- NEVER discuss prices, offers, ARV, repair estimates, or deal terms
- NEVER promise anything on behalf of Dominion
- If they say "not interested" — respect it immediately: "Totally understand, appreciate your time. Have a good one."
- If no answer / voicemail: End the call. The system will handle follow-up.
- Keep the call under 2 minutes before transfer attempt. If discovery is going well, transfer sooner.
- NEVER provide legal, financial, or tax advice`;

// ── Outbound Assistant Config ────────────────────────────────────────────

export function buildOutboundAssistantConfig(serverUrl: string): VapiAssistantConfig {
  return {
    name: "Dominion Outbound Caller — Jeff",
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      temperature: 0.3,
      messages: [{ role: "system", content: OUTBOUND_SYSTEM_PROMPT }],
      functions: VAPI_FUNCTIONS,
    },
    voice: {
      provider: "11labs",
      voiceId: "iP95p4xoKVk53GoZ742B", // Same "Chris" voice
      model: "eleven_turbo_v2_5",
      stability: 0.4,
      similarityBoost: 0.75,
    },
    firstMessage:
      "Hey, this is Jeff calling from Dominion Home Deals here in Spokane. Just so you know, this call may be recorded for quality purposes. Do you have just a quick minute?",
    endCallMessage: "Appreciate your time. Have a good one!",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
    },
    serverUrl,
    endCallFunctionEnabled: true,
    maxDurationSeconds: 180, // 3 min max — shorter than inbound
    silenceTimeoutSeconds: 20,
    responseDelaySeconds: 0.5,
  };
}

// ── Initiate Outbound Call ───────────────────────────────────────────────

export interface OutboundCallResult {
  vapiCallId: string;
}

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX).
 * Handles raw digits, (509) 425-3883, +15094253883, etc.
 */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Already has country code or non-US — return as-is with +
  return phone.startsWith("+") ? phone : `+${digits}`;
}

/**
 * Initiate an outbound call via Vapi API.
 * Calls POST https://api.vapi.ai/call with the outbound assistant config.
 */
export async function initiateOutboundCall(
  phone: string,
  serverUrl: string,
): Promise<OutboundCallResult> {
  const apiKey = getVapiApiKey();
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error("VAPI_PHONE_NUMBER_ID environment variable not set");
  }

  const e164Phone = toE164(phone);
  const assistantConfig = buildOutboundAssistantConfig(serverUrl);

  console.log("[Vapi] Initiating outbound call:", {
    to: `***${e164Phone.slice(-4)}`,
    phoneNumberId: phoneNumberId.slice(0, 8),
    serverUrl,
  });

  const res = await fetch(`${VAPI_API_URL}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phoneNumberId,
      customer: { number: e164Phone },
      assistant: assistantConfig,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vapi outbound call failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { vapiCallId: data.id };
}

// ── Vapi API Calls ──────────────────────────────────────────────────────────

/**
 * Create or update a Vapi assistant with our configuration.
 * Returns the assistant ID.
 */
export async function createOrUpdateAssistant(
  serverUrl: string,
): Promise<string> {
  const apiKey = getVapiApiKey();
  const config = buildAssistantConfig(serverUrl);
  const existingId = getVapiAssistantId();

  const url = existingId
    ? `${VAPI_API_URL}/assistant/${existingId}`
    : `${VAPI_API_URL}/assistant`;

  const method = existingId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vapi ${method} assistant failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * List calls from Vapi (for sync/reconciliation).
 */
export async function listVapiCalls(limit = 20): Promise<unknown[]> {
  const apiKey = getVapiApiKey();
  const res = await fetch(`${VAPI_API_URL}/call?limit=${limit}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Vapi list calls failed (${res.status})`);
  }

  return res.json();
}
