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

Apply pending migrations to the linked project:

```bash
npm run db:push
```

`db:push` uses the Supabase Management API instead of the raw Postgres CLI path, so it does not depend on Docker or the remote database password on this machine.

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
