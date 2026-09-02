# Tailmap

A dog park finder that answers a question a map alone can't: **is this park good for _my_ dog, right now?**

Every park gets a live **match grade** computed from the dogs currently checked in there, judged against the preferences of whichever dog you're viewing as. A park full of large high-energy huskies is a great grade for one dog and a bad one for another — the same park, at the same moment, grades differently per viewer.

The full product spec is in [`specs.md`](specs.md); the technical design is in [`architecture.md`](architecture.md).

---

## Quick start for a reviewer

1. **Sign up** — email/password or "Continue with Google". Every route requires an account; there is no guest mode by design (`proxy.ts` redirects anything unauthenticated to `/login`).
2. **Allow location when asked.** This is the one thing the app can't work around — see below.
3. **Create a dog**, then mark traits you love / dislike (breed, size, color, age, energy, gender).
4. **Open the map.** Parks near you are listed with a grade, distance, and who's there now.
5. **Check in** at a park to appear to other users, and **message an owner** from a park's "who's here now" list.

---

## Location access — why it matters and how it's handled

Tailmap's core value is _nearby_ and _now_. Without coordinates there is no park list, no distance, and no grade, so a missed permission prompt is the difference between a working app and an empty screen. Browsers make this easy to get wrong: the prompt is small, easy to dismiss by accident, and Chrome silently **blocks the origin after repeated dismissals** — meaning a user who waves the dialog away twice may never see it again.

So the app does **not** fire the browser prompt on page load. Instead ([`app/(app)/map/use-geolocation.ts`](app/(app)/map/use-geolocation.ts)):

- **The prompt is gesture-gated.** On load the app queries `navigator.permissions` instead of asking for a position. If permission is already granted, coordinates are fetched silently. If not, the map shows an in-app card explaining why location is needed, and the browser dialog is only raised when you press **Enable location** — right after a click you made, so it can't be missed or mistaken for a stray popup. If the Permissions API isn't available (older Safari), the gate stays in place rather than falling back to an unrequested dialog.
- **A dismissed prompt is distinguished from a real block.** Browsers report both as `PERMISSION_DENIED`. The app re-reads the permission state: still `prompt` means the dialog was closed without an answer, so the button comes back with "the prompt closed without an answer" instead of a dead error. An actual block gets recovery instructions for the address-bar permission icon.
- **Every failure mode has its own message and a retry** — timeout, no position fix, no geolocation support, and a non-HTTPS origin (browsers refuse location outside a secure context) are all reported distinctly rather than collapsed into "denied".
- **Granting later just works.** The app subscribes to permission changes, so flipping location on in browser settings fills the map in immediately — no reload.

The UI for all of this lives in [`app/(app)/map/location-gate.tsx`](app/(app)/map/location-gate.tsx) and appears in both the browse and map views.

## No parks nearby? Widen the search radius

Dog parks are sparse outside dense cities, and the default search radius is **3 miles**. An empty list usually means the radius, not a broken app.

**Settings → Discovery radius** offers 1 / 3 / 5 / 10 miles (labelled in km if you switch **Distance units**). Raise it and the map re-queries immediately. Same screen also sets the default **check-in expiry**.

If a wider radius still shows nothing, the area genuinely has no Google-listed dog parks — the search is restricted to the `dog_park` place type, not parks in general.

---

## Demo mode

The app is graded and demoed against a database with no real users, and grades are computed per-viewer-location — so a fixed seed script can't help someone testing from a different city. Two seeders fill that gap, both gated behind the `DEMO_MODE=true` environment variable and both writing **ordinary rows**, so everything flows through the real product code paths rather than a special demo mode in the UI.

Everything demo-related lives in [`lib/demo-seed.ts`](lib/demo-seed.ts), which also documents exactly what to delete for a real launch.

### Seeded dogs at nearby parks

A roster of 10 demo dogs (Rex, Nala, Ziggy, Luna, …) with varied size/breed/color/age/energy so grades come out genuinely different per viewing dog.

- Placed as real `CheckIn` rows into currently-empty parks from whatever the viewer's nearby search returned, with 1–4h expiries — so they age out through the same lazy-expiry filter as real check-ins, with no cleanup job.
- The roster is **duplicated per ~11km region**, so two testers in different cities never compete for the same 10 dogs.
- Only some empty parks get filled, on a dice roll. The "no dogs here yet" empty state is a real state worth being able to see.
- Costs **zero** extra Google API calls — it only acts on parks already fetched by the normal cache-first search.
- Failures are caught and logged; demo seeding can never break the real park response.

### Chat demo

An empty inbox makes a working feature look unbuilt, so in demo mode every account gets **one waiting conversation** from _Tailmap Demo_ on first authenticated page load — two messages, backdated a few minutes, arriving unread so the nav badge shows a count.

It's a real `Conversation` with real `Message` rows: the inbox, the unread badge, the Realtime stream and the reply path all exercise production code, and **replying works normally**. Seeding is one-shot per user, keyed on the conversation's unique `pairKey` — logging out, switching devices, or coming back a week later never re-sends it. The demo account's placeholder address is excluded from the email nudge path.

Note: the demo dogs are all owned by the demo account, so if you message one of their owners you land in that same thread.

---

## How the grade works

[`lib/grading.ts`](lib/grading.ts), pure and unit-tested ([`lib/grading.test.ts`](lib/grading.test.ts)):

- Each dog currently checked in scores **+1 per loved trait** and **−1 per disliked trait**, across six categories (size, breed, color, age, energy, gender).
- Park score = `5 + (sum of contributions × 1.2)`, clamped to 0–10, and bucketed into **good** (≥8) / **mid** (≥5) / **low**.
- Each grade carries a human reason — _"Luna is here — Husky & Gray, traits your dog loves"_.
- No other dogs checked in returns **no grade at all**, a distinct empty state rather than a misleading 5/10.

Grades are **derived on every read and never stored**. They depend on who's checked in _and_ on who's asking, so a persisted grade would be wrong for everyone but one viewer.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, TypeScript) on Vercel |
| Data | Supabase Postgres via Prisma 7 |
| Auth | Supabase Auth — email/password or Google OAuth, enforced in `proxy.ts` for every route |
| Realtime | Supabase Realtime (Postgres changes) for live chat + unread badge |
| Parks | Google Places API (New), server-side only |
| Maps | Google Maps JS API |
| Email | Resend (optional — chat works without it) |
| Styling | Tailwind v4 + the "Organic" design tokens in `_ds/` |
| Motion | Motion (Framer) with `prefers-reduced-motion` respected throughout |

### Notable implementation details

- **Places results are cached** in the `Park` table for 24h and never called from the browser — all Google traffic goes through server routes under `app/api/places/`, keeping the key server-side and the bill small.
- **Check-ins expire lazily.** Queries filter `expiresAt > now()`, so correctness needs no cron. One active check-in per dog.
- **Chat is RLS-scoped.** The chat tables are the only ones with Postgres row-level security — SELECT-only policies exist so the browser's Realtime socket can stream just the viewer's own conversations. All writes go through server actions on the service role.
- **The dual browse/map view** shares one data fetch — toggling never refetches parks or re-runs geolocation.

---

## Running locally

```bash
npm install          # runs prisma generate
npx prisma migrate deploy
npm run dev          # http://localhost:3000
```

`localhost` counts as a secure context, so geolocation works in local dev without HTTPS.

```bash
npm run build        # production build
npm test             # vitest — grading + rate-limit units
npm run lint
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser + SSR auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; storage + RLS-bypassing writes |
| `GOOGLE_PLACES_API_KEY` | Server-only; Places API (New) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser Maps JS API — restrict by HTTP referrer |
| `NEXT_PUBLIC_SITE_URL` | Absolute origin for links inside emails |
| `DEMO_MODE` | `true` enables both demo seeders described above |
| `RESEND_API_KEY` | Optional — unread-message emails |
| `EMAIL_FROM` | Optional — sender address for those emails |

Vercel bakes environment variables in at build time: **adding or changing one requires a redeploy**, not just a save.

---

## Project layout

```text
app/(auth)/            login / signup
app/(app)/map/         browse + map views, park detail, geolocation gate
app/(app)/dogs/        dog profiles and love/dislike preferences
app/(app)/session/     the active check-in
app/(app)/chat/        inbox and threads
app/(app)/settings/    radius, units, check-in expiry
app/api/places/        server-side Google Places proxy (nearby, favorites, photos)
lib/grading.ts         the match-grade algorithm (pure, tested)
lib/demo-seed.ts       demo dogs + demo conversation (DEMO_MODE only)
lib/chat.ts            chat reads; lib/actions/chat.ts holds the writes
prisma/schema.prisma   data model
proxy.ts               auth enforcement for every route
```

