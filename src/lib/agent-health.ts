export interface AgentRunHealthRow {
  id: string;
  agent_name: string;
  status: string;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface AgentFailureCauseSummary {
  key: string;
  label: string;
  detail: string;
  action: string;
  severity: "critical" | "high" | "medium";
  count: number;
  agents: string[];
}

export interface AgentHealthAgentSummary {
  agentName: string;
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  running: number;
  successRate: number;
}

export interface AgentHealthSummary {
  generatedAt: string;
  since: string;
  windowHours: number;
  totals: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    running: number;
    successRate: number;
  };
  agents: AgentHealthAgentSummary[];
  causes: AgentFailureCauseSummary[];
  topFailedRuns: Array<{
    id: string;
    agentName: string;
    startedAt: string;
    error: string | null;
    causeKey: string;
    causeLabel: string;
    action: string;
  }>;
  headline: string;
}

interface CauseDefinition {
  key: string;
  label: string;
  detail: string;
  action: string;
  severity: "critical" | "high" | "medium";
}

const KNOWN_CAUSES: Array<{ test: (error: string, agentName: string) => boolean; cause: CauseDefinition }> = [
  {
    test: (error) => error.includes("insufficient credits") || (error.includes("firecrawl") && error.includes("402")),
    cause: {
      key: "firecrawl_credits",
      label: "Browser research blocked by Firecrawl credits",
      detail: "Browser-research runs cannot start because Firecrawl is returning 402 insufficient credits.",
      action: "Top up Firecrawl credits or keep browser-research paused.",
      severity: "critical",
    },
  },
  {
    test: (error) => error.includes("rate_limit_error") || error.includes("429"),
    cause: {
      key: "anthropic_rate_limit",
      label: "Anthropic limited research runs",
      detail: "Research runs are hitting Anthropic 429 responses, which usually means rate limits, spending limits, or exhausted credits.",
      action: "Check Anthropic billing and usage limits, then keep research concurrency low until healthy.",
      severity: "critical",
    },
  },
  {
    test: (error) => error.includes("call not found"),
    cause: {
      key: "missing_call",
      label: "QA triggered with a missing call record",
      detail: "QA is being asked to review calls that no longer exist or were never written correctly.",
      action: "Fix the caller payload or stop QA from triggering before the call record exists.",
      severity: "high",
    },
  },
  {
    test: (error) => error.includes("lead not found"),
    cause: {
      key: "missing_lead",
      label: "Follow-up triggered with a missing lead",
      detail: "Follow-up runs are being triggered with a lead id that no longer resolves in CRM.",
      action: "Fix the trigger payload or cancel jobs when the lead was deleted or merged.",
      severity: "high",
    },
  },
  {
    test: (error) => error.includes("stuck in running"),
    cause: {
      key: "stale_run",
      label: "Runs are hanging until integrity audit cleans them up",
      detail: "Some agents are never reaching a terminal status and are later auto-failed as stale.",
      action: "Inspect the agent path for missing completion calls or long-running provider waits.",
      severity: "high",
    },
  },
];

function normalizeError(error: string | null | undefined): string {
  return (error ?? "").toLowerCase();
}

export function classifyAgentFailure(error: string | null | undefined, agentName: string): CauseDefinition {
  const normalized = normalizeError(error);
  for (const entry of KNOWN_CAUSES) {
    if (entry.test(normalized, agentName.toLowerCase())) {
      return entry.cause;
    }
  }

  return {
    key: "unknown_failure",
    label: "Unclassified agent failure",
    detail: "The run failed, but the error pattern does not map to a known operational cause yet.",
    action: "Open the failed run details and inspect the raw error text.",
    severity: "medium",
  };
}

function pct(completed: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((completed / total) * 1000) / 10;
}

function buildHeadline(summary: AgentHealthSummary): string {
  if (summary.totals.failed === 0) {
    return "Agents are healthy right now.";
  }

  const topCause = summary.causes[0];
  if (!topCause) {
    return `${summary.totals.failed} runs failed in the last ${summary.windowHours}h.`;
  }

  return `${summary.totals.failed} failed runs in the last ${summary.windowHours}h. Biggest cause: ${topCause.label}.`;
}

export function summarizeAgentHealth(
  rows: AgentRunHealthRow[],
  windowHours: number,
  generatedAt = new Date().toISOString(),
): AgentHealthSummary {
  const since = new Date(Date.parse(generatedAt) - windowHours * 60 * 60 * 1000).toISOString();
  const totals = { total: 0, completed: 0, failed: 0, cancelled: 0, running: 0, successRate: 100 };
  const agentMap = new Map<string, AgentHealthAgentSummary>();
  const causeMap = new Map<string, AgentFailureCauseSummary>();

  for (const row of rows) {
    totals.total++;
    if (row.status === "completed") totals.completed++;
    if (row.status === "failed") totals.failed++;
    if (row.status === "cancelled") totals.cancelled++;
    if (row.status === "running") totals.running++;

    const agent = agentMap.get(row.agent_name) ?? {
      agentName: row.agent_name,
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      running: 0,
      successRate: 100,
    };

    agent.total++;
    if (row.status === "completed") agent.completed++;
    if (row.status === "failed") agent.failed++;
    if (row.status === "cancelled") agent.cancelled++;
    if (row.status === "running") agent.running++;
    agentMap.set(row.agent_name, agent);

    if (row.status !== "failed") continue;

    const cause = classifyAgentFailure(row.error, row.agent_name);
    const existing = causeMap.get(cause.key) ?? {
      key: cause.key,
      label: cause.label,
      detail: cause.detail,
      action: cause.action,
      severity: cause.severity,
      count: 0,
      agents: [],
    };
    existing.count++;
    if (!existing.agents.includes(row.agent_name)) existing.agents.push(row.agent_name);
    causeMap.set(cause.key, existing);
  }

  for (const agent of agentMap.values()) {
    agent.successRate = pct(agent.completed, agent.total);
  }
  totals.successRate = pct(totals.completed, totals.total);

  const agents = [...agentMap.values()].sort((a, b) => {
    if (b.failed !== a.failed) return b.failed - a.failed;
    return a.successRate - b.successRate;
  });

  const causes = [...causeMap.values()].sort((a, b) => {
    if (a.severity !== b.severity) {
      const rank = { critical: 0, high: 1, medium: 2 };
      return rank[a.severity] - rank[b.severity];
    }
    return b.count - a.count;
  });

  const topFailedRuns = rows
    .filter((row) => row.status === "failed")
    .slice(0, 8)
    .map((row) => {
      const cause = classifyAgentFailure(row.error, row.agent_name);
      return {
        id: row.id,
        agentName: row.agent_name,
        startedAt: row.started_at,
        error: row.error,
        causeKey: cause.key,
        causeLabel: cause.label,
        action: cause.action,
      };
    });

  const summary: AgentHealthSummary = {
    generatedAt,
    since,
    windowHours,
    totals,
    agents,
    causes,
    topFailedRuns,
    headline: "",
  };

  summary.headline = buildHeadline(summary);
  return summary;
}
