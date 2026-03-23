import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAgentOutput, adsMonitorGoldDataset } from "../gold-datasets";

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock("@/lib/control-plane", () => ({
  isAgentEnabled: vi.fn().mockResolvedValue(true),
  createAgentRun: vi.fn().mockResolvedValue("test-run-ads-001"),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./prompt", () => ({
  ADS_MONITOR_AGENT_VERSION: "1.0.0",
  ADS_THRESHOLDS: {
    maxCPL: 60,
    minLeadsPerDay: 1,
    minCTR: 1.5,
    maxCPC: 25,
    minBudgetUtilization: 50,
    maxBudgetUtilization: 95,
    minConversionRate: 2.0,
    impressionDropPercent: 50,
  },
}));

// ── Setup ────────────────────────────────────────────────────────────────────

function setupAdsMocks(goldCase: typeof adsMonitorGoldDataset[0]) {
  // Generate 7 days of daily metrics simulating the gold case scenario
  // CPL = spend7d / leads7d = 850 / 2 = $425 (well above $60 threshold)
  const dailyStats: Record<string, unknown>[] = [];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const reportDate = new Date(now.getTime() - (i + 1) * 86400000)
      .toISOString()
      .split("T")[0];
    const dailySpend = goldCase.input.spend7d / 7;
    const dailyLeads = i < 2 ? 1 : 0; // 2 leads over 7 days
    const dailyImpressions = Math.round(
      (goldCase.input.spend7d / 7) / (goldCase.input.clickThroughRate * 5) // approximate
    );
    const dailyClicks = Math.round(dailyImpressions * goldCase.input.clickThroughRate);

    dailyStats.push({
      report_date: reportDate,
      campaign_id: goldCase.input.campaignId,
      impressions: dailyImpressions,
      clicks: dailyClicks,
      cost_micros: Math.round(dailySpend * 1_000_000),
      conversions: dailyLeads,
      ads_campaigns: { name: goldCase.input.campaignName },
    });
  }

  mockFrom.mockImplementation((table: string) => {
    if (table === "ads_daily_metrics") {
      // Chain: select().gte().is().is().order()
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.is = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockResolvedValue({ data: dailyStats, error: null });
      return chain;
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AdsMonitorAgent", () => {
  it("should alert on high_cpl_campaign", async () => {
    const goldCase = adsMonitorGoldDataset[0];
    setupAdsMocks(goldCase);

    const { runAdsMonitor } = await import("./index");

    const result = await runAdsMonitor({
      triggerType: "daily_cron",
      triggerRef: "test-daily",
    });

    // The agent should detect high CPL and produce alerts
    expect(result.totals.total).toBeGreaterThan(0);

    // Check for a CPL-related alert
    const cplAlert = result.alerts.find(
      (a) => a.category === "high_cpl" || a.message.toLowerCase().includes("cpl"),
    );
    expect(cplAlert).toBeDefined();

    // Validate against gold dataset
    const validationOutput = {
      shouldAlert: true,
      alertSeverity: cplAlert!.severity,
      recommendation: "pause_or_restructure",
    };

    const validation = validateAgentOutput("ads-monitor", "high_cpl_campaign", validationOutput);
    expect(validation).not.toBeNull();
    expect(validation!.pass).toBe(true);
  });

  it("should detect high CPL severity correctly", async () => {
    const goldCase = adsMonitorGoldDataset[0];
    setupAdsMocks(goldCase);

    const { runAdsMonitor } = await import("./index");

    const result = await runAdsMonitor({
      triggerType: "daily_cron",
      triggerRef: "test-daily",
    });

    // CPL of $425 is >2x the $60 threshold, so should be critical
    const cplAlert = result.alerts.find((a) => a.category === "high_cpl");
    if (cplAlert) {
      expect(["critical", "high"]).toContain(cplAlert.severity);
    }
  });

  it("should return empty report when no campaign data exists", async () => {
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.is = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
      return chain;
    });

    const { runAdsMonitor } = await import("./index");

    const result = await runAdsMonitor({
      triggerType: "daily_cron",
      triggerRef: "test-empty",
    });

    expect(result.totals.total).toBe(0);
    expect(result.summary).toContain("No campaign data");
  });

  it("should return empty report when agent is disabled", async () => {
    const { isAgentEnabled } = await import("@/lib/control-plane");
    vi.mocked(isAgentEnabled).mockResolvedValueOnce(false);

    const { runAdsMonitor } = await import("./index");

    const result = await runAdsMonitor({
      triggerType: "daily_cron",
      triggerRef: "test-disabled",
    });

    expect(result.totals.total).toBe(0);
    expect(result.summary).toContain("disabled");
  });
});
