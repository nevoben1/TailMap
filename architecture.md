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
  api/
    places/nearby/route.ts
    places/photo/[ref]/route.ts
lib/
  grading.ts                   # scoring function, shared server-side
  places.ts                    # Places API client + cache upsert logic
  supabase/
    server.ts                  # server-side Supabase client
    client.ts                  # browser Supabase client
  actions/
    dogs.ts                    # server actions: saveDog, setAttr, cycleTrait
    checkins.ts                # server actions: checkIn, endSession
    favorites.ts
    settings.ts
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

## 11. Open Architecture Questions

1. TTL for Places cache freshness — proposed 24h; may need shortening if park check-in activity should influence how "fresh" a listed park needs to be (grading itself is always live regardless of park-metadata cache age, since check-ins are queried separately from the cached Park row).
2. Whether to add Vercel Cron cleanup for expired check-ins now or defer until table size becomes a concern (leaning defer, per §5).
3. Rate-limiting/abuse protection on the Places proxy route (e.g. per-user throttling) — not addressed yet, worth a pass before public launch.
