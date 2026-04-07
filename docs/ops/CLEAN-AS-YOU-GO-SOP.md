# Sentinel Clean-As-You-Go SOP

## Purpose

Keep Sentinel from drifting into AI slop by cleaning it during normal product work instead of waiting for a giant rewrite or cleanup sprint.

This is the standing operating rule for Sentinel maintenance.

It is based on:
- [2026-04-02-dead-code-audit](C:\Users\adamd\Desktop\Sentinel\docs\plans\2026-04-02-dead-code-audit.md)
- the working decision that Sentinel should be hardened incrementally around real operator workflows

## Core Rule

Whenever you touch a Sentinel area for real business work:
- fix the bug or ship the feature
- clean the nearby code if the cleanup is low-risk
- delete dead or misleading code when you can prove it is unused
- do not rewrite working paths just because they look ugly

The goal is steady reduction of waste, not cosmetic churn.

## What Counts As Worth Cleaning

Clean it now if it is one of these:
- dead component, hook, lib, or route with no live imports/calls
- stale placeholder logic that makes the UI misleading
- duplicate code in the exact area being changed
- temporary statuses that never resolve and create data rot
- old branches of logic that can no longer be reached
- fake fallback values that hide missing data instead of exposing it honestly

Leave it alone for now if it is:
- ugly but working and outside the current task
- risky structural work that needs a dedicated pass
- another domain's live code path that has not been verified
- a possible dead route that still needs Vercel log verification

## Priority Order

When there is cleanup to do, use this order:
1. Delete dead components.
2. Delete dead lib files and dead hooks.
3. Fix data rot and silent-failure patterns.
4. Verify questionable API routes against production usage.
5. Delete dead routes.
6. Consolidate single-use or duplicate UI only when it helps the active task.

## Operator Checklist

Before closing any meaningful Sentinel task, quickly ask:
1. Did I leave the touched area clearer than I found it?
2. Did I remove any code that was provably dead?
3. Did I fix any nearby silent-failure or stale-status behavior?
4. Did I avoid rewriting a path that already works?
5. If I found bigger cleanup debt, did I document it somewhere visible?

## Safe Proof Standards

Before deleting something, prove it with one of these:
- no imports in repo search
- no UI entrypoint or nav path
- no API caller in app code
- no production hits in Vercel logs for a meaningful period
- explicit superseded replacement already live

If proof is weak, mark it for audit instead of deleting it.

## What Not To Do

Do not:
- start large rewrites in the name of cleanliness
- replace proven logic just because AI wrote it originally
- keep dead code around "just in case"
- hide missing data behind fake values that make operators think a file is healthy
- mix unrelated cleanup into risky production fixes without clear boundaries

## Standing Sentinel Standard

Sentinel should trend toward:
- fewer files
- fewer dead routes
- fewer fake states
- fewer silent failures
- more honest UI
- more durable write paths

If a task makes the product work and also removes nearby waste, that is the preferred path.
