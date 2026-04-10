import { describe, expect, it } from "vitest";

import {
  buildDialQueueEquityOwnerFlags,
  deriveDialerEquitySnapshot,
  formatDialerEquityDisplay,
} from "@/lib/dialer/equity";

describe("dialer equity helpers", () => {
  it("prefers explicit available equity over other signals", () => {
    const property = {
      estimated_value: 300000,
      equity_percent: 65,
      owner_flags: {
        available_equity: 180000,
        total_loan_balance: 120000,
      },
    };

    expect(deriveDialerEquitySnapshot(property)).toEqual({
      availableEquity: 180000,
      equityPercent: 65,
      totalLoanBalance: 120000,
    });
    expect(formatDialerEquityDisplay(property)).toEqual({
      valueText: "$180k equity",
      detailText: "65% equity",
      combinedText: "$180k equity • 65% equity",
    });
  });

  it("computes dollar equity from AVM and loan balance when explicit equity is missing", () => {
    const property = {
      estimated_value: 250000,
      owner_flags: {
        total_loan_balance: 70000,
      },
    };

    expect(deriveDialerEquitySnapshot(property)).toEqual({
      availableEquity: 180000,
      equityPercent: null,
      totalLoanBalance: 70000,
    });
    expect(buildDialQueueEquityOwnerFlags(property)).toEqual({
      total_loan_balance: 70000,
      available_equity: 180000,
    });
  });

  it("falls back to percent-only display when dollars are unavailable", () => {
    const property = {
      equity_percent: 58,
      owner_flags: {},
    };

    expect(formatDialerEquityDisplay(property)).toEqual({
      valueText: "58% equity",
      detailText: null,
      combinedText: "58% equity",
    });
  });

  it("returns null display values when no usable equity data exists", () => {
    expect(formatDialerEquityDisplay({ owner_flags: {} })).toEqual({
      valueText: null,
      detailText: null,
      combinedText: null,
    });
    expect(buildDialQueueEquityOwnerFlags({ owner_flags: {} })).toBeNull();
  });
});
