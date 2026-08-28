# Tailmap — Architecture (v1)

Companion to `specs.md`. Elaborates the "Technology Recommendation" section (§10) into a concrete system design. Decisions here are proposals to review before implementation starts, not commitments.

## 1. High-Level Shape

Single Next.js app (App Router, TypeScript) deployed to Vercel, backed by a single Supabase project providing Postgres, Auth, and file storage. No separate backend service in v1 — API routes / server actions inside the Next.js app are the backend.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (React)                     │
│   Map / Profile / Session / Settings screens             │
└───────────────┬───────────────────────────────────────┘
                │ HTTPS
┌───────────────▼───────────────────────────────────────┐
│              Next.js app (Vercel)                        │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐ │
│  │ Server        │  │ API routes /   │  │ Places proxy   │ │
│  │ Components    │  │ server actions │  │ route          │ │
│  │ (data fetch,  │  │ (mutations:    │  │ (Nearby Search,│ │
│  │ grading calc) │  │ dog, check-in, │  │ photo proxy)   │ │
│  │               │  │ favorites,     │  │                │ │
│  │               │  │ settings)      │  │                │ │
│  └──────┬────────┘  └───────┬───────┘  └───────┬───────┘ │
└─────────┼───────────────────┼──────────────────┼─────────┘
          │                   │                  │
          ▼                   ▼                  ▼
   ┌─────────────┐    ┌──────────────┐   ┌─────────────────┐
   │ Supabase     │    │ Supabase      │   │ Google Places    │
   │ Postgres     │    │ Auth          │   │ API (New)        │
   │ (Prisma ORM) │    │ (email/pw +   │   │ Nearby Search     │
   │              │    │  Google OAuth)│   │ + Photo media     │
   └─────────────┘    └──────────────┘   └─────────────────┘
          │
          ▼
   ┌─────────────┐
   │ Supabase     │
   │ Storage      │
   │ (dog photos) │
   └─────────────┘
```

Rationale: Supabase covers Postgres + Auth + Storage under one project, so v1 only has two external accounts to manage (Supabase, Google Cloud for Places), and Vercel for hosting/CI. This directly follows specs.md §10 while resolving "Neon or Supabase" / "Auth.js or Supabase Auth" into one concrete choice to reduce moving parts.

## 2. Components

### 2.1 Next.js app (Vercel)
- **App Router**, React Server Components for read-heavy screens (Map, Profile), client components for interactive bits (chip cycling, tab toggles, forms).
- **Server actions** for mutations: save dog, cycle trait, toggle favorite, check in, end session, update settings.
- **Middleware** (`middleware.ts`) enforces "no guest access" (specs.md §7): unauthenticated requests to any route other than `/login` and `/signup` redirect to `/login`.
- **Places proxy route** (`/api/places/nearby`, `/api/places/photo/[ref]`): server-side only. Keeps the Google Places API key off the client and lets us cache/normalize responses before they reach the browser.

### 2.2 Supabase Postgres (via Prisma)
- Source of truth for Users, Dogs, Parks (cached from Places API), CheckIns, Favorites, Settings.
- Prisma as the ORM/migration tool — type-safe queries matching the data model in specs.md §4, migrations tracked in `prisma/migrations`.

### 2.3 Supabase Auth
- Handles email/password and Google OAuth (specs.md §8, Auth). Issues a session cookie the Next.js middleware and server components read via the Supabase SSR helper (`@supabase/ssr`).
- `User` row in our own Postgres schema is created on first login (keyed by Supabase Auth `user.id`) to hold app-specific fields (avatar/initial, timestamps) — auth identity itself stays in Supabase's managed `auth.users` table, not duplicated.

### 2.4 Supabase Storage
- One bucket for dog photos (`dog-photos`), uploaded via signed upload URLs from a server action. Public-read, write restricted to the owning user.

### 2.5 Google Places API (New)
- Nearby Search for park discovery; Place Photos for park images.
- Called only from the server (Places proxy route), never directly from the browser.

## 3. Data Model → Schema

Directly implements specs.md §4. Implemented with **Prisma 7**, which moved connection config out of `schema.prisma`:

- `prisma/schema.prisma` — models only, `datasource db { provider = "postgresql" }` with no `url`/`directUrl` (no longer valid there in Prisma 7).
- `prisma.config.ts` — loads `.env.local` and sets `datasource.url` to `DIRECT_URL` (non-pooled), used by `prisma migrate`/`generate`.
- `lib/prisma.ts` — runtime `PrismaClient`, constructed with `@prisma/adapter-pg` (`PrismaPg`) pointed at the pooled `DATABASE_URL`, since Prisma 7 requires a driver adapter rather than reading `datasource.url` at runtime.

Schema:

```prisma
model User {
  id        String   @id // matches Supabase auth.users.id
  name      String
  email     String   @unique
  avatarInitial String
  createdAt DateTime @default(now())
  dogs      Dog[]
  favorites Favorite[]
  settings  Settings?
}

model Dog {
  id          String   @id @default(cuid())
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id])
  name        String
  photoUrl    String?
  size        String
  breed       String
  color       String
  age         String
  energy      String
  gender      String
  preferences Json     // { "Breed:Golden Retriever": "love", "Color:Black": "dislike", ... }
  checkIns    CheckIn[]
  createdAt   DateTime @default(now())
}

model Park {
  id             String   @id @default(cuid())
  externalPlaceId String? @unique
  name           String
  photoRef       String?
  lat            Float
  lng            Float
  address        String?
  source         String   // "external_api" | "seeded"
  cachedAt       DateTime @default(now())
  checkIns       CheckIn[]
  favorites      Favorite[]
}

model CheckIn {
  id        String   @id @default(cuid())
  dogId     String
  dog       Dog      @relation(fields: [dogId], references: [id])
  parkId    String
  park      Park     @relation(fields: [parkId], references: [id])
  startedAt DateTime @default(now())
  expiresAt DateTime
  endedAt   DateTime? // set when user manually ends session

  @@index([parkId])
  @@index([dogId])
}

model Favorite {
  userId String
  user   User   @relation(fields: [userId], references: [id])
  parkId String
  park   Park   @relation(fields: [parkId], references: [id])

  @@id([userId, parkId])
}

model Settings {
  userId          String  @id
  user            User    @relation(fields: [userId], references: [id])
  discoveryRadius Int     @default(3)    // miles
  distanceUnit    String  @default("mi")
  checkInExpiryHours Int  @default(3)    // per specs.md §6, app-level default, editable here
}
```

Notes:
- `CheckIn.active` is **not a column** — it's derived: `active = endedAt IS NULL AND expiresAt > now()`. This matches specs.md §4/§6 ("Grade is derived, not stored"; check-ins auto-expire without a background job — see §5 below).
- `Dog.preferences` is a JSON map rather than a join table for v1 — simpler to read/write per specs.md's flat `{category:value: love|dislike}` shape; revisit if querying-by-preference becomes a real need.
- `Park` rows are a **cache** of Places API results (see §6), not a park directory owned by users (specs.md §7 excludes user-submitted parks).

## 4. Grading Computation (specs.md §5)

Computed **on read**, server-side, never persisted:

1. Server component/action for the Map screen loads nearby `Park` rows (from cache, refreshing via Places API if stale — see §6).
2. For each park, query active `CheckIn`s (`endedAt IS NULL AND expiresAt > now()`) joined to their `Dog` rows.
3. Run the scoring function from specs.md §5 against the viewing user's currently-selected `Dog.preferences`.
4. Attach `{ grade, tier, reasonText }` to each park in the response sent to the client.
5. If a park has zero active check-ins → skip scoring, return the distinct empty-state marker (specs.md §5.7) instead of a grade.

This keeps grading logic in one server-side module (`lib/grading.ts`) shared by the Map list, map pins, and park detail popover — no duplicate client-side scoring logic.

## 5. Check-in Expiry (specs.md §6)

No cron job / background worker in v1. Expiry is **lazy**: every read of check-ins filters `expiresAt > now()`, so an expired check-in simply stops appearing anywhere (map counts, "who's here now", active session) the moment it lapses, without needing a scheduled cleanup process. `checkInExpiryHours` lives in `Settings` (app-level default 3h, per specs.md §6) and is read when computing `expiresAt` at check-in time.

A periodic cleanup (e.g. a Vercel Cron hitting a `/api/cron/cleanup-checkins` route to hard-delete long-expired rows) can be added later purely for table hygiene — not required for correctness in v1.

## 6. Places API Integration & Caching (specs.md §10)

To stay within the free tier (5,000 Nearby Search calls/month) and avoid latency on every map load:

1. Client requests parks for the user's location + `discoveryRadius`.
2. Server checks the `Park` table for cached rows within that radius with `cachedAt` newer than a TTL (proposed: 24h).
3. On a cache miss (or stale cache), the Places proxy route calls Google Places Nearby Search, upserts results into `Park` (keyed by `externalPlaceId`), and returns the merged set.
4. Park photos are fetched through `/api/places/photo/[ref]`, which proxies Google's Photo API and sets cache headers — avoids exposing the API key and lets Vercel's edge cache serve repeat requests.

This bounds Places API usage to roughly once per distinct geographic area per day, not once per page load.

## 7. Auth Flow (specs.md §8)

1. Signup/login screens call Supabase Auth directly (client SDK) for email/password and Google OAuth.
2. On successful auth, a Supabase Auth webhook (or a check on first authenticated request) creates the corresponding `User` row in our schema if it doesn't exist yet.
3. `middleware.ts` checks the Supabase session cookie on every request; unauthenticated users are redirected to `/login` for any route (no guest access, per specs.md §7).
4. Server components/actions read the session via `@supabase/ssr` to get `userId` for all queries (dogs, check-ins, favorites, settings are always scoped to the logged-in user).

## 8. Route / Folder Structure (proposed)

```
app/
  layout.tsx                 # global nav (Map / My Dogs / Settings / avatar — no Messages/Notifications, specs.md §7)
  (auth)/
    login/page.tsx
    signup/page.tsx
  map/page.tsx                # default post-login route
  dogs/page.tsx                # dog list + selected dog editor
  session/page.tsx             # active session screen
  settings/page.tsx
  chat/page.tsx                # inbox — conversation list (v1.2, specs §15)
  chat/[conversationId]/page.tsx  # thread (v1.2)
  api/
    places/nearby/route.ts
    places/photo/[ref]/route.ts
lib/
  grading.ts                   # scoring function, shared server-side
  places.ts                    # Places API client + cache upsert logic
  realtime.ts                  # browser: chat channel + presence helpers (v1.2)
  email.ts                     # Resend wrapper + templates (v1.2)
  supabase/
    server.ts                  # server-side Supabase client
    client.ts                  # browser Supabase client
  actions/
    dogs.ts                    # server actions: saveDog, setAttr, cycleTrait
    checkins.ts                # server actions: checkIn, endSession
    favorites.ts
    settings.ts
    chat.ts                    # server actions: startConversation, sendMessage,
                               #   markRead, blockUser, unblockUser (v1.2)
prisma/
  schema.prisma
  migrations/
middleware.ts
```

## 9. Deployment (specs.md §10)

- **App**: Vercel, connected to the git repo, preview deployments per PR, production on `main`.
- **Database/Auth/Storage**: one Supabase project (single environment for v1 — no separate staging project until there's a team to justify the overhead).
- **Environment variables** (Vercel project settings): `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `GOOGLE_PLACES_API_KEY` (server-only), `GOOGLE_OAUTH_CLIENT_ID`/`SECRET` (configured in Supabase Auth provider settings, not app env).
- **Migrations**: `prisma migrate deploy` run as a Vercel build step against the Supabase Postgres connection.

## 10. Cross-References to specs.md

| Architecture concern | specs.md section |
|---|---|
| Grading formula | §5 |
| Check-in expiry duration/config | §6 |
| Out-of-scope features (why no Messages/Notifications infra) | §7 |
| Screen-by-screen requirements | §8 |
| Tech stack rationale | §10 |
| Pre-launch verification | §12 |
| UI Motion & Layout Refresh | §13 → architecture §12 |

## 11. Open Architecture Questions

1. TTL for Places cache freshness — proposed 24h; may need shortening if park check-in activity should influence how "fresh" a listed park needs to be (grading itself is always live regardless of park-metadata cache age, since check-ins are queried separately from the cached Park row).
2. Whether to add Vercel Cron cleanup for expired check-ins now or defer until table size becomes a concern (leaning defer, per §5).
3. Rate-limiting/abuse protection on the Places proxy route (e.g. per-user throttling) — not addressed yet, worth a pass before public launch.
4. UI Motion refresh (§12): resolved. Route transitions use `app/(app)/template.tsx` (Phase 1). The floating Map panel is a fixed glass card above 700px and a two-detent, button-toggled (non-draggable) bottom sheet below it (Phase 3, specs §13.5).
5. Chat (§14, specs §15): email nudge has no "quiet period" grace — it fires within seconds of the first unread message to an away recipient (throttled to ≤1 per conversation per 10 min). A true digest ("wait N min of silence, then summarize") would need a scheduler (Vercel Cron or Supabase `pg_cron`); deferred, no schema change beyond `lastChatEmailAt` when added.
6. Chat: RLS is introduced on the three chat tables only. Whether to later extend RLS to the rest of the schema (defence in depth) is open — not needed while all non-chat DB access is server-side via the service role.

## 12. Frontend Motion Architecture (specs.md §13)

Implements the v1.1 polish pass. Presentation layer only — no changes to
data flow, server actions, the RSC/client boundary, or routes.

### 12.1 Library

- **`motion`** (v12+, imported from `motion/react`) — the maintained successor
  to `framer-motion`. The only runtime dependency added by this pass.
- Used in **client components only**. No motion primitives in Server
  Components — the existing RSC boundary is unchanged. Motion wrappers live in
  the already-`"use client"` files (`app/(app)/map/map-client.tsx`,
  `components/nav.tsx`, `app/(app)/dogs/dog-rail.tsx`,
  `app/(app)/dogs/dog-editor.tsx`) plus small new client leaf components.
- No Lottie, GSAP, or a second animation runtime.

### 12.2 Shared motion module — `lib/motion.ts`

Centralizes timing and variants so the whole app is tunable in one place
(same rationale as `lib/grading.ts` centralizing grading):

- Transition presets: `springSoft`, `springSnappy` (JS springs — not
  expressible as CSS), plus `fadeRise` and `stagger` variant objects.
- Consumed by every `motion.*` element rather than inlining `transition={{…}}`.

### 12.3 Design-system tokens

Added to `_ds/organic-8421d24a-301d-46e5-bce8-d4b57864b820/styles.css` `:root`
(the system's source of truth, per CLAUDE.md):

- `--dur-fast: 140ms`, `--dur-base: 240ms`, `--dur-slow: 400ms`
- `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`
- `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`

Springs stay in `lib/motion.ts` (CSS has no spring); CSS-driven transitions
(hover, chip state) use the duration + easing tokens.

### 12.4 Reduced motion

- Global CSS guard in `styles.css`:
  `@media (prefers-reduced-motion: reduce) { *, *::before, *::after {
  animation-duration: .01ms !important; transition-duration: .01ms !important;
  animation-iteration-count: 1 !important; } }`
- JS-driven springs gate on `useReducedMotion()` and return opacity-only (or
  no-op) variants.

### 12.5 Route transitions

- `app/(app)/template.tsx` (re-mounts per navigation) wraps `children` in a
  `motion.div` fade + ~6px rise on mount.
- No cross-route **exit** animation — App Router `template.tsx` has no exit
  hook. `AnimatePresence` is used only **within** a screen (Map detail panel,
  chip state, empty states), never across routes.
- The template must not introduce a new data boundary — it renders children
  directly, no fetching.

### 12.6 Inline-style cleanup (bulk of the diff)

`map-client.tsx` and `dog-editor.tsx` currently carry large inline `style`
objects. Inline style objects can't be transitioned cleanly and class-based
keyframes are cheaper. Extract the repeated blocks into DS classes in
`styles.css`: `.park-card`, `.floating-panel`, `.grade-pill`, `.chip`,
`.chip--love`, `.chip--dislike`, `.skeleton`. This is Phase 1 and is the
largest part of the change by line count; it is behavior-neutral.

### 12.7 Google Maps markers

- Keep `google.maps.Marker` (already loaded via `@googlemaps/js-api-loader`).
  No new map library.
- Drop-in: set `animation: google.maps.Animation.DROP` per marker with a
  `setTimeout` stagger; total envelope capped (~600ms) so high park counts
  don't trail (specs §13.5 item 3).
- Selected-marker emphasis: swap to a larger `icon` `scaledSize` + `setZIndex`;
  dim others by re-rendering their icons at lower opacity.
- Recenter: `map.panTo(latLng)` on select.
- Stagger timers are tracked in a ref and cleared on the marker-rebuild effect
  so a rapid re-fetch (dog switch, radius change) cancels pending drops.

### 12.8 Performance guardrails

- `will-change: transform` only on elements currently animating.
- `layout` / shared-layout animations restricted to small elements: nav
  underline, dog-rail highlight, park-card accent bar. Never the map, never a
  full list container.
- Staggered list entrances animate individual items (`transform`/`opacity`),
  not a reflowing container.

## 13. Browse / Map dual view (specs.md §14)

The `/map` route keeps its path, middleware, and data flow. `MapClient`
becomes a view orchestrator; the map and the new browse feed are two layers
over one dataset.

### 13.1 Component shape

```text
app/(app)/map/
  page.tsx              # unchanged — RSC: auth, dogs, settings → <MapClient>
  map-client.tsx        # orchestrator: fetch + grade + view/sort state + refs
  view-toggle.tsx       # floating Browse/Map segmented control
  browse-view.tsx       # sticky header + responsive grid of <ParkPhotoCard>
  park-photo-card.tsx   # photo (proxy) + fallback + grade/reason/meta/favorite
  park-detail.tsx       # shared overlay: side panel (desktop) / sheet (mobile)
```

- The orchestrator owns everything stateful (geolocation, `/api/places/nearby`
  fetch, grading memos, Google Map refs + marker effects, `selectedParkId`,
  `view`, `sort`). The map JSX stays inline in the orchestrator; `browse-view`
  and `park-detail` are presentational, fed by props.
- `park-detail` is mounted from both layers — anchored inside the map layer is
  dropped in favour of one overlay positioned relative to `<main>`.

### 13.2 Two layers, both mounted

- `<main position:relative>` contains `<ViewToggle>` plus two
  `.view-layer` (`position:absolute; inset:0`) elements — browse and map.
- Each layer is a `motion.div` animating only `opacity` (~280ms tween, not a
  spring — springs overshoot on opacity). The inactive layer gets
  `pointer-events: none` and `aria-hidden`.
- **No `AnimatePresence`** — unmounting the map layer would discard the
  Google Map instance and re-trigger geolocation on the next toggle.

### 13.3 Map lazy-init

- A `mapActivated` state latch flips `true` the first time `view === "map"`.
- The map-init effect gates on `coords && mapActivated`. Because the map layer
  is only ever `opacity: 0` (never `display: none`), its container has real
  dimensions from creation — no `google.maps.event.trigger(map, "resize")`
  needed.

### 13.4 Sort

- `sort: "distance" | "grade" | "dogs"`, `localStorage`-backed
  (`tailmap:sort`), default `"distance"`.
- One `useMemo` sorts the graded list; both `browse-view` and the map layer's
  panel list consume that single ordering. Markers keep building from the
  unsorted graded array (order only affects drop-stagger sequence).
- `"grade"` sorts by `grade.grade` desc with ungraded parks last; `"dogs"` by
  `checkedInDogs.length` desc.

### 13.5 Persistence

- `tailmap:view` and `tailmap:sort` in `localStorage`, each read in a mount
  `useEffect` (not during render) and written in a change `useEffect`. Every
  access is `try/catch`-guarded; a throw or missing value falls back to the
  defaults (Browse / Distance). Nothing view-related touches the URL or the
  server.

### 13.6 Photos

- `park-photo-card` requests `/api/places/photo/${encodeURIComponent(photoRef)}`
  via a plain `<img loading="lazy">`. The proxy already sets
  `Cache-Control: immutable`, so re-renders and toggles don't refetch.
- Null `photoRef` or an image `error` event → a CSS gradient block with the
  park's initial. The proxy's 60 req/min per-user limit comfortably covers a
  ~20-card grid load.

## 14. Chat (specs.md §15)

1:1 direct messaging. Live delivery via Supabase Realtime; email nudges sent
inline from the send action with no scheduler. The first feature in the
project to use Postgres Row Level Security.

### 14.1 Schema additions

Extends the models in §3. All `cuid()` ids unless noted.

```prisma
model Conversation {
  id            String   @id @default(cuid())
  pairKey       String   @unique          // sorted "userA:userB"
  createdAt     DateTime @default(now())
  lastMessageAt DateTime @default(now())  // denormalized for inbox sort
  participants  ConversationParticipant[]
  messages      Message[]

  @@index([lastMessageAt])
}

model ConversationParticipant {
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  userId         String
  user           User         @relation(fields: [userId], references: [id])
  lastReadAt     DateTime     @default(now())
  lastChatEmailAt DateTime?

  @@id([conversationId, userId])
  @@index([userId])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  senderId       String
  sender         User         @relation(fields: [senderId], references: [id])
  body           String
  createdAt      DateTime     @default(now())

  @@index([conversationId, createdAt])
}

model Block {
  blockerId String
  blocker   User     @relation("BlocksMade", fields: [blockerId], references: [id])
  blockedId String
  blocked   User     @relation("BlocksReceived", fields: [blockedId], references: [id])
  createdAt DateTime @default(now())

  @@id([blockerId, blockedId])
  @@index([blockedId])
}
```

- `User` gains the back-relations (`conversations`, `messagesSent`,
  `blocksMade`, `blocksReceived`) and `Settings` gains
  `notifyEmail Boolean @default(true)`.
- Exactly two `ConversationParticipant` rows per conversation in v1.2. The
  table (rather than two userId columns on `Conversation`) is kept so per-side
  `lastReadAt` / `lastChatEmailAt` have a home and group chat is a smaller
  later step.
- No `active`/`unread` columns — unread is derived per read:
  `Message.createdAt > participant.lastReadAt AND senderId != userId`.

### 14.2 Row Level Security

Realtime **Postgres Changes** streams table rows to the browser and filters
them through RLS using the user's Supabase JWT (`auth.uid()`). So the three
chat tables get RLS; nothing else in the schema does.

Migration (hand-written SQL alongside the Prisma migration):

```sql
alter table "Conversation"            enable row level security;
alter table "ConversationParticipant" enable row level security;
alter table "Message"                 enable row level security;

-- membership helper predicate, inlined into each policy:
--   exists (select 1 from "ConversationParticipant" p
--           where p."conversationId" = <row>.id/​conversationId
--             and p."userId" = auth.uid())

create policy "read own participant rows" on "ConversationParticipant"
  for select using ("userId" = auth.uid());

create policy "read joined conversations" on "Conversation"
  for select using (exists (
    select 1 from "ConversationParticipant" p
    where p."conversationId" = "Conversation".id and p."userId" = auth.uid()));

create policy "read messages in joined conversations" on "Message"
  for select using (exists (
    select 1 from "ConversationParticipant" p
    where p."conversationId" = "Message"."conversationId"
      and p."userId" = auth.uid()));

alter publication supabase_realtime add table "Message";
-- (add "Conversation"/"ConversationParticipant" too if the inbox subscribes
--  to them directly rather than to an app-level broadcast channel)
```

- **SELECT only.** No INSERT/UPDATE/DELETE policies — every write goes through
  a server action using the Supabase **service role**, which has `BYPASSRLS`.
  Server-side authorization is written the same way as the rest of the app
  (check `userId` against the row), not delegated to Postgres.
- Prisma's runtime client uses the pooled `DATABASE_URL` role. That role must
  keep `BYPASSRLS` (Supabase's default `postgres`/service role does) or the
  server actions themselves would be filtered. Verify after enabling RLS —
  this is the main migration risk.
- The RLS predicates are also what Realtime Authorization checks for the
  channel subscription, so no separate `realtime.messages` policy is needed
  with the Postgres Changes approach.

### 14.3 Realtime wiring

`lib/realtime.ts` (browser, uses `lib/supabase/client.ts` with the user JWT):

- **Thread channel** — on `/chat/[id]`, subscribe to
  `postgres_changes` INSERT on `Message` filtered `conversationId=eq.<id>`.
  Append to local state; if scrolled to bottom, keep pinned; call `markRead`
  (server action) on receive-while-focused and on mount.
- **Inbox / badge channel** — one subscription per session to `Message`
  inserts across the user's conversations (RLS already limits this to joined
  conversations) or to `ConversationParticipant` updates for `userId`. Feeds
  the nav unread badge and the inbox list ordering. The badge count itself is
  seeded by a server component query on load, then adjusted by events.
- **Presence** — the thread channel also tracks Presence keyed by `userId`.
  Used only server-side-adjacent: `sendMessage` checks whether the recipient
  is present before deciding to email (§14.4). Not rendered as "online" in
  v1.2.

Server actions in `lib/actions/chat.ts`:

- `startConversation(otherUserId)` — reject self / blocked pair; compute
  `pairKey`; `upsert` on `pairKey` creating two participant rows; return id.
- `sendMessage(conversationId, body)` — assert caller is a participant and not
  blocked; `trim` and reject empty; insert `Message`; bump
  `Conversation.lastMessageAt`; `waitUntil(maybeEmail(recipient))`.
- `markRead(conversationId)` — set caller's `lastReadAt = now()`.
- `blockUser(userId)` / `unblockUser(userId)` — upsert/delete `Block`.

### 14.4 Email nudge — `lib/email.ts`

Inline, no cron (see specs §15.5 for the rule). `maybeEmail(recipientParticipant)`:

```text
if !recipient.settings.notifyEmail            -> return
if presenceHasUser(conversationId, recipient) -> return   // client connected
if lastChatEmailAt && lastChatEmailAt > lastReadAt -> return  // already nudged
if lastChatEmailAt && now - lastChatEmailAt < 10*60_000 -> return  // cooldown
send Resend email (sender name, snippet, /chat/<id> deep link)
set recipient.lastChatEmailAt = now()
```

- Runs inside `after()` (`next/server`) from the server action so the sender's
  response is not blocked and a Resend failure does not fail `sendMessage`
  (logged only). `lastChatEmailAt` is stamped **only** when Resend returns ok —
  a "not configured" (no `RESEND_API_KEY`/`EMAIL_FROM`) or failed send leaves
  the recipient eligible for the next message.
- Env: `RESEND_API_KEY`, `EMAIL_FROM`. Sending domain SPF/DKIM configured in
  Resend + DNS. Added to the Vercel env var list in §9. Email is dormant (the
  helper early-returns `{skipped:"not-configured"}`) until both are set, so the
  chat feature ships before email is provisioned.
- **"Recipient is active" check — resolved as `lastReadAt` freshness, not
  Presence.** `maybeNudgeByEmail` skips the email when the recipient's
  `lastReadAt` for the conversation is under 60s old. `thread.tsx` calls
  `markRead` on mount and on every inbound message while mounted, so a
  recipient actually sitting in the thread keeps `lastReadAt` fresh and never
  gets emailed mid-conversation. No Realtime Presence, no `lastSeenAt` column,
  no heartbeat — it reuses the read signal that already exists. Trade-off: a
  recipient with the thread open but the tab backgrounded (Realtime paused)
  can still be emailed, which is acceptable ("you're away").
- Implemented in `lib/email.ts` (plain `fetch` to the Resend HTTP API, no SDK)
  + `maybeNudgeByEmail` in `lib/actions/chat.ts`.

### 14.5 What does not change

- Middleware / auth flow (§7) — `/chat/**` is behind the same auth gate as
  every other route; no new matcher logic beyond it not being `/login`.
- No cron, no background worker — the §5 "no scheduled jobs" property holds.
- RSC/client split — `/chat` and `/chat/[id]` pages are server components for
  the initial load (auth + first page of data); the message list, composer,
  and subscriptions are client components.
- The Places pipeline, grading, check-in expiry — untouched.

### 14.6 Env vars (extends §9)

- `RESEND_API_KEY` (server-only)
- `EMAIL_FROM` (e.g. `Tailmap <hi@mail.tailmap.app>`)
