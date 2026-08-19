# Tailmap

Dog park finder: parks get a live match grade computed from the dogs currently checked in there, vs. the viewing dog's love/dislike preferences. Full spec: `specs.md`. Architecture: `architecture.md`.

## Stack
Next.js (App Router, TypeScript) on Vercel. Single Supabase project for Postgres + Auth + Storage. Prisma ORM. Google Places API (New) for park data. Tailwind, using the Organic design system tokens from `_ds/organic-8421d24a-301d-46e5-bce8-d4b57864b820/styles.css`.

## Core rules
- **No guest access** — every route requires auth (middleware-enforced). No "explore as guest."
- **Grades are derived, never stored** — computed server-side on read from active check-ins (`lib/grading.ts`). Don't cache or persist a grade.
- **Check-ins expire lazily** — filter `expiresAt > now()` at query time; no cron needed for correctness.
- **Places API results are cached** in the `Park` table (~24h TTL) — never call Places directly from the client; always through the server proxy route.
- **One active check-in per dog** at a time.
- All dog profiles are visible to everyone by default — no visibility/privacy setting in v1.

## Out of scope (v1) — do not build
Messaging, Notifications/activity feed, native mobile apps, payments, admin dashboard, GPS auto check-in, user-submitted parks, busy-time chart, profile visibility control.

## Before implementing
Check `specs.md` §11 and `architecture.md` §11 for open items before making a new design decision. Update those files if a decision changes.
