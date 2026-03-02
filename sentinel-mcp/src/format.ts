/**
 * Formatting utilities for MCP tool responses.
 * Converts query results into readable markdown tables.
 */

export function formatTable(rows: Record<string, unknown>[], maxRows = 50): string {
  if (rows.length === 0) return "No results found.";

  const displayRows = rows.slice(0, maxRows);
  const keys = Object.keys(displayRows[0]);

  const header = "| " + keys.join(" | ") + " |";
  const separator = "| " + keys.map(() => "---").join(" | ") + " |";

  const body = displayRows.map((row) => {
    return "| " + keys.map((k) => formatCell(row[k])).join(" | ") + " |";
  });

  let result = [header, separator, ...body].join("\n");

  if (rows.length > maxRows) {
    result += `\n\n_Showing ${maxRows} of ${rows.length} total rows._`;
  }

  return result;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 19);
  if (typeof value === "number") {
    if (Number.isInteger(value) && Math.abs(value) >= 10000) {
      return value.toLocaleString();
    }
    if (!Number.isInteger(value)) return value.toFixed(2);
    return String(value);
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    return json.length > 60 ? json.slice(0, 57) + "..." : json;
  }
  const str = String(value);
  return str.length > 80 ? str.slice(0, 77) + "..." : str;
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return `$${amount.toLocaleString()}`;
}

export function formatKV(pairs: [string, unknown][]): string {
  return pairs.map(([k, v]) => `**${k}:** ${formatCell(v)}`).join("\n");
}
