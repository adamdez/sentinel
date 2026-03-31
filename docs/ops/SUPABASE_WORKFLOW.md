# Supabase Workflow

Run Supabase commands through the repo scripts, not from the app root with raw CLI commands.

Why:
- the app root has product env files that are meant for Next.js, not for the Supabase CLI
- the wrapper always runs the CLI from [`supabase`](C:/Users/adamd/Desktop/Sentinel/supabase)
- the wrapper defaults to the Sentinel project ref: `imusghlptroddfeycpei`

## First-time setup

You only need one of these:

1. Run `npx supabase login`
2. Or export `SUPABASE_ACCESS_TOKEN` in your shell

Then link the repo once:

```bash
npm run db:link
```

## Day-to-day commands

List remote/local migration state:

```bash
npm run db:migration:list
```

Start local Supabase with Docker:

```bash
npm run db:start
```

Check local service URLs and keys:

```bash
npm run db:status
```

Stop the local stack:

```bash
npm run db:stop
```

Reset the local database and replay migrations + seed:

```bash
npm run db:reset
```

Seed local Sentinel login users after start/reset:

```bash
npm run db:seed:auth
```

Point the app at local Supabase:

```bash
npm run env:use:local-supabase
```

Restore your prior remote Supabase values:

```bash
npm run env:use:remote-supabase
```

Apply pending migrations to the linked project:

```bash
npm run db:push
```

`db:push` uses the Supabase Management API instead of the raw Postgres CLI path, so it does not depend on Docker or the remote database password on this machine.

## Local development

The active baseline migration at [20260331010702_20260330_remote_baseline.sql](C:/Users/adamd/Desktop/Sentinel/supabase/migrations/20260331010702_20260330_remote_baseline.sql) now contains a full schema bootstrap taken from the live public schema on 2026-03-31. That means:

- fresh local Supabase can build from scratch
- later active migrations still replay cleanly
- the remote project is unaffected because it already has this migration version recorded

### Recommended local bootstrap

From the repo root:

```bash
npm run db:start
npm run db:seed:auth
npm run env:use:local-supabase
```

The seeded local login users are:

- `adam@dominionhomedeals.com`
- `logan@dominionhomedeals.com`
- `nathan@dominionhomedeals.com`

Shared local password:

```text
SentinelLocal!2026
```

After those commands, restart `npm run dev` and sign in with one of the seeded local users.

When switching the app to local Supabase, the env switch script updates only the Supabase-related variables in `.env.local` and stores the prior remote values in `.env.local.remote.backup` for restoration.

Current local defaults:

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

The included [seed.sql](C:/Users/adamd/Desktop/Sentinel/supabase/seed.sql) now creates a deterministic local demo inbox:

- 4 properties
- 4 contacts
- 4 leads across `lead`, `negotiation`, and `disposition`
- 1 call log row for callback history

`npm run db:seed:auth` then creates matching local auth users and assigns sample leads to Adam and Logan so the inbox is useful immediately after login.

Generate updated Supabase types:

```bash
npm run db:gen-types
```

## Active migration rules

- Active migrations in [`supabase/migrations`](C:/Users/adamd/Desktop/Sentinel/supabase/migrations) must use a unique 14-digit timestamp prefix, for example `20260331010702_remote_baseline.sql`.
- Legacy pre-rebaseline migrations live in [`supabase/migrations_legacy/20260330_pre_rebaseline`](C:/Users/adamd/Desktop/Sentinel/supabase/migrations_legacy/20260330_pre_rebaseline) for reference only.
- The wrapper now validates migration filenames before any `db:*` command runs so date-only prefixes cannot silently drift the history again.

## Jeff-specific note

The Jeff handoff/callback flow depends on:

- [`20260330_jeff_outbound_system.sql`](C:/Users/adamd/Desktop/Sentinel/supabase/migrations/20260330_jeff_outbound_system.sql)
- [`20260330_jeff_interactions.sql`](C:/Users/adamd/Desktop/Sentinel/supabase/migrations/20260330_jeff_interactions.sql)

If Jeff UI changes are shipped before these migrations are applied, the app code can build but the database-backed Jeff follow-up flow will not be fully live.

## Mechanical guardrails

- Do not paste raw HTTP examples into `.env.local` as bare lines.
- Keep non-env examples commented out.
- Prefer `npm run db:*` scripts over `npx supabase ...` from repo root.
- Make schema changes through migrations first, then verify them locally with `npm run db:reset` before pushing remote.
- After `npm run db:reset`, rerun `npm run db:seed:auth` because auth users live outside SQL seed data.
