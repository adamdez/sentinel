/**
 * Operator-safe regions: workflow surfaces that keep the default production
 * token stack under alternate theme packs.
 *
 * Implementation:
 * - `data-operator-safe` on a DOM ancestor (see OperatorSafeBoundary).
 * - CSS: `html[data-sentinel-theme="…"] [data-operator-safe] { …token resets }`
 *
 * Covered by layout:
 * - `/dialer/*` → `src/app/(sentinel)/dialer/layout.tsx`
 *
 * Ad-hoc (modal / embedded surfaces):
 * - Lead Detail → `MasterClientFileModal` root glass
 * - Any other page: `PageShell operatorSafe` or wrap with OperatorSafeBoundary
 */
export const OPERATOR_SAFE_ROUTE_PREFIXES = ["/dialer"] as const;
