# /fix-ui — Debug and Fix Broken UI Components

Diagnose and fix broken UI elements in the Sentinel ERP. Use the preview server to verify fixes visually. This covers tabs that don't load, components that show empty, API routes that return errors, etc.

## Arguments
The user will describe what's broken (e.g., "comps tab isn't working", "ARV shows nothing", "prospect detail page crashes").

## What to do

1. **Identify the component** — Find the relevant source file:
   - Use Glob/Grep to find the component by name or route
   - Common locations: `src/app/(sentinel)/` for pages, `src/components/sentinel/` for components
   - Check route handlers in `src/app/api/` for data-fetching endpoints

2. **Read the component code** — Understand:
   - What data does it fetch? (API route, Supabase query, etc.)
   - What props does it expect?
   - What state does it manage?
   - What loading/error states does it handle?

3. **Trace the data flow** — Follow the chain:
   - Component → API route → Database query → Response
   - Check each step for errors, missing data, wrong field names

4. **Use preview tools to diagnose** — With the dev server running:
   - `preview_snapshot` — Check if the component renders at all
   - `preview_console_logs` — Check for JavaScript errors
   - `preview_network` — Check if API calls succeed/fail
   - `preview_inspect` — Check CSS/styling issues
   - `preview_eval` — Debug specific values in the browser

5. **Fix the issue** — Edit the source files:
   - Fix API routes that return wrong data shape
   - Fix components that reference wrong field names
   - Fix queries that filter too aggressively
   - Fix missing null checks that cause crashes
   - Fix loading states that never resolve

6. **Verify the fix** — Using preview tools:
   - Reload the page
   - Check the component renders correctly
   - Verify data is displayed
   - Take a screenshot to confirm
   - Check console for any remaining errors

7. **Run TypeScript check** — `npx tsc --noEmit` to ensure no type errors

## Common issues in Sentinel
- API routes that query Supabase but the table schema has changed
- Components referencing `owner_flags.pr_raw.FieldName` where PR field names changed
- Tabs that need property_id but the parent doesn't pass it
- Comp/ARV calculations that depend on county-data.ts but the property's county isn't supported
- Charts/graphs that expect data in a format the API doesn't return
