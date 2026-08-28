import { NextResponse, type NextRequest } from "next/server";

import { getFavoritedParks } from "@/lib/actions/parks";
import { getOrCreateUser } from "@/lib/actions/users";

export async function GET(request: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const origin =
    latParam && lngParam ? { lat: Number(latParam), lng: Number(lngParam) } : null;

  const parks = await getFavoritedParks(user.id, origin);
  return NextResponse.json({ parks });
}
