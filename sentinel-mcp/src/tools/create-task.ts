/**
 * create_task — Create a task for a lead or deal.
 *
 * The only write tool in the MCP server that modifies core tables.
 * Tasks are the primary action-tracking mechanism in Sentinel.
 *
 * Write path:
 *   operator/agent confirms → INSERT into tasks (no review gate needed for tasks)
 *   This is a direct CRM write because tasks are operator actions, not AI inferences.
 *
 * Agent use rule:
 *   Agents creating tasks should set created_by to the run_id context,
 *   and always set a due_at. Bare tasks without due dates become noise.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeQuery } from "../db.js";

export function registerCreateTask(server: McpServer): void {
  server.tool(
    "create_task",
    "Create a task linked to a lead or deal. Requires title, assigned_to (user UUID), and either " +
    "lead_id or deal_id. Always set due_at. Use this for follow-up reminders, offer deadlines, " +
    "callback scheduling, and any other time-bound operator action.",
    {
      title: z.string().min(3).max(255).describe("Short imperative task title, e.g. 'Call back — left voicemail'"),
      assigned_to: z.string().uuid().describe("UUID of the operator to assign this task to"),
      lead_id: z.string().uuid().optional().describe("Lead UUID (required if no deal_id)"),
      deal_id: z.string().uuid().optional().describe("Deal UUID (required if no lead_id)"),
      due_at: z.string().optional().describe("ISO 8601 deadline, e.g. '2026-03-20T09:00:00Z'"),
      description: z.string().max(2000).optional().describe("Optional detail or context for the task"),
      priority: z.number().min(0).max(10).optional().describe("Priority 0-10 (default 5)"),
    },
    async (args) => {
      try {
        if (!args.lead_id && !args.deal_id) {
          return {
            content: [{ type: "text", text: "Error: Either lead_id or deal_id is required." }],
            isError: true,
          };
        }

        const rows = await writeQuery<{ id: string; title: string; due_at: string | null }>(`
          INSERT INTO tasks (
            title,
            description,
            assigned_to,
            lead_id,
            deal_id,
            due_at,
            priority,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
          RETURNING id, title, due_at
        `, [
          args.title,
          args.description ?? null,
          args.assigned_to,
          args.lead_id ?? null,
          args.deal_id ?? null,
          args.due_at ?? null,
          args.priority ?? 5,
        ]);

        const task = rows[0];
        return {
          content: [{
            type: "text",
            text: `Task created: ${task.title} (id: ${task.id}, due: ${task.due_at ?? "no deadline"})`,
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error creating task: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
