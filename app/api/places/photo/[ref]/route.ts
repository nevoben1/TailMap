import { NextResponse } from "next/server";

import { fetchPlacePhoto } from "@/lib/places";

// Photo resource names contain slashes ("places/*/photos/*"), so the dynamic
// segment [ref] is the URL-encoded full resource name (decoded below).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
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
