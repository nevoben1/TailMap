import { NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/actions/users";
import { fetchPlacePhoto } from "@/lib/places";
import { checkRateLimit } from "@/lib/rate-limit";

// Higher than the nearby-search limit since one map view can request many
// photos at once; still bounds sustained abuse (architecture.md §11.3).
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

// Photo resource names contain slashes ("places/*/photos/*"), so the dynamic
// segment [ref] is the URL-encoded full resource name (decoded below).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`places-photo:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { ref } = await params;
  const photoRef = decodeURIComponent(ref);

  try {
    const res = await fetchPlacePhoto(photoRef);
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }
}
