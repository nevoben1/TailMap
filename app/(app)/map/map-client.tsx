"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";

import { checkIn } from "@/lib/actions/checkins";
import type { NearbyPark } from "@/lib/actions/parks";

type DogSummary = { id: string; name: string; breed: string };

const TIER_COLOR: Record<string, string> = {
  good: "#728157",
  mid: "#82796a",
  low: "#8c491a",
};
const NO_GRADE_COLOR = "#a19786";

let mapsApiOptionsSet = false;
function ensureMapsApiOptions() {
  if (mapsApiOptionsSet) return;
  setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, v: "weekly" });
  mapsApiOptionsSet = true;
}

function diamondIconUrl(fillColor: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
    <rect x="7" y="7" width="24" height="24" rx="5" fill="${fillColor}" transform="rotate(-45 19 19)" style="filter:drop-shadow(0 3px 4px rgba(46,43,37,0.35))" />
    <text x="19" y="19" text-anchor="middle" dominant-baseline="central" font-family="Georgia, serif" font-size="11" fill="#f9f4ed">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function MapClient({
  dogs,
  radiusMiles,
}: {
  dogs: DogSummary[];
  radiusMiles: number;
}) {
  const [selectedDogId, setSelectedDogId] = useState(dogs[0]?.id ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [parks, setParks] = useState<NearbyPark[]>([]);
  const [loadingParks, setLoadingParks] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedParkId, setSelectedParkId] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerClassRef = useRef<typeof google.maps.Marker | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation isn't available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError("Location access was denied. Enable it to see nearby parks."),
      { timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (!coords || !selectedDogId) return;
    setLoadingParks(true);
    setFetchError(null);
    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      radiusMiles: String(radiusMiles),
      dogId: selectedDogId,
    });
    fetch(`/api/places/nearby?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load parks");
        setParks(data.parks);
      })
      .catch((err) => setFetchError(err instanceof Error ? err.message : "Failed to load parks"))
      .finally(() => setLoadingParks(false));
  }, [coords, selectedDogId, radiusMiles]);

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
        });
        setMapReady(true);
      }
    );
  }, [coords]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !markerClassRef.current) return;
    const Marker = markerClassRef.current;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = parks.map((park) => {
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
  }, [parks, mapReady]);

  const selectedPark = parks.find((p) => p.id === selectedParkId) ?? null;

  async function handleCheckIn(parkId: string) {
    setCheckingIn(true);
    try {
      await checkIn(selectedDogId, parkId);
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <main className="flex-1 flex" style={{ minHeight: 0 }}>
      <aside
        className="flex flex-col"
        style={{
          width: 340,
          flex: "none",
          borderRight: "1px solid var(--color-divider)",
          padding: "17px 17px 0",
          overflowY: "auto",
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

        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.55,
            marginBottom: 13,
          }}
        >
          Parks near you
        </div>

        {geoError && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{geoError}</p>}
        {fetchError && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{fetchError}</p>}
        {!geoError && loadingParks && <p className="text-muted" style={{ fontSize: 13 }}>Loading parks…</p>}
        {!geoError && !loadingParks && parks.length === 0 && !fetchError && coords && (
          <p className="text-muted" style={{ fontSize: 13 }}>
            No dog parks found nearby. Try expanding your search radius in Settings.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {parks.map((park) => (
            <button
              key={park.id}
              type="button"
              onClick={() => setSelectedParkId(park.id)}
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
                {park.grade && (
                  <div
                    style={{
                      padding: "4px 11px",
                      borderRadius: 12,
                      background: "var(--color-accent-2-100)",
                      color: "var(--color-accent-2-800)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {park.grade.grade.toFixed(1)}
                  </div>
                )}
              </div>
              <p className="card-body">
                {park.grade ? park.grade.reason : "No dogs checked in yet"}
              </p>
              <div className="card-meta">
                {park.distanceMiles} mi · {park.checkedInCount}{" "}
                {park.checkedInCount === 1 ? "dog" : "dogs"} here
              </div>
            </button>
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
              {selectedPark.grade && (
                <div
                  style={{
                    padding: "4px 11px",
                    borderRadius: 12,
                    background: "var(--color-accent-2-100)",
                    color: "var(--color-accent-2-800)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {selectedPark.grade.grade.toFixed(1)}
                </div>
              )}
            </div>
            <div className="card-meta">
              {selectedPark.distanceMiles} mi
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
            {selectedPark.checkedInDogs.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 12.5 }}>No dogs checked in yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedPark.checkedInDogs.map((dog) => (
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
