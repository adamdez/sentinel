/**
 * GET  /api/dialer/v1/outbound-prep  — list prep frames (filtered)
 * POST /api/dialer/v1/outbound-prep  — assemble a new prep frame for a lead
 *
 * PREP ONLY — no live calls, no Twilio, no automated outbound.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient }        from "@/lib/supabase";
import { assembleFrame }             from "@/lib/outbound-prep";
import type { AssembleFrameInput }   from "@/lib/outbound-prep";
import type { CRMLeadContext }       from "@/lib/dialer/types";
import type { ObjectionTag }         from "@/lib/dialer/types";

// ── Row type returned by the API ──────────────────────────────────────────────

export interface OutboundPrepFrameRow {
  id:                    string;
  lead_id:               string;
  assembled_by:          string | null;
  assembled_at:          string;
  opener_script_key:     string | null;
  opener_script_version: string | null;
  qual_snapshot:         Record<string, unknown>;
  objection_tags:        string[];
  trust_snippets_used:   string[];
  seller_pages_included: string[];
  handoff_ready:         boolean;
  fallback_reason:       string | null;
  review_status:         string;
  reviewer_notes:        string | null;
  reviewed_by:           string | null;
  reviewed_at:           string | null;
  automation_tier:       string;
  created_at:            string;
}

// ── GET — list frames ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const { searchParams } = new URL(req.url);

  const leadId       = searchParams.get("lead_id");
  const reviewStatus = searchParams.get("review_status");
  const handoffReady = searchParams.get("handoff_ready");
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  let query = (sb as any)
    .from("outbound_prep_frames")
    .select("*")
    .order("assembled_at", { ascending: false })
    .limit(limit);

  if (leadId)       query = query.eq("lead_id", leadId);
  if (reviewStatus) query = query.eq("review_status", reviewStatus);
  if (handoffReady !== null)
    query = query.eq("handoff_ready", handoffReady === "true");

  const { data, error } = await query;
  if (error) {
    console.error("[outbound-prep GET]", error);
    return NextResponse.json({ error: "Failed to fetch frames" }, { status: 500 });
  }

  return NextResponse.json({ frames: data ?? [] });
}

// ── POST — assemble a frame ───────────────────────────────────────────────────

export interface AssembleFrameRequest {
  lead_id:                string;
  crm_context:            CRMLeadContext;
  objection_tags?:        ObjectionTag[];
  opener_script_key?:     string;
  opener_script_version?: string;
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();

  let body: AssembleFrameRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { lead_id, crm_context, objection_tags, opener_script_key, opener_script_version } = body;

  if (!lead_id || !crm_context) {
    return NextResponse.json({ error: "lead_id and crm_context required" }, { status: 400 });
  }

  // Assemble deterministically — no AI, no Twilio
  const input: AssembleFrameInput = {
    crmContext:           crm_context,
    objectionTags:        objection_tags ?? [],
    openerScriptKey:      opener_script_key,
    openerScriptVersion:  opener_script_version,
  };
  const frame = assembleFrame(input);

  // Resolve current user
  const { data: { user } } = await sb.auth.getUser();

  const insert = {
    lead_id:               lead_id,
    assembled_by:          user?.id ?? null,
    opener_script_key:     frame.openerScriptKey,
    opener_script_version: frame.openerScriptVersion,
    qual_snapshot:         frame.qualSnapshot,
    objection_tags:        frame.objectionTags,
    trust_snippets_used:   frame.trustSnippetsUsed,
    seller_pages_included: frame.sellerPagesIncluded,
    handoff_ready:         frame.handoffReady,
    fallback_reason:       frame.fallbackReason,
    review_status:         "pending",
    automation_tier:       "prep_only",
  };

  const { data, error } = await (sb as any)
    .from("outbound_prep_frames")
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error("[outbound-prep POST]", error);
    return NextResponse.json({ error: "Failed to save frame" }, { status: 500 });
  }

  return NextResponse.json({ frame: data }, { status: 201 });
}
