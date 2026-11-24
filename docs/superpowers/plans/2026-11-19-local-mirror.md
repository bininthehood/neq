# Local mirror and bounded online serving implementation plan

**Goal:** Run TMDB collection locally while keeping the online mirror bounded, cached, and safe to operate without a paid database subscription.

**Architecture:** A local Supabase/Postgres stack owns the full crawl queue and refreshed metadata. A synchronization command publishes a selected, size-limited serving set to the online mirror after a read-only preview. Public read endpoints can use short CDN caching; personalized recommendations remain uncached and receive a shared daily request budget.

**Tech Stack:** TypeScript, Supabase JS, Postgres/pgvector, Next.js 16, Vitest and script self-checks.

**Spec:** `docs/ops-audits/2026-11-19-recovery-plan.md`

## Constraints

- Do not enable GitHub schedules, apply production migrations, delete online rows, or deploy without confirming the actual production targets.
- Keep service-role credentials server-side and out of logs.
- A local development stack must stay on loopback and must not be exposed publicly.
- Existing untracked audit files and local commits remain intact.

## Tasks

1. [x] Make the DB guard fail closed and verify missing RPC, malformed responses, and 420/460MB boundaries with a script self-check.
2. [x] Require an explicit paired local/hosted batch target for TMDB writers; reject partial credentials and non-loopback URLs in local mode.
3. [x] Provide a reproducible local mirror startup and import runbook; verify the local stack starts and applies the necessary schema without touching production.
4. [ ] Add a read-only online serving-set preview and a separate explicit apply mode with bounded writes and post-write size checks. Preview completed: 30,000 selected, all 25,924 provider works retained, zero missing, 83,666 removable in the source DB. Apply mode and online compaction remain pending Production target verification, refreshed provider coverage, and an explicit online embedding budget. Row count alone is insufficient because 25,936 vectors remain in the selected set.
5. [x] Add short public CDN caching to stable shared TMDB endpoints, with route tests preventing error responses from being cached. Personalized recommendation caching is unchanged.
6. [x] Add a shared daily recommendation request budget using the existing Redis integration, with fail-safe behavior and tests. Document how to configure its limit.
7. [x] Run focused tests, type checks, and review the diff. Leave schedules and production state unchanged.
