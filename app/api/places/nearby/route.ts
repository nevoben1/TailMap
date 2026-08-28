import { NextResponse, type NextRequest } from "next/server";

import { getNearbyParks } from "@/lib/actions/parks";
import { getOrCreateUser } from "@/lib/actions/users";
import { checkRateLimit } from "@/lib/rate-limit";

// 20 requests/minute per user — generous for normal map panning/zooming, tight
// enough to bound cost if the endpoint is hammered (architecture.md §11.3).
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`places-nearby:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { searchParams } = request.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radiusMiles = Number(searchParams.get("radiusMiles") ?? "3");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  try {
    const parks = await getNearbyParks(lat, lng, radiusMiles, user.id);
    return NextResponse.json({ parks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch parks" },
      { status: 502 }
    );
  }
}
