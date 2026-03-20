# Theme system — Phase 2 plan & status

## Goals (this phase)

| Goal | Status |
|------|--------|
| Reduce hardcoded `border-white/*`, `text-cyan`, raw RGBA in high-traffic Sentinel components | **Partial** — `lead-filters`, `numeric-input`, `glass-card`, `badge` refactored; large debt remains (see below). |
| Move glass / shell chrome to semantic **shell tokens** | **Done** — `--shell-*`, modal/backdrop tokens; enterprise rules use `var()`. |
| Shrink theme-pack CSS override sprawl | **Done** — `ghost-mode.css` is almost entirely variable blocks + gradient + decoration kills + operator-safe mirror. |
| Centralize operator-safe protection | **Done** — `OperatorSafeBoundary` + `dialer/layout.tsx` + policy file; `PageShell operatorSafe` for ad-hoc pages. |
| Prepare for motif / seasonal packs | **Documented** — see “Rich themes” below. |

## Architecture changes (Phase 2)

### 1. Shell token layer (`:root` + theme packs)

New variables in `src/app/globals.css` (production `:root`):

- **Hairlines / inset panels:** `--border-hairline`, `--border-hairline-hover`, `--surface-inset`, `--surface-inset-mid`
- **Chrome:** `--shell-glass-border`, `--shell-glass-shadow-drop`, `--shell-glass-inset-top`, `--shell-glass-specular-line`, `--shell-glass-after-fade`, `--shell-glass-surface-{default,strong,card,ultra}`
- **Sidebar / topbar / nav active:** `--shell-sidebar-*`, `--shell-topbar-*`, `--shell-nav-active-*`
- **Modal / backdrop:** `--shell-modal-bg`, `--shell-backdrop-bg`
- **Badge glow (token-driven):** `--shadow-badge-glow`, `--shadow-badge-glow-tight`

Enterprise **glass / sidebar / topbar / modal** rules now reference these variables. **Ghost Mode** overrides the same variables in one `html[data-sentinel-theme="ghost-mode"]` block instead of re-declaring `.glass`, `.sidebar-glass`, etc.

### 2. Tailwind bridge

`@theme inline` exposes:

- `--color-border-hairline`, `--color-border-hairline-hover`
- `--color-surface-inset`, `--color-surface-inset-mid`

So utilities like `border-border-hairline`, `bg-surface-inset-mid` track tokens.

### 3. Helper patterns (`src/lib/sentinel-ui.ts`)

- **`filterChip.active` / `filterChip.idle`** — filter toggles; use `cn(filterChip.active)` / `cn(filterChip.idle)` inside existing `border rounded-md` buttons.
- **`sentinelInput`** — shared class string for dense numeric / mono inputs.

**Convention:** Add new cross-cutting UI strings here when the same 3+ line pattern appears in multiple Sentinel components.

### 4. Operator-safe (architectural)

- **`OperatorSafeBoundary`** — sets `data-operator-safe` on a wrapper.
- **`src/app/(sentinel)/dialer/layout.tsx`** — wraps all `/dialer/*` children (replaces per-page `PageShell operatorSafe`).
- **`src/themes/operator-safe-policy.ts`** — documents coverage and extension rules.
- **Ghost CSS** — `[data-operator-safe]` resets **both** semantic tokens and **all** `--shell-*` variables to production values (no per-class overrides inside operator-safe).

**Lead Detail** remains protected via `data-operator-safe` on the modal glass root in `master-client-file-modal.tsx`.

### 5. Suggested next refactors (not done in Phase 2)

- **`(sentinel)/pipeline/layout.tsx`** with `OperatorSafeBoundary` if the whole pipeline workspace should stay neutral under loud themes.
- **Migrate `eval-ratings-panel`, `live-assist-panel`, `buyer-search-modal`, dashboard widgets** to `filterChip` / `sentinelInput` / `border-border-hairline` patterns.
- **Retire early `globals.css` blocks** (pre-enterprise cosmic `.glass` with hardcoded cyan) if unused, or point them at `--shell-*` for storybook-only builds.

---

## Worst remaining hardcoded styling debt (prioritized)

1. **`master-client-file-modal.tsx`** — thousands of lines with `border-white/[0.06]`, `text-cyan`, inline `style={{ textShadow: … }}`, stage-specific colors. Highest ROI for incremental token migration.
2. **Dialer `page.tsx`** — KPI meta `glow` RGBA strings, many `text-cyan` / emerald utility chains.
3. **Dashboard widgets** (`quick-dial`, `missed-inbound-queue`, `funnel-value`, `widget-library`) — repeated inset borders and cyan accents.
4. **`eval-ratings-panel.tsx`, `live-assist-panel.tsx`, `seller-memory-panel.tsx`** — dense `border-white/*` + `bg-white/*` panels.
5. **Early `globals.css` cosmic system** (keyframes, `.neon-glow`, legacy `.modal-glass` block ~L900) — still contains raw RGBA; enterprise `!important` block overrides most runtime paths, but the file is a liability for new contributors.
6. **Leaflet / map overrides** — hardcoded `#00e5ff` etc. at bottom of `globals.css`.
7. **Framer / ad-hoc motion** — not color debt, but seasonal themes may want `prefers-reduced-motion` gates later.

---

## Rich themes (Psalm 20, St. Patrick’s, etc.) — what Phase 2 enables

**Without** excessive per-selector CSS:

1. **Semantic + shell variables** — A seasonal pack is mostly one `html[data-sentinel-theme="st-patricks"] { … }` block adjusting `--primary`, `--accent`, `--shell-glass-border`, `--shadow-badge-glow`, optional `--background` gradient vars if you introduce `--shell-app-gradient-start/end`.
2. **Motif components** — Register optional React **theme fragments** (e.g. `ThemePackStPatricksHeader`) loaded from `src/themes/packs/st-patricks/BrandingStrip.tsx` and rendered from a single `ThemeChrome` slot in `sentinel` layout **outside** `[data-operator-safe]`. Keep motifs out of Lead Detail.
3. **Quotes / copy** — Store in `registry.ts` metadata (`tagline`, `footerQuote`) or a small JSON locale next to the pack; render in shell-only components.
4. **Icon treatments** — Prefer Lucide + `text-primary` or CSS `color: var(--primary)` on a wrapper class `.theme-pack-icon-tint` defined in the pack CSS file.
5. **Operator-safe** — Any new “loud” pack must extend the `[data-operator-safe]` mirror in CSS (or generate it from a shared `:root` export in the future) so workflow surfaces never drift.

**What you should avoid:** Copy-pasting 200 lines of `.glass` / `.sidebar-glass` overrides per theme — that pattern is intentionally retired in favor of `--shell-*`.

---

## Files changed (Phase 2 summary)

- `src/app/globals.css` — shell + hairline + modal tokens; enterprise glass/sidebar/topbar/modal use `var()`.
- `src/app/themes/ghost-mode.css` — rewritten token-first.
- `src/app/(sentinel)/dialer/layout.tsx` — **new** layout boundary.
- `src/components/theme/operator-safe-boundary.tsx` — **new**.
- `src/lib/sentinel-ui.ts` — **new** helpers.
- `src/themes/operator-safe-policy.ts` — **new** documentation.
- `src/components/sentinel/glass-card.tsx`, `numeric-input.tsx`, `leads/lead-filters.tsx`
- `src/components/ui/badge.tsx`
- `src/components/sentinel/page-shell.tsx` — doc comment only.
- `src/app/(sentinel)/dialer/**` pages — removed redundant `operatorSafe`.
- `src/themes/README.md`, `docs/THEME-PHASE2-PLAN.md` (this file)

---

## Refactor plan (ongoing checklist)

1. **Batch 1 (done):** Shell tokens, Ghost slimming, dialer layout, filters, numeric input, badges, glass-card hover.
2. **Batch 2:** Pipeline layout operator-safe (optional); `buyer-search-modal` + eval panels → `sentinel-ui` patterns.
3. **Batch 3:** Master Client File — replace top 20 most common border/text utilities with tokens; remove inline text-shadow in favor of utility class or `--shell-*` if needed.
4. **Batch 4:** Dialer KPI cards — move `glow` metadata to CSS variables or theme pack overrides.
5. **Batch 5:** Prune or tokenize legacy cosmic `globals.css` sections.
