import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import { applyTinaReviewerObservedDelta } from "@/tina/lib/workflow-state";
import type {
  TinaReviewerObservedDeltaDomain,
  TinaReviewerObservedDeltaKind,
  TinaReviewerObservedDeltaSeverity,
} from "@/tina/types";

function isValidDomain(value: unknown): value is TinaReviewerObservedDeltaDomain {
  return (
    value === "entity_route" ||
    value === "evidence_books" ||
    value === "treatment_authority" ||
    value === "form_execution" ||
    value === "workflow_governance" ||
    value === "planning" ||
    value === "general"
  );
}

function isValidKind(value: unknown): value is TinaReviewerObservedDeltaKind {
  return (
    value === "accepted_first_pass" ||
    value === "accepted_after_adjustment" ||
    value === "change_requested" ||
    value === "rejected" ||
    value === "stale_after_acceptance"
  );
}

function isValidSeverity(value: unknown): value is TinaReviewerObservedDeltaSeverity {
  return value === "info" || value === "needs_attention" || value === "blocking";
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("draft" in body) ||
    !("title" in body) ||
    !("domain" in body) ||
    !("kind" in body)
  ) {
    return NextResponse.json(
      { error: "Missing reviewer observed delta payload" },
      { status: 400 }
    );
  }

  const payload = body as {
    draft: unknown;
    title: unknown;
    domain: unknown;
    kind: unknown;
    severity?: unknown;
    reviewerName?: unknown;
    summary?: unknown;
    trustEffect?: unknown;
    ownerEngines?: unknown;
    benchmarkScenarioIds?: unknown;
    relatedDecisionId?: unknown;
    relatedSnapshotId?: unknown;
    relatedAuthorityWorkIdeaId?: unknown;
  };

  if (typeof payload.title !== "string" || payload.title.trim().length === 0) {
    return NextResponse.json({ error: "Reviewer delta title is required" }, { status: 400 });
  }

  if (!isValidDomain(payload.domain)) {
    return NextResponse.json({ error: "Invalid reviewer delta domain" }, { status: 400 });
  }

  if (!isValidKind(payload.kind)) {
    return NextResponse.json({ error: "Invalid reviewer delta kind" }, { status: 400 });
  }

  if (payload.severity !== undefined && !isValidSeverity(payload.severity)) {
    return NextResponse.json({ error: "Invalid reviewer delta severity" }, { status: 400 });
  }

  const draft = parseTinaWorkspaceDraft(JSON.stringify(payload.draft));
  const updatedDraft = applyTinaReviewerObservedDelta(draft, {
    title: payload.title.trim(),
    domain: payload.domain,
    kind: payload.kind,
    severity: payload.severity,
    reviewerName:
      typeof payload.reviewerName === "string" && payload.reviewerName.trim().length > 0
        ? payload.reviewerName.trim()
        : user.email || user.id,
    summary: typeof payload.summary === "string" ? payload.summary : undefined,
    trustEffect: typeof payload.trustEffect === "string" ? payload.trustEffect : undefined,
    ownerEngines: Array.isArray(payload.ownerEngines)
      ? payload.ownerEngines.filter((item): item is string => typeof item === "string")
      : undefined,
    benchmarkScenarioIds: Array.isArray(payload.benchmarkScenarioIds)
      ? payload.benchmarkScenarioIds.filter((item): item is string => typeof item === "string")
      : undefined,
    relatedDecisionId:
      typeof payload.relatedDecisionId === "string" ? payload.relatedDecisionId : undefined,
    relatedSnapshotId:
      typeof payload.relatedSnapshotId === "string" ? payload.relatedSnapshotId : undefined,
    relatedAuthorityWorkIdeaId:
      typeof payload.relatedAuthorityWorkIdeaId === "string"
        ? payload.relatedAuthorityWorkIdeaId
        : undefined,
  });

  return NextResponse.json({
    draft: updatedDraft,
    reviewerObservedDelta: updatedDraft.reviewerObservedDeltas[0] ?? null,
    recordedBy: user.id,
  });
}
