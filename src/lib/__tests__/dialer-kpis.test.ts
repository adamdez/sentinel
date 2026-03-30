import { describe, expect, it } from "vitest";

import {
  aggregateDialerKpis,
  formatTalkTime,
  isInboundCall,
  isMissedInboundCall,
  isOutboundCall,
  isPickupCall,
  kpiDateInputValue,
  resolveDialerKpiRange,
  type DialerKpiCallRecord,
} from "@/lib/dialer-kpis";

describe("dialer KPI call classification", () => {
  it("treats outbound calls as outbound unless they are SMS-only", () => {
    expect(isOutboundCall({ direction: "outbound", disposition: "answered" })).toBe(true);
    expect(isOutboundCall({ direction: "outbound", disposition: "sms_outbound" })).toBe(false);
    expect(isOutboundCall({ direction: "inbound", disposition: "answered" })).toBe(false);
  });

  it("counts pickups only for answered outbound calls", () => {
    expect(isPickupCall({ direction: "outbound", disposition: "answered" })).toBe(true);
    expect(isPickupCall({ direction: "outbound", disposition: "interested" })).toBe(true);
    expect(isPickupCall({ direction: "outbound", disposition: "voicemail" })).toBe(false);
    expect(isPickupCall({ direction: "inbound", disposition: "answered" })).toBe(false);
  });

  it("counts inbound and missed inbound correctly", () => {
    expect(isInboundCall({ direction: "inbound" })).toBe(true);
    expect(isInboundCall({ direction: "outbound" })).toBe(false);
    expect(isMissedInboundCall({ direction: "inbound", disposition: "missed" })).toBe(true);
    expect(isMissedInboundCall({ direction: "inbound", disposition: "busy" })).toBe(true);
    expect(isMissedInboundCall({ direction: "inbound", disposition: "answered" })).toBe(false);
  });
});

describe("dialer KPI aggregation", () => {
  const calls: DialerKpiCallRecord[] = [
    { user_id: "adam", direction: "outbound", disposition: "answered", duration_sec: 120, started_at: "2026-03-30T16:00:00.000Z" },
    { user_id: "adam", direction: "outbound", disposition: "voicemail", duration_sec: 20, started_at: "2026-03-30T16:05:00.000Z" },
    { user_id: "adam", direction: "inbound", disposition: "missed", duration_sec: 0, started_at: "2026-03-30T16:10:00.000Z" },
    { user_id: "logan", direction: "outbound", disposition: "interested", duration_sec: 240, started_at: "2026-03-30T16:15:00.000Z" },
    { user_id: "logan", direction: "inbound", disposition: "answered", duration_sec: 60, started_at: "2026-03-30T16:20:00.000Z" },
    { user_id: "ops", direction: "outbound", disposition: "answered", duration_sec: 90, started_at: "2026-03-30T16:25:00.000Z" },
    { user_id: "adam", direction: "outbound", disposition: "sms_outbound", duration_sec: 0, started_at: "2026-03-30T16:30:00.000Z" },
  ];

  it("returns personal and team metrics from the same call set", () => {
    const snapshot = aggregateDialerKpis({
      calls,
      userId: "adam",
      teamUserIds: ["adam", "logan"],
      range: { from: "2026-03-30T07:00:00.000Z", to: "2026-03-31T06:59:59.999Z", preset: "today" },
    });

    expect(snapshot.metrics.outbound.user).toBe(2);
    expect(snapshot.metrics.outbound.team).toBe(3);
    expect(snapshot.metrics.pickups.user).toBe(1);
    expect(snapshot.metrics.pickups.team).toBe(2);
    expect(snapshot.metrics.inbound.user).toBe(1);
    expect(snapshot.metrics.inbound.team).toBe(2);
    expect(snapshot.metrics.missedCalls.user).toBe(1);
    expect(snapshot.metrics.missedCalls.team).toBe(1);
    expect(snapshot.metrics.talkTimeSec.user).toBe(140);
    expect(snapshot.metrics.talkTimeSec.team).toBe(440);
  });

  it("falls back to all calls for team totals when no team user ids are provided", () => {
    const snapshot = aggregateDialerKpis({
      calls,
      userId: "adam",
      teamUserIds: null,
      range: { from: null, to: null, preset: "all" },
    });

    expect(snapshot.metrics.outbound.team).toBe(4);
    expect(snapshot.metrics.pickups.team).toBe(3);
  });
});

describe("dialer KPI ranges", () => {
  const now = new Date("2026-03-30T19:45:00.000Z");

  it("resolves Pacific today, week, month, year, and all presets", () => {
    const today = resolveDialerKpiRange({ preset: "today", now });
    const week = resolveDialerKpiRange({ preset: "week", now });
    const month = resolveDialerKpiRange({ preset: "month", now });
    const year = resolveDialerKpiRange({ preset: "year", now });
    const all = resolveDialerKpiRange({ preset: "all", now });

    expect(kpiDateInputValue(today.from)).toBe("2026-03-30");
    expect(kpiDateInputValue(today.to)).toBe("2026-03-30");
    expect(kpiDateInputValue(week.from)).toBe("2026-03-29");
    expect(kpiDateInputValue(month.from)).toBe("2026-03-01");
    expect(kpiDateInputValue(year.from)).toBe("2026-01-01");
    expect(all.from).toBeNull();
    expect(all.to).toBeNull();
  });

  it("supports a custom single-day range and arbitrary custom end date", () => {
    const oneDay = resolveDialerKpiRange({ preset: "custom", from: "2026-02-14", to: "2026-02-14", now });
    const arbitrary = resolveDialerKpiRange({ preset: "custom", from: "2026-02-14", to: "2026-02-20", now });

    expect(kpiDateInputValue(oneDay.from)).toBe("2026-02-14");
    expect(kpiDateInputValue(oneDay.to)).toBe("2026-02-14");
    expect(kpiDateInputValue(arbitrary.from)).toBe("2026-02-14");
    expect(kpiDateInputValue(arbitrary.to)).toBe("2026-02-20");
  });
});

describe("talk-time formatting", () => {
  it("renders sub-hour and multi-hour values cleanly", () => {
    expect(formatTalkTime(0)).toBe("0:00");
    expect(formatTalkTime(65)).toBe("1:05");
    expect(formatTalkTime(3661)).toBe("1:01");
  });
});
