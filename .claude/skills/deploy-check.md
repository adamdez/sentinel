# /deploy-check — Pre-Deploy Verification

Run all checks before deploying to production. Catches TypeScript errors, broken imports, misconfigured crons, and environment variable issues before they hit Vercel.

## What to do

1. **TypeScript build check** — Run `npx tsc --noEmit`:
   - Fix any type errors
   - Fix any import resolution issues
   - Ensure no unused variables that break strict mode

2. **Verify cron schedules** — Read `vercel.json`:
   - All cron paths exist as API routes
   - All cron routes export a GET handler (Vercel crons call GET)
   - All cron routes have CRON_SECRET auth check
   - Schedules are reasonable (not too frequent, not overlapping)

3. **Check environment variables** — Cross-reference:
   - Every `process.env.X` in the codebase has a matching entry in CLAUDE.md
   - Critical vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, PROPERTYRADAR_API_KEY
   - Optional vars degrade gracefully: ATTOM_API_KEY, OPENCLAW_API_KEY, XAI_API_KEY

4. **Verify API route auth** — Check all routes in `src/app/api/`:
   - Public routes (none — all should be authed)
   - Cron routes use CRON_SECRET
   - User routes use Supabase auth
   - No routes accidentally exposed without auth

5. **Check for hardcoded values** — Search for:
   - Hardcoded URLs that should be env vars
   - Hardcoded API keys (security risk)
   - `localhost` references that should be relative URLs
   - Debug `console.log` statements that should be removed

6. **Verify maxDuration settings** — Long-running routes need:
   - `export const maxDuration = 300` for enrichment/deep-crawl routes
   - Standard routes should not exceed default 10s timeout
   - Check that no route has infinite loops or unbounded iteration

7. **Git status** — Check for:
   - Uncommitted changes
   - Files that should be in .gitignore (node_modules, .env, etc.)
   - Large files accidentally staged

8. **Report** — Produce:
   ```
   DEPLOY CHECK — [date]

   TypeScript:    PASS/FAIL (X errors)
   Cron routes:   PASS/FAIL (X issues)
   Env vars:      PASS/FAIL (X missing)
   Auth check:    PASS/FAIL (X unprotected routes)
   Hardcodes:     PASS/FAIL (X found)
   Git status:    CLEAN/DIRTY (X uncommitted files)

   VERDICT: SAFE TO DEPLOY / ISSUES FOUND
   ```
