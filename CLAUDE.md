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
Notifications/activity feed, native mobile apps, payments, admin dashboard, GPS auto check-in, user-submitted parks, busy-time chart, profile visibility control.

**1:1 chat** was v1 out-of-scope, now planned as **v1.2** — see `specs.md` §15 and `architecture.md` §14. Still not built; don't start it unless the task asks for chat. Note it introduces the project's first Postgres RLS (chat tables only) and its first email dependency (Resend).

## Before implementing
Check `specs.md` §11 and `architecture.md` §11 for open items before making a new design decision. Update those files if a decision changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
