# Sentinel typography (operator scale)

## Principles

- **No micro-type abuse** — functional UI should not rely on 8–10px absolute sizes.
- **Semantic scale** — prefer `text-xs`, `text-sm`, `text-base` (rem-based) over `text-[Npx]`.
- **Root** — `html { font-size: 19px; }` in `globals.css` so `rem` utilities read slightly larger for operators.
- **Theme tokens** — `@theme inline` overrides `--text-xs` and `--text-sm` with slightly larger minimums and line-heights than Tailwind defaults.

## Scale (approximate @ 19px root)

| Utility    | Typical use              |
|-----------|---------------------------|
| `text-xs` | Eyebrows, badges, dense meta (minimum functional) |
| `text-sm` | Secondary body, table cells, form hints |
| `text-base` | Primary body, nav emphasis |
| `text-lg`+ | Section titles, KPIs |

## Maintenance

- `scripts/bump-micro-typography.mjs` — maps `text-[8px]`–`text-[12px]` to `text-xs` / `text-sm`. Re-run if new arbitrary px sizes appear.
- **Do not** reintroduce `text-[7px]` or smaller; use `text-xs` + padding adjustments.

## Components

- **Badge** — `text-xs` with `px-3 py-1` for legible chips.
- **Button `size="sm"`** — `text-sm`, `h-9` (was `text-xs` / `h-8`).
- **Tooltip** — `text-sm`, theme `popover` colors.

## Second-pass candidates

- Dense **tables** (`lead-table`, `ads`) — if rows still feel tight, increase row padding before shrinking type.
- **`tracking-widest`** on uppercase — prefer `tracking-wide` where labels felt cramped (applied in a few shells; grep if needed).
