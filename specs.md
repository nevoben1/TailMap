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

All prior open questions have been resolved (see §5–§10 for the locked-in decisions). Remaining items:

1. Exact grading scaling factor and reason-string generation logic (proposed defaults in §5) will need tuning against real data once check-in volume exists — not a blocker for implementation, just expect adjustment post-launch.
2. UI Motion & Layout Refresh (§13): all three implementation open items are now resolved — see §13.5.

## 12. Verification Checklist (pre-launch)

Checked off = verified against a live Supabase/Places backend (test users, real check-in rows, real API calls, cleaned up afterward) or, for the grading algorithm, an automated unit-test suite. Items whose interaction is client-only (chip clicks, tab toggles) were verified by code review + type-check/build rather than live browser clicks — no browser-automation tool is available in this environment; a manual click-through is still worth doing before shipping.

- [x] Signup via email/password works; signup via Google OAuth works. (Google confirmed working live by the user.)
- [x] User can create, edit, and switch between multiple dog profiles. (Verified: two dogs, rail switching, each loads its own isolated preferences/attrs.)
- [x] Breed search filters the chip list correctly. (Code review — simple case-insensitive substring filter, type-checked.)
- [x] Trait chips cycle neutral → love → dislike → neutral and persist. (`cyclePreference` + DB round-trip verified; UI click-cycle is code-reviewed.)
- [x] Map loads real nearby parks from the places API within the configured radius. (Verified live: 20 real SF dog parks via Places API (New), cached, haversine-filtered.)
- [x] Grade badge and tier match the algorithm in §5 for a known set of check-ins (unit-tested). (`lib/grading.test.ts` — 11 passing tests: empty state, love/dislike/neutral scoring, multi-dog sums, tier boundaries, reason strings.)
- [x] Park detail popover shows correct "who's here now" list and per-dog reasons. (Verified live via API — correct per-dog love/dislike/neutral reasons.)
- [x] Check-in creates an active CheckIn row and navigates to Active Session screen. (Verified live.)
- [x] Active session shows other currently-checked-in dogs at that park. (Verified live.)
- [x] Ending session clears the check-in and returns to Map. (Verified against DB: active count 1 → 0 after `endSession`'s query.)
- [x] Check-in auto-expires after the configured duration. (Verified: a check-in with a past `expiresAt` is correctly excluded by the lazy `expiresAt > now()` filter everywhere it's queried.)
- [x] Favorite toggle works from park card without opening park detail; Saved tab filters correctly. (`stopPropagation` in code; Saved-tab data flow verified live via `/api/places/favorites`.)
- [x] Empty states render correctly (no saved favorites; no nearby parks). (Code review — conditional rendering present for both, type-checked.)
- [x] Settings changes (radius, units, check-in expiry) persist and affect Map/check-in behavior. (Verified: default row auto-created, `discoveryRadius` read by Map, `checkInExpiryHours` read by check-in action.)
- [x] No guest path exists — all app routes require an authenticated user. (Verified repeatedly: unauthenticated requests to `/`, `/map`, `/dogs` all redirect to `/login`.)
- [x] All dog profiles are visible to all users (no visibility restriction applied). (Code review — no privacy field exists in the schema or any query.)
- [x] Busy-time bar chart is not rendered anywhere in v1. (Never built — confirmed absent.)
- [x] Messages/Notifications nav icons are hidden, not just disabled. (Stronger than spec required — `components/nav.tsx` never renders them at all.)
- [ ] Responsive layout verified on desktop and mobile browser widths.
- [ ] Messaging and Notifications features are fully absent/deferred, not partially built.
- [ ] Deployed and reachable on Vercel with managed Postgres connected.

## 13. UI Motion & Layout Refresh (v1.1)

A polish pass on top of the shipped v1. Adds motion, liveness, and a more
modern floating layout to the Map screen. **No behavior, data-model, routing,
grading, check-in, or auth changes** — this is presentation only. No new
screens. Architecture in `architecture.md` §12.

### 13.1 Principles

- **Motion is feedback, not decoration.** Every animation maps to a real state
  change: data loading, selection, favorite toggle, navigation, check-in.
- **Respect `prefers-reduced-motion`.** All non-essential motion is disabled
  under the OS setting; enter/exit degrade to an opacity-only fade or nothing.
- **60fps.** Animate `transform` / `opacity` only. `layout` animations are
  limited to small elements (nav underline, rail highlight, card accent bar) —
  never the map or long scrolling lists.
- **Timing scale:** fast 140ms (hover, tap), base 240ms (enter/exit, panels),
  slow 400ms (route transitions, marker-stagger envelope).

### 13.2 Screen-by-screen changes

**Map (primary focus)**
- Sidebar becomes a **floating overlay panel** over a full-bleed map: glassy
  surface (`backdrop-filter`), `elev-lg`, rounded, inset from the viewport
  edges — instead of the current hard `border-right` column.
- Park-list loading state: 3–4 **skeleton cards** (shimmer) replace the
  "Loading parks…" text.
- Park cards **enter staggered** (fade + ~8px rise, ~40ms stagger) when a
  fetch resolves.
- Card **hover**: lift ~2px + shadow step (`elev-sm`→`elev-md`).
- Selected card: an **animated accent bar** slides between cards (shared
  layout) instead of the instant border swap.
- **Grade pill** pops in / ticks the number when it appears or changes.
- Map **markers drop in staggered** by distance (envelope capped ~600ms
  regardless of count). Selected marker **scales up + raised z-index**, others
  dim. `map.panTo()` **recenters** on select.
- **Detail panel**: spring slide-in from the right + fade; `AnimatePresence`
  on close.
- **Floating "Check in" pill** anchored bottom-center of the map when a park
  is selected (see §13.5 open item 2).
- Empty states: icon + gentle scale/float-in.
- User-location dot: soft pulsing ring.

**Nav** — sliding active-link underline (shared layout id) between Map / My
Dogs / Settings. Route content cross-fades + rises ~6px on navigation.

**Dogs** — dog rail: selected item gets a sliding highlight. Attribute and
loves/dislikes chips: tap = scale bounce (~0.94→1); state/color change tweened,
not instant; selection ring animates in. Editor sections fade/stagger on dog
switch. Photo upload shows a spinner then fades the image in.

**Session** — card springs in on arrival (the check-in payoff moment).
"Checked in now" badge pulses subtly. "Also here now" list staggers in.

**Auth (login/signup)** — light touch only: card fade+rise on mount, button
press states. Not a focus of this pass.

### 13.3 New / updated reusable components (extends §9)

- **Skeleton card** — shimmer placeholder for the park list.
- **Floating panel** — glass overlay container (Map sidebar; mobile bottom
  sheet, see §13.5).
- **Animated grade badge** — the §9 grade badge with pop + number tick.
- **Motion-wrapped park card** — §9 park card with entrance / hover / selected
  variants.
- **Sliding-highlight nav / rail** — shared-layout active indicator.

### 13.4 Delivery phases

Each phase is independently shippable. All four have landed.

1. **Foundation** *(done)* — `motion` dependency; motion tokens
   (`--dur-*`, `--ease-*`) in the Organic tokens file; `prefers-reduced-motion`
   guard + app component classes in `app/globals.css`; `lib/motion.ts` (shared
   transitions/variants); `app/(app)/template.tsx` route cross-fade. Map grade
   pill / park card inline styles extracted to classes. (Dog-editor chip
   extraction was deferred to Phase 4, where its motion lands.)
2. **Map liveness** *(done)* — skeleton list, staggered card entrance, card
   hover lift, animated grade pill, marker drop-in stagger + selected
   emphasis + `panTo` recenter, detail-panel spring slide-in, pulsing user
   dot. All gated on reduced-motion.
3. **Map layout modernization** *(done)* — `.floating-panel` glass overlay
   (`.map-panel`), floating primary check-in pill, mobile two-detent bottom
   sheet (`data-expanded`, 700px breakpoint).
4. **Secondary screens** *(done)* — nav sliding underline (`layoutId`),
   dog-rail sliding highlight (`layoutId`), dog-editor `.chip` extraction +
   tap-bounce + state tween, session card spring-in + staggered list +
   pulsing badge, auth card fade-rise on mount.

### 13.5 Resolved during implementation

1. **Mobile floating-panel pattern.** *Resolved:* non-draggable bottom sheet
   below a 700px viewport width, two detents — peek (`translateY(calc(100% -
   132px))`, showing the grip + filters) and expanded (`max-height: 82vh`).
   A grip button toggles between them; selecting a park auto-collapses to
   peek. Above 700px the panel is a fixed floating glass card
   (`top/left/bottom: 16px`, `width: 348px`).
2. **Floating check-in pill vs. panel button.** *Resolved as proposed:* the
   bottom-center pill ("Check in at" + the park name) is the primary CTA; the detail
   panel keeps a secondary `btn-secondary` "Check in here". Both appear only
   while a park is selected and share the same pending state.
3. **Marker animation at high park counts (>30).** *Resolved:* per-marker drop
   delay is `min(index * 40ms, 600ms)` — the stagger envelope never exceeds
   ~600ms. Pending drop timers are cleared on any list rebuild.

### 13.6 Verification additions (extends §12)

- [ ] All motion respects `prefers-reduced-motion` (toggle the OS setting;
      confirm opacity-only / no motion).
- [ ] No layout shift or jank on the Map with ~20 parks (Performance panel,
      4× CPU throttle).
- [ ] Floating panel is usable at 375px width (bottom-sheet mode).
- [ ] Route transitions do not re-trigger data fetches.
- [ ] Marker stagger cancels cleanly on rapid re-fetch (dog switch, radius
      change).

## 14. Browse / Map dual view (v1.1)

The `/map` screen gets two view modes over the same data. **Browse** (a
photo-card discovery feed, holiday-finder style) is the default; **Map** (the
existing Google map + floating panel from §13.3) is one toggle away. Same
`/api/places/nearby` payload, same client-side grading, same favorite/check-in
actions — this is a presentation split, no backend change (`NearbyPark`
already carries `photoRef`, and `/api/places/photo/[ref]` proxies the image).

### 14.1 Rationale

Choosing a park is a browse-and-compare decision — photo, grade, who's here,
distance — which a card feed serves better than a map. The map answers a
narrower question (where exactly, how parks cluster spatially), so it becomes
an opt-in mode rather than the landing surface.

### 14.2 Behavior

- **Default view:** Browse. The last-used view is remembered per browser in
  `localStorage` (`tailmap:view`), read after mount (accept a one-frame
  Browse flash rather than risk a hydration mismatch). No URL involvement —
  view is component state; the back button does not switch views.
- **Toggle:** a single persistent floating control ("Browse / Map" segmented
  pill, top-center of the screen), rendered outside both view layers so it
  neither moves nor fades during the transition.
- **Transition:** both layers stay mounted; a ~280ms opacity crossfade with
  `pointer-events` gated to the active layer. Not an `AnimatePresence`
  unmount — keeping both mounted preserves Google Map state (center, zoom,
  tiles) and avoids re-running geolocation on every toggle. Reduced motion →
  instant swap.
- **Map lazy-init:** the Google Map is not created until the first switch to
  Map view (`mapActivated` latch); thereafter it persists behind the Browse
  layer at `opacity: 0`. It initializes into a full-size (not
  `display:none`) container, so no resize/reflow dance is needed.
- **Card click (Browse) / pin or panel-row click (Map):** both open the same
  **park detail overlay** — a right-side panel on desktop, a bottom sheet on
  mobile. The overlay carries photo, grade, "who's here now", the check-in
  CTA, and a **"Show on map"** action that switches to Map view and `panTo`s
  that park. This replaces the map-anchored detail panel from §13.3.
- **Sort control (Browse):** a dropdown — **Distance** (default), **Best
  match** (grade desc, ungraded last), **Most dogs here** (active check-in
  count desc). Client-side sort over the already-graded list; the Map view's
  panel list uses the same ordering. Remembered in `localStorage`
  (`tailmap:sort`). Nearby/Saved tabs and the dog selector are unchanged.

### 14.3 Browse layer layout

- Sticky header: dog selector (when >1 dog), Nearby/Saved segmented control,
  sort dropdown, result count.
- Responsive card grid: 1 column on mobile, 2–3 on desktop.
- **Park photo card:** `<img loading="lazy">` from the photo proxy; a missing
  `photoRef` falls back to a tinted gradient block with the park initial.
  Card body: name, tier label, animated grade badge, one-line reason,
  distance, live checked-in count, favorite toggle (does not open the
  overlay — `stopPropagation`, per §8).
- Skeleton **grid** while loading; the existing empty states ("no parks
  nearby" → Settings, "no saved parks" → browse nearby) carried over.

### 14.4 Delivery phases (continues §13.4)

1. **Scaffold** — `view` + `sort` state (both `localStorage`-backed), floating
   `ViewToggle`, two crossfading `.view-layer`s, `mapActivated` lazy gate. Map
   layer = the existing §13 UI. Browse layer = a first-cut card list on the
   shared data. Sort applied to one shared memo used by both lists.
2. **Browse visual** — photo cards + fallback, responsive grid, sticky
   header, skeleton grid.
3. **Shared detail overlay** — extract the map-anchored panel into one
   `ParkDetail` used from both layers (desktop side panel / mobile sheet);
   wire "Show on map" → switch + pan. Retire the anchored panel.
4. **Polish** — crossfade tuning, image fallback states, reduced-motion
   paths, Browse scroll-position restore when toggling back from Map.

### 14.5 Verification (extends §13.6)

- [ ] Toggling Browse↔Map does not refetch parks or re-run geolocation.
- [ ] Map view still works after being opened for the first time mid-session
      (correct size, markers, `panTo`).
- [ ] Last view + last sort survive a reload; a cleared/blocked
      `localStorage` falls back to Browse / Distance without error.
- [ ] Sort orders match on the Browse grid and the Map panel list.
- [ ] Detail overlay opens from both views; "Show on map" lands centered on
      the right park.
- [ ] Photo card degrades to the gradient fallback when `photoRef` is null or
      the image 404s.
- [ ] Reduced motion: view switch is an instant swap, no crossfade.
