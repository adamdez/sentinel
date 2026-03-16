/**
 * Seller Conversation Style Overlay — Dominion Home Deals
 *
 * A bounded, versioned module that encodes the approved tone and approach
 * for AI-generated seller conversation suggestions.
 *
 * DESIGN PRINCIPLES:
 *   - Local, calm, non-pushy, empathy-first, curiosity-led.
 *   - Seller is in control. We are not the aggressor.
 *   - Influenced by NEPQ (problem-first openers, seller-surfaced urgency)
 *     and Chris Voss (labeling, calibrated questions, late-night FM voice)
 *     as background texture — NOT as dominant script style.
 *   - Never sounds like a hostage negotiation or hype closer.
 *   - No investor-bro language, no fake urgency, no "motivated seller" framing
 *     directed at the seller themselves.
 *   - Suggestions are starting points for Logan, not scripts.
 *
 * USAGE:
 *   Import getStyleBlock(context) and inject into AI prompt strings.
 *   The context argument selects the right emphasis for each surface.
 *   Version this module: bump CONVERSATION_STYLE_VERSION on any copy change.
 *
 * REVIEW VISIBILITY:
 *   - CONVERSATION_STYLE_VERSION is embedded in AI trace prompt_version strings
 *     (e.g., "call_copilot@1.0.0+style@1.0.0") so Adam can correlate style
 *     version to AI output quality in the call quality snapshot.
 *   - No DB writes from this file. Pure prompt utility.
 *
 * BOUNDARY:
 *   - Zero imports. Pure TypeScript.
 *   - Client and server safe.
 *   - Never auto-writes to leads, calls_log, or any CRM table.
 */

// ── Version ───────────────────────────────────────────────────────────────────

/**
 * Bump this string when any style guidance text changes.
 * Embedded in prompt_version fields so outputs can be correlated to style.
 */
export const CONVERSATION_STYLE_VERSION = "1.0.0";

// ── Context types ─────────────────────────────────────────────────────────────

/**
 * Which AI surface is requesting style guidance.
 * Each context gets slightly different emphasis while sharing the core tone.
 */
export type ConversationStyleContext =
  | "call_copilot"       // Pre-call brief: opener, talking points, objection handling
  | "post_call_summary"  // Post-call summary bullets: what happened, next steps framing
  | "objection_support"  // Live objection suggestions during call
  | "inbound_guidance";  // Inbound / warm-transfer first-contact framing

// ── Core style rules (shared across all contexts) ─────────────────────────────

const CORE_STYLE = `
## Conversation Style Rules (Dominion Home Deals)

**Tone:** Local. Calm. Patient. Direct without being pushy. The seller leads.

**Voice character:**
- Talk like a neighbor who buys houses, not a salesperson with a script.
- Slow down on anything the seller needs to absorb. Short sentences over long ones.
- Never manufacture urgency. If urgency exists, the seller will surface it.

**Question approach:**
- Use open, curious questions that let the seller narrate their own situation.
  Prefer "What's got you thinking about this now?" over "Are you motivated to sell?"
- Calibrated questions ("What's most important to you about timing?") over
  binary yes/no questions that put sellers on defense.
- One question at a time. Don't stack.

**Objection framing:**
- Acknowledge before responding. "That makes sense — a lot of people feel that way at first."
- Label the concern without amplifying it. "It sounds like price is the main thing."
- Respond with information, not pressure. Let the seller arrive at their own conclusion.
- Never argue. Never close aggressively.

**Things to avoid:**
- No investor jargon ("motivated seller," "wholesale," "assignment fee," "ARV" toward sellers).
- No fake scarcity or urgency. No countdown pressure.
- No assumptions about family situations, finances, or emotional state.
- No over-personalization that feels surveillance-like ("I see you've lived there 14 years").
- Never sound like a script read aloud.

**Local identity:**
- We're a small local team in Spokane. Not a fund, not a national company.
- Mention Spokane or Kootenai naturally when relevant — not as a credential flex.
`.trim();

// ── Context-specific emphasis ─────────────────────────────────────────────────

const CONTEXT_EMPHASIS: Record<ConversationStyleContext, string> = {

  call_copilot: `
**For the pre-call brief specifically:**
- The suggested opener should feel like something Logan would actually say on a Tuesday.
  One sentence. Natural. References something real about their situation without being creepy.
  Example shape: "Hey [name], I'm calling about your property on [street] — hoping to catch
  you at a good time." Then silence. Let them respond.
- Talking points should be conversation starters, not data dumps.
  Surface one or two things at a time. Leave room for them to talk.
- Objection rebuttals: acknowledge first, then one calm sentence.
  Not a three-step rebuttal system. Just: hear it, name it, answer it plainly.
- The negotiation anchor is for Logan's reference — it is NOT a line to read aloud.
- Watch-outs should be practical: what not to say, what to listen for, compliance items.
`.trim(),

  post_call_summary: `
**For post-call summary bullets specifically:**
- Describe what the seller said and what they seem to want — not what we want.
- Capture any emotional signals neutrally: "seller seemed uncertain about timeline"
  not "seller is not motivated."
- Next steps should be operator-actionable: a specific callback, a question to answer,
  a document to prepare. Not vague ("follow up soon").
- Deal temperature should reflect the seller's position, not our preference.
`.trim(),

  objection_support: `
**For live objection suggestions specifically:**
- Keep it to one sentence. Logan is on a live call.
- Acknowledge-then-respond pattern only. Never skip the acknowledge.
- If there's no good response, suggest listening: "Let them finish. Ask: what would make
  this work for you?"
- Do not suggest closing language. Suggest questions or acknowledgments.
`.trim(),

  inbound_guidance: `
**For inbound and warm-transfer guidance specifically:**
- First priority: establish we're real, local, and not pushy.
  Surface the who_we_are and how_got_info snippets early if the caller is cold.
- Do not pitch. Ask what brought them to call.
- Warm transfer contexts: seller already has context. Skip the intro, go straight
  to curiosity questions about their situation.
- If the caller sounds distressed or rushed, slow down deliberately.
  Match their energy lower, not higher.
`.trim(),

};

// ── Exported function ─────────────────────────────────────────────────────────

/**
 * Returns the full style block for a given AI surface context.
 *
 * Inject this string into AI system prompts to apply the approved
 * Dominion Home Deals conversation style.
 *
 * Example usage in a prompt builder:
 *   const style = getStyleBlock("call_copilot");
 *   return [...existingPromptLines, style].join("\n");
 *
 * @param context - Which surface is requesting style guidance
 * @returns Full style block string, ready to embed in a prompt
 */
export function getStyleBlock(context: ConversationStyleContext): string {
  return [CORE_STYLE, "", CONTEXT_EMPHASIS[context]].join("\n");
}

/**
 * Returns a compact one-line style version tag for embedding in prompt_version strings.
 * Example: "+style@1.0.0"
 */
export function styleVersionTag(): string {
  return `+style@${CONVERSATION_STYLE_VERSION}`;
}
