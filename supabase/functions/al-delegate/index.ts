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
- Default to operating mode, not consultant mode
- Diagnose the bottleneck, choose the next move, assign the owner, and move the lane
- Return concrete proof, blockers, and next actions instead of a generic memo
- If evidence is missing, say exactly what is unverified and what must be checked next

ESCALATION: Flag to Al when spending >$500, legal questions arise, or confidence <70%.

STYLE: Lead with numbers and pipeline status. Be direct about deal viability. Include next actions. Flag risks early.`,
  },
  "wrenchready": {
    name: "WrenchReady Mobile CEO",
    constitution: `You are the CEO of WrenchReady Mobile, a mobile auto repair business serving Spokane WA. You report directly to Al Boreland.

MISSION: Hit $400K year-one revenue with Simon at 15-16 jobs per week.

TEAM: Simon (mechanic, evenings + Saturdays), Dez (systems/marketing).

FIVE LANES ONLY: oil change, brakes, battery, diagnostics, pre-purchase inspection.

OPERATING PRINCIPLES:
- Protect wrench time first
- Default to operating mode, not consultant mode
- Diagnose the bottleneck, choose the next move, assign the owner, and move the lane
- Return concrete proof, blockers, and next actions instead of a generic memo
- If evidence is missing, say exactly what is unverified and what must be checked next

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

const SHARED_DELEGATION_DOC_PATHS = [
  "02-Doctrine/AL-Boreland-True-North.md",
  "02-Doctrine/What-AL-Is.md",
  "02-Doctrine/CEO-Operating-Doctrine.md",
  "02-Doctrine/Outcome-Review-Standard.md",
  "01-Decisions/AL-Has-One-Brain-And-One-Root-Home.md",
];

const CEO_SPECIFIC_DOC_PATHS: Record<string, string[]> = {
  "dominion-homes": [
    "03-Businesses/Dominion/CEO-Scorecard-And-Operating-Mode.md",
    "03-Businesses/Dominion/Notes/Dominion-Operating-Thesis.md",
    "03-Businesses/Dominion/Canonical-Source-Docs/dominion-30-day-ai-operating-plan.md",
  ],
  wrenchready: [
    "03-Businesses/WrenchReady/CEO-Scorecard-And-Operating-Mode.md",
    "03-Businesses/WrenchReady/Notes/WrenchReady-Operating-Thesis.md",
    "03-Businesses/WrenchReady/Week-By-Week-Launch-Tracker.md",
    "03-Businesses/WrenchReady/Canonical-Source-Docs/launch-plan-evening-saturday-18-weeks.md",
    "03-Businesses/WrenchReady/Canonical-Source-Docs/operating-doctrine-earn-next-visit-wrench-time.md",
  ],
};

const MAX_VAULT_CONTEXT_CHARS = 24000;

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

function formatContextForPrompt(context: unknown): string {
  if (typeof context !== "string") return "";
  const trimmed = context.trim();
  if (!trimmed) return "";

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

function compactVaultContext(
  docs: Array<{ path?: string | null; content?: string | null }>,
): string {
  if (!docs.length) return "";

  let usedChars = 0;
  const blocks: string[] = [];

  for (const doc of docs) {
    const path = doc.path?.trim();
    const content = doc.content?.trim();
    if (!path || !content) continue;

    const remaining = MAX_VAULT_CONTEXT_CHARS - usedChars;
    if (remaining <= 0) break;

    const clipped =
      content.length > remaining ? `${content.slice(0, Math.max(0, remaining - 16))}\n...[truncated]` : content;

    blocks.push(`--- ${path} ---\n${clipped}`);
    usedChars += clipped.length;
  }

  if (!blocks.length) return "";
  return `VAULT CONTEXT:\n${blocks.join("\n\n")}`;
}

async function loadDelegationVaultContext(
  supabase: ReturnType<typeof createClient>,
  ceoId: string,
): Promise<string> {
  const docPaths = [
    ...SHARED_DELEGATION_DOC_PATHS,
    ...(CEO_SPECIFIC_DOC_PATHS[ceoId] || []),
  ];

  if (!docPaths.length) return "";

  const { data, error } = await supabase
    .from("vault_documents")
    .select("path, content")
    .in("path", docPaths);

  if (error || !data?.length) return "";

  const order = new Map(docPaths.map((path, index) => [path, index]));
  const ordered = [...data].sort((a, b) => {
    const aOrder = order.get(a.path ?? "") ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(b.path ?? "") ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });

  return compactVaultContext(ordered);
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
    const formattedContext = formatContextForPrompt(body.context);
    const vaultContext = await loadDelegationVaultContext(supabase, body.ceo_id);
    const userMessage = [
      `TASK FROM THE CHAIRMAN:\n${body.task}`,
      formattedContext ? `ADDITIONAL CONTEXT:\n${formattedContext}` : "",
      vaultContext,
    ]
      .filter(Boolean)
      .join("\n\n");

    const systemPrompt = `${ceo.constitution}

You are responding to a delegation from Al Boreland, Chairman of the Board.

EXECUTION MODE:
- Default to execution-biased operating judgment, not consultant chatter.
- Move the business forward inside your authority instead of writing a vague strategy memo.
- Name the real bottleneck, the decision, the owner, the proof, and the next move.
- If something is blocked or unverified, say exactly why and what must happen next.
- Protect customer trust, human quality standards, and real-world operating constraints.
- You do not have live browser, file-edit, or purchase authority inside this lane. If execution depends on another lane, name the exact lane or owner needed instead of bluffing.

RESPONSE SHAPE:
- Current reality
- Decision
- Actions now (owner + timing)
- Risks / escalation
- Proof or missing evidence

Keep it concise, concrete, and operator-grade.`;

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
