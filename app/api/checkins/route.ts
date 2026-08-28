import { NextResponse, type NextRequest } from "next/server";

import { getCheckedInDogsByPark } from "@/lib/actions/parks";
import { getOrCreateUser } from "@/lib/actions/users";
import { checkRateLimit } from "@/lib/rate-limit";

// The map client polls this every ~20s (≈3/min). 60/min leaves ample headroom
// for multiple tabs without letting a runaway loop hammer the DB.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

// Bounds the IN () list — the nearby search never returns close to this many.
const MAX_PARK_IDS = 200;

export async function GET(request: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`checkins:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const raw = request.nextUrl.searchParams.get("parkIds") ?? "";
  const parkIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_PARK_IDS);

  const byPark = await getCheckedInDogsByPark(parkIds);
  return NextResponse.json({ byPark });
}
