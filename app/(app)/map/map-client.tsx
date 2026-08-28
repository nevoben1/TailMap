"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { checkIn } from "@/lib/actions/checkins";
import { toggleFavorite } from "@/lib/actions/favorites";
import type { NearbyPark } from "@/lib/actions/parks";
import type { DogPreferences } from "@/lib/dog-attributes";
import { computeParkGrade, describeCheckedInDogs, type DogMatch, type ParkGrade } from "@/lib/grading";

type DogSummary = { id: string; name: string; breed: string; preferences: DogPreferences };

/**
 * Grading is pure and cheap (lib/grading.ts has no server dependency), and the
 * viewer switching dogs doesn't change which parks/dogs exist — only whose
 * preferences the grade is judged against. So the server sends raw
 * NearbyPark.checkedInDogs once, and grading for whichever dog is currently
 * selected happens here, client-side, via useMemo below. Switching dogs is
 * then instant (no re-fetch) instead of round-tripping to re-run a
 * calculation that didn't need new data.
 */
type GradedPark = NearbyPark & { grade: ParkGrade | null; matches: DogMatch[] };

function gradeParks(parks: NearbyPark[], dog: DogSummary | undefined): GradedPark[] {
  return parks.map((park) => ({
    ...park,
    grade: dog ? computeParkGrade(dog.id, dog.preferences, park.checkedInDogs) : null,
    matches: dog ? describeCheckedInDogs(dog.id, dog.preferences, park.checkedInDogs) : [],
  }));
}

const TIER_COLOR: Record<string, string> = {
  good: "#728157",
  mid: "#82796a",
  low: "#8c491a",
};
const TIER_BG: Record<string, string> = {
  good: "#f0fae1",
  mid: "#eee7db",
  low: "#fff2eb",
};
const NO_GRADE_COLOR = "#a19786";

let mapsApiOptionsSet = false;
function ensureMapsApiOptions() {
  if (mapsApiOptionsSet) return;
  setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, v: "weekly" });
  mapsApiOptionsSet = true;
}

function FavoriteHeart({
  filled,
  onClick,
}: {
  filled: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={filled ? "Remove from saved" : "Save park"}
      style={{ cursor: "pointer", background: "none", border: "none", padding: 0, flex: "none" }}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill={filled ? "var(--color-accent)" : "none"}
        stroke={filled ? "var(--color-accent)" : "rgba(32,30,29,0.55)"}
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.04 3 5.5l7 7Z" />
      </svg>
    </button>
  );
}

function diamondIconUrl(fillColor: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
    <rect x="7" y="7" width="24" height="24" rx="5" fill="${fillColor}" transform="rotate(-45 19 19)" style="filter:drop-shadow(0 3px 4px rgba(46,43,37,0.35))" />
    <text x="19" y="19" text-anchor="middle" dominant-baseline="central" font-family="Georgia, serif" font-size="11" fill="#f9f4ed">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function userLocationDotUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="9" fill="#4285F4" fill-opacity="0.2" />
    <circle cx="10" cy="10" r="6" fill="#4285F4" stroke="#ffffff" stroke-width="2" />
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatDistance(miles: number | null, unit: "mi" | "km"): string {
  if (miles == null) return "";
  return unit === "km"
    ? `${Math.round(miles * 1.60934 * 10) / 10} km`
    : `${miles} mi`;
}

export function MapClient({
  dogs,
  radiusMiles,
  distanceUnit,
}: {
  dogs: DogSummary[];
  radiusMiles: number;
  distanceUnit: "mi" | "km";
}) {
  const [selectedDogId, setSelectedDogId] = useState(dogs[0]?.id ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [tab, setTab] = useState<"nearby" | "saved">("nearby");
  const [parks, setParks] = useState<NearbyPark[]>([]);
  const [savedParks, setSavedParks] = useState<NearbyPark[]>([]);
  const [loadingParks, setLoadingParks] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedParkId, setSelectedParkId] = useState<string | null>(null);
  const [checkingIn, startCheckIn] = useTransition();
  const [mapReady, setMapReady] = useState(false);
  const router = useRouter();

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerClassRef = useRef<typeof google.maps.Marker | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation isn't available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError("Location access was denied. Enable it to see nearby parks."),
      // Accept a position up to 5 min old so returning to this page (e.g. after
      // check-in/out) resolves instantly from cache instead of a fresh GPS fix.
      { timeout: 10000, maximumAge: 5 * 60 * 1000, enableHighAccuracy: false }
    );
  }, []);

  // Note: no selectedDogId here — switching the viewing dog never needs a
  // re-fetch, only the coords/radius (an actual location/search change) do.
  useEffect(() => {
    if (!coords) return;
    setLoadingParks(true);
    setFetchError(null);
    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      radiusMiles: String(radiusMiles),
    });
    fetch(`/api/places/nearby?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load parks");
        setParks(data.parks);
      })
      .catch((err) => setFetchError(err instanceof Error ? err.message : "Failed to load parks"))
      .finally(() => setLoadingParks(false));
  }, [coords, radiusMiles]);

  useEffect(() => {
    if (tab !== "saved") return;
    setLoadingSaved(true);
    const params = new URLSearchParams();
    if (coords) {
      params.set("lat", String(coords.lat));
      params.set("lng", String(coords.lng));
    }
    fetch(`/api/places/favorites?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load saved parks");
        setSavedParks(data.parks);
      })
      .catch((err) => setFetchError(err instanceof Error ? err.message : "Failed to load saved parks"))
      .finally(() => setLoadingSaved(false));
  }, [tab, coords]);

  function handleToggleFavorite(parkId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    const flip = (list: NearbyPark[]) =>
      list.map((p) => (p.id === parkId ? { ...p, isFavorited: !p.isFavorited } : p));
    setParks(flip);
    setSavedParks((prev) => prev.filter((p) => p.id !== parkId));
    toggleFavorite(parkId).catch(() => {
      setParks(flip);
    });
  }

  useEffect(() => {
    if (!coords || !mapDivRef.current || mapRef.current) return;
    ensureMapsApiOptions();
    Promise.all([importLibrary("maps"), importLibrary("marker")]).then(
      ([{ Map }, { Marker }]) => {
        if (!mapDivRef.current) return;
        markerClassRef.current = Marker;
        mapRef.current = new Map(mapDivRef.current, {
          center: coords,
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          // Hide business/transit POI icons — this is a dog-park finder, not a
          // general map, and the default POI layer drowns out our own pins.
          styles: [
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
            { featureType: "poi", elementType: "geometry", stylers: [{ visibility: "off" }] },
            { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
          ],
        });

        userMarkerRef.current = new Marker({
          position: coords,
          map: mapRef.current,
          icon: {
            url: userLocationDotUrl(),
            scaledSize: new google.maps.Size(20, 20),
            anchor: new google.maps.Point(10, 10),
          },
          zIndex: 999,
          title: "Your location",
        });

        setMapReady(true);
      }
    );
  }, [coords]);

  const selectedDog = dogs.find((d) => d.id === selectedDogId);
  const gradedParks = useMemo(() => gradeParks(parks, selectedDog), [parks, selectedDog]);
  const gradedSavedParks = useMemo(
    () => gradeParks(savedParks, selectedDog),
    [savedParks, selectedDog]
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current || !markerClassRef.current) return;
    const Marker = markerClassRef.current;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = gradedParks.map((park) => {
      const color = park.grade ? TIER_COLOR[park.grade.tier] : NO_GRADE_COLOR;
      const label = park.grade ? park.grade.grade.toFixed(1) : "–";
      const marker = new Marker({
        position: { lat: park.lat, lng: park.lng },
        map: mapRef.current!,
        icon: {
          url: diamondIconUrl(color, label),
          scaledSize: new google.maps.Size(38, 38),
          anchor: new google.maps.Point(19, 19),
        },
      });
      marker.addListener("click", () => setSelectedParkId(park.id));
      return marker;
    });
  }, [gradedParks, mapReady]);

  const displayedParks = tab === "nearby" ? gradedParks : gradedSavedParks;
  const selectedPark = displayedParks.find((p) => p.id === selectedParkId) ?? null;

  function handleCheckIn(parkId: string) {
    startCheckIn(async () => {
      await checkIn(selectedDogId, parkId);
      // Stays pending (button shows "Checking in…") through the navigation,
      // not just the write.
      router.push(`/session?dog=${selectedDogId}`);
    });
  }

  return (
    <main className="flex-1 flex" style={{ minHeight: 0, overflow: "hidden" }}>
      <aside
        className="flex flex-col"
        style={{
          width: 340,
          flex: "none",
          borderRight: "1px solid var(--color-divider)",
          padding: "17px 17px 0",
          overflow: "hidden",
        }}
      >
        {dogs.length > 1 && (
          <select
            value={selectedDogId}
            onChange={(e) => setSelectedDogId(e.target.value)}
            className="input"
            style={{ marginBottom: 13 }}
          >
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                Viewing for {dog.name}
              </option>
            ))}
          </select>
        )}

        <div className="seg" style={{ marginBottom: 13, alignSelf: "flex-start" }}>
          <label className="seg-opt">
            <input
              type="radio"
              checked={tab === "nearby"}
              onChange={() => setTab("nearby")}
            />
            Nearby
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              checked={tab === "saved"}
              onChange={() => setTab("saved")}
            />
            Saved
          </label>
        </div>

        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.55,
            marginBottom: 13,
          }}
        >
          {tab === "nearby" ? "Parks near you" : "Saved parks"}
        </div>

        {geoError && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{geoError}</p>}
        {fetchError && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{fetchError}</p>}
        {tab === "nearby" && !geoError && loadingParks && (
          <p className="text-muted" style={{ fontSize: 13 }}>Loading parks…</p>
        )}
        {tab === "nearby" && !geoError && !loadingParks && parks.length === 0 && !fetchError && coords && (
          <div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
              No dog parks found nearby.
            </p>
            <Link href="/settings" className="btn btn-secondary">
              Expand search radius
            </Link>
          </div>
        )}
        {tab === "saved" && loadingSaved && (
          <p className="text-muted" style={{ fontSize: 13 }}>Loading saved parks…</p>
        )}
        {tab === "saved" && !loadingSaved && savedParks.length === 0 && (
          <div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
              No saved parks yet.
            </p>
            <button type="button" onClick={() => setTab("nearby")} className="btn btn-secondary">
              Browse nearby parks
            </button>
          </div>
        )}

        <div
          className="flex flex-col gap-2"
          style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 17 }}
        >
          {displayedParks.map((park) => (
            <div
              key={park.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedParkId(park.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedParkId(park.id);
                }
              }}
              className="card"
              style={{
                textAlign: "left",
                cursor: "pointer",
                border:
                  park.id === selectedParkId
                    ? "1.5px solid var(--color-accent)"
                    : "1.5px solid transparent",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: park.grade ? TIER_COLOR[park.grade.tier] : NO_GRADE_COLOR,
                    }}
                  >
                    {park.grade ? park.grade.tier : "No dogs yet"}
                  </div>
                  <div className="card-title">{park.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  {park.grade && (
                    <div
                      style={{
                        padding: "4px 11px",
                        borderRadius: 12,
                        background: TIER_BG[park.grade.tier],
                        color: TIER_COLOR[park.grade.tier],
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {park.grade.grade.toFixed(1)}
                    </div>
                  )}
                  <FavoriteHeart
                    filled={park.isFavorited}
                    onClick={(e) => handleToggleFavorite(park.id, e)}
                  />
                </div>
              </div>
              <p className="card-body">
                {park.grade ? park.grade.reason : "No dogs checked in yet"}
              </p>
              <div className="card-meta">
                {park.distanceMiles != null
                  ? `${formatDistance(park.distanceMiles, distanceUnit)} · `
                  : ""}
                {park.checkedInDogs.length} {park.checkedInDogs.length === 1 ? "dog" : "dogs"} here
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1" style={{ position: "relative" }}>
        <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />

        {selectedPark && (
          <div
            className="card elev-lg"
            style={{
              position: "absolute",
              top: 17,
              right: 17,
              width: 300,
              maxHeight: "calc(100% - 34px)",
              overflowY: "auto",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="card-title">{selectedPark.name}</div>
              <div className="flex items-center gap-2">
                {selectedPark.grade && (
                  <div
                    style={{
                      padding: "4px 11px",
                      borderRadius: 12,
                      background: TIER_BG[selectedPark.grade.tier],
                      color: TIER_COLOR[selectedPark.grade.tier],
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {selectedPark.grade.grade.toFixed(1)}
                  </div>
                )}
                <FavoriteHeart
                  filled={selectedPark.isFavorited}
                  onClick={() => handleToggleFavorite(selectedPark.id)}
                />
              </div>
            </div>
            <div className="card-meta">
              {formatDistance(selectedPark.distanceMiles, distanceUnit)}
              {selectedPark.grade ? ` · ${selectedPark.grade.tier}` : ""}
            </div>

            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity: 0.5,
                marginTop: 8,
                marginBottom: 8,
              }}
            >
              Who&apos;s here now
            </div>
            {selectedPark.matches.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 12.5 }}>No dogs checked in yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedPark.matches.map((dog) => (
                  <div key={dog.dogId}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {dog.name} · {dog.breed}
                    </div>
                    <div
                      className="flex items-center gap-2"
                      style={{
                        fontSize: 11.5,
                        color:
                          dog.sign === "love"
                            ? "#3d472b"
                            : dog.sign === "dislike"
                            ? "#8c491a"
                            : "rgba(32,30,29,0.6)",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background:
                            dog.sign === "love"
                              ? "#728157"
                              : dog.sign === "dislike"
                              ? "#8c491a"
                              : "rgba(32,30,29,0.3)",
                        }}
                      />
                      {dog.reason}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={checkingIn}
              onClick={() => handleCheckIn(selectedPark.id)}
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
            >
              {checkingIn ? "Checking in…" : "Check in here"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
