type UnknownRecord = Record<string, unknown>;

export interface DialerEquitySnapshot {
  availableEquity: number | null;
  equityPercent: number | null;
  totalLoanBalance: number | null;
}

export interface DialerEquityDisplay {
  valueText: string | null;
  detailText: string | null;
  combinedText: string | null;
}

function recordFromUnknown(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = numberFromUnknown(value);
    if (numeric != null) return numeric;
  }
  return null;
}

export function deriveDialerEquitySnapshot(property: unknown): DialerEquitySnapshot {
  const record = recordFromUnknown(property);
  const ownerFlags = recordFromUnknown(record?.owner_flags);
  const prRaw = recordFromUnknown(ownerFlags?.pr_raw);

  const estimatedValue = firstNumber(
    record?.estimated_value,
    ownerFlags?.estimated_value,
    ownerFlags?.avm,
    prRaw?.AVM,
  );

  const equityPercent = firstNumber(
    record?.equity_percent,
    ownerFlags?.equity_percent,
    prRaw?.EquityPercent,
  );

  const totalLoanBalance = firstNumber(
    record?.total_loan_balance,
    ownerFlags?.total_loan_balance,
    prRaw?.TotalLoanBalance,
  );

  const explicitAvailableEquity = firstNumber(
    record?.available_equity,
    ownerFlags?.available_equity,
    prRaw?.AvailableEquity,
  );

  const computedAvailableEquity =
    explicitAvailableEquity != null
      ? explicitAvailableEquity
      : estimatedValue != null && totalLoanBalance != null
        ? Math.round(estimatedValue - totalLoanBalance)
        : null;

  return {
    availableEquity: computedAvailableEquity,
    equityPercent,
    totalLoanBalance,
  };
}

function formatCompactUsd(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    const compact = abs >= 10_000_000 ? Math.round(abs / 1_000_000) : Math.round((abs / 1_000_000) * 10) / 10;
    return `${sign}$${compact}M`;
  }

  if (abs >= 1_000) {
    const compact = abs >= 100_000 ? Math.round(abs / 1_000) : Math.round((abs / 1_000) * 10) / 10;
    return `${sign}$${compact}k`;
  }

  return `${sign}$${Math.round(abs)}`;
}

export function formatDialerEquityDisplay(property: unknown): DialerEquityDisplay {
  const snapshot = deriveDialerEquitySnapshot(property);

  const valueText =
    snapshot.availableEquity != null
      ? `${formatCompactUsd(snapshot.availableEquity)} equity`
      : snapshot.equityPercent != null
        ? `${Math.round(snapshot.equityPercent)}% equity`
        : null;

  const detailText =
    snapshot.availableEquity != null && snapshot.equityPercent != null
      ? `${Math.round(snapshot.equityPercent)}% equity`
      : null;

  return {
    valueText,
    detailText,
    combinedText: [valueText, detailText].filter(Boolean).join(" • ") || null,
  };
}

export function buildDialQueueEquityOwnerFlags(property: unknown): UnknownRecord | null {
  const record = recordFromUnknown(property);
  if (!record) return null;

  const ownerFlags = recordFromUnknown(record.owner_flags) ?? {};
  const snapshot = deriveDialerEquitySnapshot(record);
  const nextFlags: UnknownRecord = { ...ownerFlags };
  let changed = false;

  if (snapshot.totalLoanBalance != null && numberFromUnknown(ownerFlags.total_loan_balance) == null) {
    nextFlags.total_loan_balance = Math.round(snapshot.totalLoanBalance);
    changed = true;
  }

  if (snapshot.availableEquity != null && numberFromUnknown(ownerFlags.available_equity) == null) {
    nextFlags.available_equity = Math.round(snapshot.availableEquity);
    changed = true;
  }

  if (snapshot.equityPercent != null && numberFromUnknown(ownerFlags.equity_percent) == null) {
    nextFlags.equity_percent = snapshot.equityPercent;
    changed = true;
  }

  return changed ? nextFlags : null;
}
