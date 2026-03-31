# Repo Enablement Workflow

Use these commands when you want a predictable Sentinel dev environment.

## Core commands

- `npm run doctor`
  Checks `.env.local`, verifies the active Supabase target, validates the service role key, confirms critical dial queue columns exist, and reports optional schema drift.

- `npm run doctor:local`
  Same as `doctor`, but fails if `.env.local` is not pointed at local Supabase.

- `npm run doctor:remote`
  Same as `doctor`, but fails if `.env.local` is not pointed at the remote Supabase project.

- `npm run dev:local`
  Ensures local Supabase is running, switches `.env.local` to local Supabase values, runs doctor checks, then starts Next dev.

- `npm run dev:remote`
  Switches `.env.local` to canonical remote Supabase values, runs doctor checks, then starts Next dev.

- `npm run env:use:local-supabase`
  Only switches `.env.local` to local Supabase values.

- `npm run env:use:remote-supabase`
  Only switches `.env.local` to remote Supabase values.

## Smoke coverage

- `npm run test:smoke`
  Runs the existing Playwright smoke suite.

- `npm run test:smoke:dial-queue`
  Runs the focused smoke test for the bulk `Add to Dial Queue` flow.

## Notes

- The canonical remote Supabase values are read from `.env.vercel.production`, then `.env.vercel`, then `.env.local.remote.backup`.
- Remote `DATABASE_URL` is only updated when a real non-placeholder value is available.
- If `doctor` warns about missing optional lead/property columns, the app can still run, but those compatibility gaps are likely to trigger degraded fetch paths.
- If `doctor` warns about `ripgrep`, install a normal system `rg` so repo search works reliably in agent tooling.
