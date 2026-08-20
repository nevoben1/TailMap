# Tailmap — Implementation Roadmap (v1)

Build order derived from dependency chain in `architecture.md` §8 (route/folder structure). No code exists yet — repo has `specs.md` + `architecture.md` only. All design decisions locked except minor tuning items (specs.md §11, architecture.md §11).

## Phase 0 — Scaffold
- Next.js App Router + TypeScript init, Tailwind + Organic design tokens wire-in (`_ds/organic-8421d24a-301d-46e5-bce8-d4b57864b820/styles.css`)
- Prisma schema (architecture.md §3) + Supabase project connect + `prisma migrate`
- Supabase Auth wire-up + `middleware.ts` (no-guest-access rule — CLAUDE.md core rule)

## Phase 1 — Dogs
- Dog model CRUD (`lib/actions/dogs.ts`)
- Profile UI, breed search, trait chip cycling (neutral → love → dislike → neutral, specs.md §8)

## Phase 2 — Parks + Places
- `api/places/nearby` + `api/places/photo/[ref]` proxy routes (server-only, never call Places from client — CLAUDE.md)
- `lib/places.ts` cache-upsert logic (Park table, ~24h TTL)
- Map screen

## Phase 3 — Check-ins + Grading
- `lib/actions/checkins.ts` — enforce one active check-in per dog (CLAUDE.md core rule)
- `lib/grading.ts` — scoring function per specs.md §5, computed live on read, never persisted (CLAUDE.md core rule), unit-tested
- Park detail popover: "who's here now" list + per-dog reasons

## Phase 4 — Session / Settings / Favorites
- Active session screen
- Settings screen
- Favorites action

## Phase 5 — Polish / Launch
- Run full verification checklist (specs.md §12)
- Rate-limiting/abuse protection on Places proxy route (architecture.md §11.3)
- Decide: Vercel Cron cleanup for expired check-ins vs. stay lazy-only (architecture.md §11.2) — lazy expiry filter (`expiresAt > now()`) already correct-by-default per CLAUDE.md, this is a scale decision only
- Revisit grading scaling factor / reason-string generation against real check-in data (specs.md §11.1)

## Explicitly out of scope for this roadmap (v1)
Messaging, notifications/activity feed, native mobile apps, payments, admin dashboard, GPS auto check-in, user-submitted parks, busy-time chart, profile visibility control — per CLAUDE.md / specs.md §7.
