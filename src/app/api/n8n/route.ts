import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * POST /api/n8n
 *
 * Universal n8n webhook receiver. n8n workflows call this endpoint
 * to trigger Sentinel actions or report workflow results.
 *
 * Authenticated via INGEST_WEBHOOK_SECRET header.
 *
 * Actions:
 * - "lead.created" — n8n notifies Sentinel a lead was created externally
 * - "lead.enriched" — n8n completed enrichment workflow
 * - "task.completed" — n8n completed a task (e.g., sent email, scheduled call)
 * - "alert.triggered" — n8n detected an anomaly
 * - "workflow.completed" — generic workflow completion notification
 * - "workflow.failed" — workflow failure notification
 *
 * GET /api/n8n
 * Returns available n8n webhook endpoints and their expected payloads.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.INGEST_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, data } = body as {
    action: string;
    data: Record<string, unknown>;
  };

  if (!action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }

  const sb = createServerClient();
  const now = new Date().toISOString();

  switch (action) {
    case "lead.created": {
      // n8n created a lead externally — log it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        action: "n8n.lead.created",
        entity_type: "lead",
        entity_id: data.leadId ?? null,
        details: data,
        created_at: now,
      });
      return NextResponse.json({ ok: true, action });
    }

    case "lead.enriched": {
      // n8n completed enrichment — update lead status
      if (data.leadId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("leads") as any)
          .update({
            property_snapshot_status: "enriched",
            updated_at: now,
          })
          .eq("id", data.leadId);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        action: "n8n.lead.enriched",
        entity_type: "lead",
        entity_id: data.leadId ?? null,
        details: data,
      });
      return NextResponse.json({ ok: true, action });
    }

    case "task.completed": {
      // n8n completed a task — mark it done
      if (data.taskId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("tasks") as any)
          .update({ status: "completed", completed_at: now, updated_at: now })
          .eq("id", data.taskId);
      }
      return NextResponse.json({ ok: true, action });
    }

    case "alert.triggered": {
      // n8n detected an anomaly — create event log entry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        action: "n8n.alert",
        entity_type: data.entityType ?? "system",
        entity_id: data.entityId ?? null,
        details: { alertType: data.alertType, message: data.message, ...data },
      });
      return NextResponse.json({ ok: true, action });
    }

    case "workflow.completed":
    case "workflow.failed": {
      // Generic workflow status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        action: `n8n.${action}`,
        entity_type: "workflow",
        entity_id: data.workflowId ?? null,
        details: data,
      });
      return NextResponse.json({ ok: true, action });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    description: "Sentinel n8n webhook receiver",
    endpoint: "/api/n8n",
    method: "POST",
    authentication: "x-webhook-secret header or Bearer token",
    actions: {
      "lead.created": { data: { leadId: "uuid", source: "string" } },
      "lead.enriched": { data: { leadId: "uuid", provider: "string", fieldsUpdated: "string[]" } },
      "task.completed": { data: { taskId: "uuid", result: "string" } },
      "alert.triggered": { data: { alertType: "string", message: "string", entityType: "string", entityId: "uuid" } },
      "workflow.completed": { data: { workflowId: "string", workflowName: "string", duration: "number" } },
      "workflow.failed": { data: { workflowId: "string", error: "string" } },
    },
    outboundWebhooks: {
      description: "Sentinel fires these to N8N_WEBHOOK_BASE_URL",
      events: [
        "lead.stage_changed — fires when any lead changes stage",
        "deal.created — fires when deal is created",
        "call.completed — fires when call session is published",
        "review.approved — fires when review queue item is approved",
        "campaign.touch_completed — fires when campaign touch executes",
      ],
    },
  });
}
