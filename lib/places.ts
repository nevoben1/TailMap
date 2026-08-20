import "server-only";

const PLACES_API_BASE = "https://places.googleapis.com/v1";

type PlaceResult = {
  externalPlaceId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  photoRef: string | null;
};

type SearchNearbyResponse = {
  places?: {
    id: string;
    displayName?: { text: string };
    location?: { latitude: number; longitude: number };
    formattedAddress?: string;
    photos?: { name: string }[];
  }[];
};

/** Nearby Search against Places API (New), filtered to dog parks (architecture.md §6). */
export async function searchNearbyParks(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<PlaceResult[]> {
  const res = await fetch(`${PLACES_API_BASE}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.location,places.formattedAddress,places.photos",
    },
    body: JSON.stringify({
      includedTypes: ["dog_park"],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: Math.min(radiusMeters, 50000),
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Places API error: ${res.status} ${await res.text()}`);
  }

  const data: SearchNearbyResponse = await res.json();

  return (data.places ?? [])
    .filter((p) => p.location)
    .map((p) => ({
      externalPlaceId: p.id,
      name: p.displayName?.text ?? "Unnamed park",
      lat: p.location!.latitude,
      lng: p.location!.longitude,
      address: p.formattedAddress ?? null,
      photoRef: p.photos?.[0]?.name ?? null,
    }));
}

/** Fetches raw photo bytes + content-type for a stored photoRef (architecture.md §6.4). */
export async function fetchPlacePhoto(photoRef: string, maxWidthPx = 640) {
  const res = await fetch(
    `${PLACES_API_BASE}/${photoRef}/media?maxWidthPx=${maxWidthPx}&key=${process.env.GOOGLE_PLACES_API_KEY}`
  );
  if (!res.ok) throw new Error(`Places photo error: ${res.status}`);
  return res;
}
