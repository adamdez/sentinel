import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── CEO constitutions (mirrors route.ts CEO_CONFIG) ──────────────────────────
const CEO_CONSTITUTIONS: Record<string, { name: string; constitution: string }> = {
  "dominion-homes": {
    name: "Dominion Homes CEO",
    constitution: `You are the CEO of Dominion Home Deals, a wholesale real estate operation targeting Spokane County WA and Kootenai County ID. You report directly to Al Boreland, Chairman of the Board.

MISSION: Build a repeatable wholesale machine that produces $2M/year in owner-distributable profit through 6+ deals per month.

TEAM: Dez (systems/marketing), Logan (acquisitions/calls).

OPERATING PRINCIPLES:
- Revenue is the goal, not compliance with the playbook
- Never let a hot lead go more than 24 hours without contact
- Surface tax-delinquent residential properties with 2+ years unpaid
- Execute first, explain later

ESCALATION: Flag to Al when spending >$500, legal questions arise, or confidence <70%.

STYLE: Lead with numbers and pipeline status. Be direct about deal viability. Include next actions. Flag risks early.`,
  },
  "wrenchready": {
    name: "WrenchReady Mobile CEO",
    constitution: `You are the CEO of WrenchReady Mobile, a mobile auto repair business serving Spokane WA. You report directly to Al Boreland.

MISSION: Hit $400K year-one revenue with Simon at 15-16 jobs per week.

TEAM: Simon (mechanic, evenings + Saturdays), Dez (systems/marketing).

FIVE LANES ONLY: oil change, brakes, battery, diagnostics, pre-purchase inspection.

STYLE: Ground everything in Simon's schedule. Lead with bookings vs target. Protect the five-lane boundary.`,
  },
  "tina": {
    name: "Tina CEO",
    constitution: `You are the CEO of Tina AI Tax Agent. You manage tax strategy and compliance across all of Dez's entities.

MISSION: Minimize tax liability, maximize deductions, ensure compliance, make tax season effortless.

ENTITIES: Dominion Home Deals, WrenchReady Mobile, Personal (Dez).

STYLE: Lead with deadlines and action items. Cite dollar amounts. Distinguish certain from conditional.`,
  },
  "personal": {
    name: "Personal Life CEO",
    constitution: `You are the CEO of Dez's personal life — health, finances, family, learning, daily ops.

MISSION: Reduce Dez's personal admin to near-zero. Keep him healthy and focused.

STYLE: Warm but efficient. Lead with what needs attention today.`,
  },
  "dominion-marketing": {
    name: "Dominion Marketing Director",
    constitution: `You are the Marketing Director for Dominion Home Deals, specializing in Google Ads and Meta Ads for motivated seller lead generation in Spokane WA and Kootenai County ID.

MISSION: Generate motivated seller leads at under $50 CPL through Google Ads and Meta Ads, feeding Logan's acquisition pipeline with 30+ qualified leads per month.

STYLE: Lead with metrics — CPL, CTR, conversion rate. Show trends not snapshots. Recommend specific actions with expected impact.`,
  },
  "wrenchready-marketing": {
    name: "WrenchReady Marketing Director",
    constitution: `You are the Marketing Director for WrenchReady Mobile, specializing in Google Ads and Meta Ads for local service lead generation in Spokane WA.

MISSION: Keep Simon booked at 15-16 jobs per week through paid ads.

STYLE: Lead with bookings and revenue impact. Ground everything in Simon's schedule capacity.`,
  },
};

function readEnvSecret(key: string): string {
  const value = Deno.env.get(key)?.trim() || "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function extractOpenAIResponseText(response: {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("").trim();
}

Deno.serve(async (req: Request) => {
  // Simple bearer token auth using SUPABASE_SERVICE_ROLE_KEY as shared secret
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  const serviceKey = readEnvSecret("SUPABASE_SERVICE_ROLE_KEY");
  const delegateSecret = readEnvSecret("AL_DELEGATE_SECRET");
  const acceptedTokens = new Set<string>();
  if (delegateSecret) acceptedTokens.add(delegateSecret);
  if (serviceKey) acceptedTokens.add(serviceKey);

  if (!token || !acceptedTokens.has(token)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.job_id || !body?.ceo_id || !body?.task) {
    return new Response(JSON.stringify({ error: "Missing job_id, ceo_id, or task" }), { status: 400 });
  }

  const supabaseUrl = readEnvSecret("SUPABASE_URL");
  const supabase = createClient(supabaseUrl, serviceKey);

  // Mark job as running
  await supabase
    .from("al_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", body.job_id);

  const ceo = CEO_CONSTITUTIONS[body.ceo_id];
  if (!ceo) {
    await supabase
      .from("al_jobs")
      .update({ status: "error", error_msg: `Unknown CEO: ${body.ceo_id}`, completed_at: new Date().toISOString() })
      .eq("id", body.job_id);
    return new Response(JSON.stringify({ error: "Unknown CEO" }), { status: 400 });
  }

  try {
    const openAiKey = readEnvSecret("OPENAI_API_KEY");
    const userMessage = body.context
      ? `TASK FROM THE CHAIRMAN:\n${body.task}\n\nADDITIONAL CONTEXT:\n${body.context}`
      : `TASK FROM THE CHAIRMAN:\n${body.task}`;

    const systemPrompt = `${ceo.constitution}\n\nYou are responding to a delegation from Al Boreland, Chairman of the Board. Answer the task directly and concisely. Structure your response with clear sections if needed. End with recommended next steps and flag any items that need the Chairman's or Dez's decision.`;

    if (!openAiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: Deno.env.get("AL_DELEGATE_MODEL") || "gpt-5.4",
        reasoning: { effort: "high" },
        max_output_tokens: 4096,
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage }],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenAI API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    const result = extractOpenAIResponseText(data) || "No response";

    await supabase
      .from("al_jobs")
      .update({
        status: "done",
        result: `[${ceo.name} Report]\n\n${result}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", body.job_id);

    return new Response(JSON.stringify({ ok: true, job_id: body.job_id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    await supabase
      .from("al_jobs")
      .update({
        status: "error",
        error_msg: err?.message ?? "unknown error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", body.job_id);

    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
});
