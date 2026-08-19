# Tailmap — Product & Technical Specification (v1)

## 1. Overview

Tailmap helps dog owners find the dog park that best suits their dog **right now**, based on which other dogs are currently checked in there. Owners build a profile per dog (attributes + love/dislike preferences), and every park shows a live-computed match grade derived from the dogs currently checked in.

Source: mockup at `Tailmap.dc.html` (Claude Design project "Dog Park Finder App"), design system "Organic".

## 2. Success Criteria (v1)

The following end-to-end loop must work in a deployed, responsive web app:

1. User signs up (email/password or Google OAuth) and logs in.
2. User creates a dog profile: attributes (Size, Breed, Color, Age, Energy, Gender) and Loves/Dislikes preferences per trait.
3. User can add and switch between multiple dogs.
4. Map screen shows real parks near the user, each with a live grade computed from currently checked-in dogs, matched against the active dog's preferences.
5. User opens a park, sees who's checked in now and why the match reason is what it is.
6. User checks in; sees an active-session screen listing other dogs present.
7. User ends session; check-in clears and park's checked-in list updates for other users.
8. Grades recompute correctly as check-ins change (not hardcoded).

## 3. Screen Inventory

| # | Screen | Purpose | Key states |
|---|--------|---------|-----------|
| 1 | Onboarding / Sign-up | Account creation | Google OAuth button, email/password form, "explore map instead" guest link |
| 2 | Dog Profile (create/edit) | Manage dog(s) and their attributes/preferences | Dog list + "Add a dog"; attribute chips (single-select); trait chips (neutral→love→dislike cycle); breed search filter |
| 3 | Map (home) | Browse & filter nearby parks, see grades, check in | Nearby/Saved tabs; empty states (no results / no saved); park list; map pins; park detail popover |
| 4 | Active Session | Shown after check-in | "Also here now" list, End session action |
| 5 | Settings | Discovery radius, units, privacy, notification toggles | — |
| 6 | Notifications / Activity feed | *(v2 — out of scope for v1, see §7)* | — |
| 7 | Messages | *(out of scope for v1, see §7)* | — |

Global: top nav bar (Map / My Dogs / Messages / Notifications / Settings / avatar) shown on all screens except onboarding. Since Messages and Notifications are out of scope for v1, their nav icons are hidden or disabled (decision needed — see Open Questions).

## 4. Data Model

- **User** — id, name, email, password hash (if email auth) or OAuth identity, avatar/initial, createdAt.
- **Dog** — id, ownerId (→User), name, photoUrl, attributes: `{ size, breed, color, age, energy, gender }` (single value each), preferences: `{ [category:value]: 'love' | 'dislike' }` (unset = neutral, no entry).
- **Park** — id, name, photoUrl, location (lat/lng), address, source (`external_api` | `seeded`), externalPlaceId (nullable).
- **CheckIn** — id, dogId (→Dog), parkId (→Park), startedAt, expiresAt (auto-expire, see §6), active (bool, derived from `now < expiresAt`).
- **Favorite** — userId + parkId (unique pair).
- **Settings** — userId, discoveryRadius (enum: 1/3/5/10 mi), distanceUnit (mi|km), profileVisibility (everyone|matched|nobody), notification toggles *(stored for future use even though notifications are v2)*.

Grade is **derived, not stored** — computed on read from active CheckIns at a park vs. the viewing dog's preferences (see §5).

## 5. Grading Algorithm (v1 — locked in)

For a viewing dog **D** and park **P**:

1. Get all dogs with an **active** CheckIn at P (excluding D itself if D is also checked in).
2. For each checked-in dog **C**, compare its attributes against D's preferences:
   - For each attribute category (Size, Breed, Color, Age, Energy, Gender), if `C.attributes[category]` matches a preference key in `D.preferences` with value `love` → **+1**.
   - If it matches a preference key with value `dislike` → **−1**.
   - No match / neutral → 0.
   - Sum per-dog to get that dog's contribution (can be multi-attribute, e.g. Golden Retriever + Golden color both loved = +2).
3. Sum all checked-in dogs' contributions → raw score.
4. Normalize to 0–10: `grade = clamp(5 + raw_score * scaling_factor, 0, 10)` where scaling factor keeps a reasonable spread for typical check-in counts (e.g. 1.0–1.5; tune during implementation — flagged as open tuning parameter, not a design decision).
5. Tier: `good` if grade ≥ 8, `mid` if 5 ≤ grade < 8, `low` if grade < 5.
6. Reason string: pick the single checked-in dog with the highest |contribution|; surface its strongest matching/conflicting attribute as plain language (e.g. "2 dogs your dog loves are here now" if aggregate is dominated by loves, or a specific dog+trait callout as in the mock). Exact reason-string template is an implementation detail — mock's phrasing is the reference style.
7. Empty park (no active check-ins) → **distinct empty state**, not a neutral numeric grade. Park card/pin shows a "No dogs checked in yet" label instead of a grade badge/number, sorted separately from graded parks (e.g. after all graded parks, or in its own section — implementation detail).

## 6. Check-in Behavior

- Check-in is **manual** (user taps "Check in here" / "Check in") — no GPS/geofencing in v1.
- A check-in **auto-expires** after a duration of inactivity. Default **3 hours** from `startedAt`, no heartbeat required. This duration is **configurable** (an app-level setting, not per-user, for v1 — e.g. an env var or admin-adjustable constant).
- Ending a session manually clears the check-in immediately (`active = false`).
- **One active check-in per dog at a time** (confirmed). Checking in elsewhere, or checking in again, ends the previous session for that dog.

## 7. Explicit Out of Scope (v1)

- **Messaging** (thread list, chat, composer) — entire feature deferred, not just real-time delivery.
- **Notifications / Activity feed** — deferred to v2. Nav icon is hidden (not disabled) in v1.
- **Native mobile apps** (iOS/Android) — web-responsive only.
- **Payments / monetization** — no subscriptions, ads, or paid tiers.
- **Admin dashboard** — no internal moderation/admin tooling.
- **GPS-based automatic check-in** — manual check-in only.
- **User-submitted parks** — parks sourced from an external places API (see §10), not crowdsourced in v1.
- **Guest/anonymous browsing** — no "explore the map instead" guest path. Registration is mandatory before any use of the app.
- **Profile visibility setting** — no per-dog privacy control. All dog profiles are visible to all users by default in v1.
- **Busy-time bar chart** — the mini per-park busy-history chart from the mock is not displayed in v1 (no real time-bucketed data source yet).

## 8. Functional Requirements

### Auth
- Email/password signup+login, and "Continue with Google" OAuth.
- **No guest access.** Registration is required before using any part of the app; the mock's "Explore the map instead" link is removed.

### Dog Profile
- Create/edit multiple dogs per user; switch active dog via left-rail list.
- Attribute selection: single-select chips per category (Size, Breed, Color, Age, Energy, Gender); Breed has a live text-filter search.
- Preferences ("Loves & dislikes"): same categories, chips cycle neutral → love → dislike → neutral on click.
- Color chips show a color swatch dot.
- Save persists dog to backend.

### Map
- Fetch nearby parks from external places API within the user's discoveryRadius setting.
- List view: park name, tier label, grade badge, one-line reason, distance, live checked-in count, favorite toggle. (Busy-time bar chart omitted in v1 — see §7.)
- Map view: diamond pins colored/labeled by grade tier; selected pin gets outline.
- Nearby/Saved tab toggle; Saved filters to favorited parks.
- Empty states: no saved favorites → "Browse nearby parks" CTA; no nearby parks → "Expand search radius" → routes to Settings.
- Selecting a park (list or pin) opens detail popover: photo, name, grade, distance, "who's here now" (per-dog match reason), Check-in CTA.
- Favorite toggle on park card does not open the park detail (stopPropagation).

### Active Session
- Shown after check-in: park photo, "Checked in now" status, "Also here now" list (other active check-ins at that park), End session action.
- Message action per dog in this list is **removed** (messaging out of scope).

### Settings
- Discovery radius (1/3/5/10 mi segmented control).
- Distance units (mi/km).
- Check-in expiry duration — configurable (default 3h; see §6).
- No profile visibility control (all dogs visible by default — see §7).
- Notification toggles are **not shown** in v1 (notifications feature itself is v2).

### Nav bar
- Messages and Notifications icons are **hidden** in v1 (not just disabled), since both features are deferred. Nav shows: brand, Map, My Dogs, Settings, avatar.

## 9. Component Inventory (reusable across screens)

- **Nav bar** — top global nav, active-state coloring per screen.
- **Dog avatar/initial badge** — circular, colored per dog.
- **Attribute/trait chip** — single-select and cycling variants, optional color swatch.
- **Park card** — list-item version, used in Map sidebar.
- **Grade badge** — pill showing numeric grade, colored by tier.
- **Map pin** — diamond marker, colored/labeled by tier.
- **Busy bar chart** — small inline bar chart, 6 buckets.
- **Empty state block** — icon + title + body + CTA, reused for Saved-empty and No-results.
- **image-slot** — placeholder photo component (dog/park photos) per mock's `<image-slot>`.

## 10. Technology Recommendation

Proposed stack (open to change):

- **Frontend**: Next.js (React) + TypeScript, deployed to Vercel. Matches responsive-web requirement, good fit with Vercel hosting.
- **Backend**: Next.js API routes / server actions (no separate backend service needed for v1 scope).
- **Database**: Postgres, managed via Neon or Supabase.
- **Auth**: Supabase Auth or Auth.js (NextAuth) — supports email/password + Google OAuth out of the box.
- **Places data**: Google Places API (New) — Nearby Search, filtered to dog parks. Pricing as of 2026: no flat monthly fee; billed per-SKU pay-as-you-go. Nearby Search falls under the "Pro" SKU tier at **$32 per 1,000 calls**, with a **free monthly allowance of 5,000 calls** (Google retired the old universal $200/mo credit in March 2025 in favor of per-SKU free tiers: ~10,000/mo for Essentials-tier calls, 5,000/mo for Pro-tier calls like Nearby Search, 1,000/mo for Enterprise-tier). Requires a Google Cloud billing account even to use the free allowance. For a v1 with modest traffic (cache results server-side, don't re-query per page load) this should stay within or close to the free tier; revisit if usage grows. [Sources: developers.google.com/maps/documentation/places/web-service/usage-and-billing, woosmap.com/blog/google-places-api-pricing]
- **Styling**: Tailwind CSS, using the Organic design system's tokens (colors/fonts/radii) captured in `_ds/organic-8421d24a-301d-46e5-bce8-d4b57864b820/styles.css` as the source of truth.
- **Image hosting**: Vercel Blob or Supabase Storage for dog/park photo uploads.

## 11. Open Questions / Decisions Needed

All prior open questions have been resolved (see §5–§10 for the locked-in decisions). One remaining item:

1. Exact grading scaling factor and reason-string generation logic (proposed defaults in §5) will need tuning against real data once check-in volume exists — not a blocker for implementation, just expect adjustment post-launch.

## 12. Verification Checklist (pre-launch)

- [ ] Signup via email/password works; signup via Google OAuth works.
- [ ] User can create, edit, and switch between multiple dog profiles.
- [ ] Breed search filters the chip list correctly.
- [ ] Trait chips cycle neutral → love → dislike → neutral and persist.
- [ ] Map loads real nearby parks from the places API within the configured radius.
- [ ] Grade badge and tier match the algorithm in §5 for a known set of check-ins (unit-tested).
- [ ] Park detail popover shows correct "who's here now" list and per-dog reasons.
- [ ] Check-in creates an active CheckIn row and navigates to Active Session screen.
- [ ] Active session shows other currently-checked-in dogs at that park.
- [ ] Ending session clears the check-in and returns to Map.
- [ ] Check-in auto-expires after the configured duration.
- [ ] Favorite toggle works from park card without opening park detail; Saved tab filters correctly.
- [ ] Empty states render correctly (no saved favorites; no nearby parks).
- [ ] Settings changes (radius, units, check-in expiry) persist and affect Map/check-in behavior.
- [ ] No guest path exists — all app routes require an authenticated user.
- [ ] All dog profiles are visible to all users (no visibility restriction applied).
- [ ] Busy-time bar chart is not rendered anywhere in v1.
- [ ] Messages/Notifications nav icons are hidden, not just disabled.
- [ ] Responsive layout verified on desktop and mobile browser widths.
- [ ] Messaging and Notifications features are fully absent/deferred, not partially built.
- [ ] Deployed and reachable on Vercel with managed Postgres connected.
