# Local UX Access

Use this when you want deterministic local access to the real CRM UX for review, screenshots, or browser automation.

## One-command setup

```bash
npm run ux:access:local
```

What it does:

- ensures the seeded local auth users exist
- aligns demo lead ownership with those users
- verifies the stable demo leads are present
- prints the login URL, shared password, and the exact demo leads to inspect

If the local database needs a full rebuild first:

```bash
npm run ux:access:reset
```

That command resets the local Supabase database, reloads `supabase/seed.sql`, reseeds auth users, and re-verifies the demo leads.

## Login

- URL: `http://localhost:3000/login`
- Shared demo password: `Dominion2026!`

Seeded users:

- `adam@dominionhomedeals.com`
- `logan@dominionhomedeals.com`
- `nathan@dominionhomedeals.com`

## Stable demo leads

- `11111111-1111-1111-1111-111111111111` — overdue callback
- `22222222-2222-2222-2222-222222222222` — fresh untouched lead
- `33333333-3333-3333-3333-333333333333` — negotiation sample
- `44444444-4444-4444-4444-444444444444` — disposition sample

Recommended UX review flow:

1. Sign in as Adam.
2. Open `/leads`.
3. Inspect the overdue callback and untouched lead in My Leads.
4. Open each client file and compare “what should I do next?” clarity against the list view.
5. Open the negotiation and disposition samples to validate stage confidence and downstream workflow clarity.
