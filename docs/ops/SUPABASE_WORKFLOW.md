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

Generate updated Supabase types:

```bash
npm run db:gen-types
```

## Jeff-specific note

The Jeff handoff/callback flow depends on:

- [`20260330_jeff_outbound_system.sql`](C:/Users/adamd/Desktop/Sentinel/supabase/migrations/20260330_jeff_outbound_system.sql)
- [`20260330_jeff_interactions.sql`](C:/Users/adamd/Desktop/Sentinel/supabase/migrations/20260330_jeff_interactions.sql)

If Jeff UI changes are shipped before these migrations are applied, the app code can build but the database-backed Jeff follow-up flow will not be fully live.

## Mechanical guardrails

- Do not paste raw HTTP examples into `.env.local` as bare lines.
- Keep non-env examples commented out.
- Prefer `npm run db:*` scripts over `npx supabase ...` from repo root.
