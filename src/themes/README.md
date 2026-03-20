# Sentinel theming

## Architecture

1. **Semantic tokens** — `src/app/globals.css` defines `:root` CSS variables (`--background`, `--primary`, …) and maps them into Tailwind v4 via `@theme inline`.
2. **Theme packs** — Alternate looks override those variables on `html[data-sentinel-theme="<id>"]`. The first pack is `ghost-mode` in `src/app/themes/ghost-mode.css`.
3. **Registry** — `registry.ts` lists theme metadata (labels, copy). `types.ts` is the allow-list of ids.
4. **Persistence** — `ThemeProvider` stores the selected id in `localStorage` under `sentinel-theme`. A small inline script in `layout.tsx` sets `data-sentinel-theme` before paint to avoid a flash.
5. **Operator-safe surfaces** — Critical workflows opt in with `data-operator-safe`. Under Ghost Mode, `[data-operator-safe]` resets **semantic + `--shell-*` tokens** to production defaults (see `ghost-mode.css`).

### Phase 2 — shell tokens & layout boundaries

- **`--shell-*` variables** in `:root` drive `.glass`, `.sidebar-glass`, `.topbar-glass`, `.modal-glass`, etc. Theme packs override variables instead of duplicating dozens of class rules.
- **Hairline / inset** — `--border-hairline`, `--border-hairline-hover`, `--surface-inset`, `--surface-inset-mid` + Tailwind colors `border-border-hairline`, `bg-surface-inset-mid`, …
- **`OperatorSafeBoundary`** — `src/components/theme/operator-safe-boundary.tsx`. **`/dialer/*`** is wrapped in `src/app/(sentinel)/dialer/layout.tsx` so individual dialer pages stay clean.
- **Component helpers** — `src/lib/sentinel-ui.ts` (`filterChip`, `sentinelInput`) for repeated chip/input patterns.
- **Policy doc** — `src/themes/operator-safe-policy.ts` lists which routes are protected and how to extend.

Full plan + remaining debt: `docs/THEME-PHASE2-PLAN.md`.

## Adding a seasonal theme

1. Add `SentinelThemeId` in `types.ts` (e.g. `"st-patricks"`).
2. Add an entry to `SENTINEL_THEMES` in `registry.ts`.
3. Create `src/app/themes/st-patricks.css` (or one combined pack file) with:

   ```css
   html[data-sentinel-theme="st-patricks"] {
     --primary: #…;
     /* … */
   }
   ```

4. Import that file from `src/app/layout.tsx` after `globals.css`.
5. Prefer shell-only changes; use `[data-operator-safe]` overrides if workflow UI must stay neutral.

## Tailwind

Prefer existing semantic classes (`bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-primary`, …). Avoid new hardcoded hex in components when a token exists.
