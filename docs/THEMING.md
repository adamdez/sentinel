# Sentinel UI theming

Operator-facing documentation for theme packs lives in [`src/themes/README.md`](../src/themes/README.md).

**Quick facts**

- Default production look is unchanged (`data-sentinel-theme="default"`).
- **Ghost Mode** is `data-sentinel-theme="ghost-mode"` — colder shell via `--shell-*` tokens; Lead Detail and `/dialer/*` use `[data-operator-safe]` for a full production token mirror (see `docs/THEME-PHASE2-PLAN.md`).
- Selection persists in `localStorage` (`sentinel-theme`) and is applied before paint via a `beforeInteractive` script to limit flash.
