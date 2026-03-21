# Sentinel theming

## Architecture

1. **Semantic tokens** — `src/app/globals.css` defines CSS variables (`--background`, `--primary`, …) and maps them into Tailwind via `@theme inline`.
2. **Theme packs** — **Light** and **Dark** override those variables on `html[data-sentinel-theme="light"]` and `html[data-sentinel-theme="dark"]`. Both are **monochrome** (black / white / gray translucency only).
3. **Registry** — `registry.ts` lists theme metadata (labels: **Light**, **Dark**). `types.ts` is the allow-list of ids (`"light" | "dark"`).
4. **Persistence** — `ThemeProvider` stores the selected id in `localStorage` under `sentinel-theme`. Legacy values `default` and `ghost-mode` migrate to **`dark`**. A small inline script in `layout.tsx` sets `data-sentinel-theme` and toggles the `dark` class on `<html>` before paint to reduce flash.
5. **Tailwind `dark:`** — When the theme is **Dark**, `document.documentElement` has class `dark`. **Light** removes it.

### Shell tokens & layout boundaries

- **`--shell-*` variables** drive `.glass`, `.sidebar-glass`, `.topbar-glass`, `.modal-glass`, etc. Theme blocks override variables instead of duplicating dozens of class rules.
- **Hairline / inset** — `--border-hairline`, `--surface-inset`, … + Tailwind semantic colors.
- **`OperatorSafeBoundary`** — `src/components/theme/operator-safe-boundary.tsx`. Critical routes can opt in with `data-operator-safe` for stable token scope (see `operator-safe-policy.ts`).

## Adding a theme variant

1. Extend `SentinelThemeId` in `types.ts` (only if product needs a third pack).
2. Add an entry to `SENTINEL_THEMES` in `registry.ts`.
3. Add a matching `html[data-sentinel-theme="<id>"] { … }` block in `globals.css` with **grayscale-only** semantic + `--shell-*` values.

## Tailwind

Prefer semantic classes (`bg-background`, `text-foreground`, `border-border`, `bg-card`, …). Avoid chroma in components when a token exists.

## Maintenance scripts (repo root)

- `node scripts/tokenize-colors.mjs` — maps `text-cyan` / Tailwind palette utilities (`text-emerald-*`, `text-blue-*`, …) to semantic tokens (`text-primary`, `text-foreground`, `bg-muted`, `border-border`, …).
- `node scripts/neutralize-inline-rgba.mjs` — strips chroma from inline `rgba(...)` in `.ts`/`.tsx`.
- `node scripts/replace-neon-token.mjs` — maps `text-neon` / `border-neon` / `bg-neon` to `primary` token utilities.

**Rule:** Anything visible should resolve through CSS variables on `html[data-sentinel-theme="light"|"dark"]` — no fixed `#hex` or RGBA hues for UI chrome. (Brand SVGs may use `currentColor`; map tiles may use fixed grays for contrast on imagery.)
