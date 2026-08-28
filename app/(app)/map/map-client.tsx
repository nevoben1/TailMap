"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { checkIn } from "@/lib/actions/checkins";
import { toggleFavorite } from "@/lib/actions/favorites";
import type { NearbyPark } from "@/lib/actions/parks";
import { computeParkGrade, describeCheckedInDogs } from "@/lib/grading";
import { fadeRise, reducedFade, springSoft, staggerContainer } from "@/lib/motion";

import { BrowseView } from "./browse-view";
import { FavoriteHeart, GradePill } from "./park-bits";
import { ParkDetail } from "./park-detail";
import {
  NO_GRADE_COLOR,
  TIER_COLOR,
  formatDistance,
  sortParks,
  type DogSummary,
  type GradedPark,
  type SortKey,
  type ViewMode,
} from "./shared";
import { ViewToggle } from "./view-toggle";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * Grading is pure and cheap (lib/grading.ts has no server dependency), and the
 * viewer switching dogs doesn't change which parks/dogs exist — only whose
 * preferences the grade is judged against. So the server sends raw
 * NearbyPark.checkedInDogs once, and grading for whichever dog is currently
 * selected happens here, client-side, via useMemo below.
 */
function gradeParks(parks: NearbyPark[], dog: DogSummary | undefined): GradedPark[] {
  return parks.map((park) => ({
    ...park,
    grade: dog ? computeParkGrade(dog.id, dog.preferences, park.checkedInDogs) : null,
    matches: dog ? describeCheckedInDogs(dog.id, dog.preferences, park.checkedInDogs) : [],
  }));
}

const MARKER_BASE = 38;
const MARKER_SELECTED = 48;

let mapsApiOptionsSet = false;
function ensureMapsApiOptions() {
  if (mapsApiOptionsSet) return;
  setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, v: "weekly" });
  mapsApiOptionsSet = true;
}

function diamondIconUrl(fillColor: string, label: string, opacity = 1) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
    <g opacity="${opacity}">
      <rect x="7" y="7" width="24" height="24" rx="5" fill="${fillColor}" transform="rotate(-45 19 19)" style="filter:drop-shadow(0 3px 4px rgba(46,43,37,0.35))" />
      <text x="19" y="19" text-anchor="middle" dominant-baseline="central" font-family="Georgia, serif" font-size="11" fill="#f9f4ed">${label}</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function userLocationDotUrl(reduce: boolean) {
  const ring = reduce
    ? `<circle cx="30" cy="30" r="14" fill="#4285F4" fill-opacity="0.18" />`
    : `<circle cx="30" cy="30" r="8" fill="#4285F4" fill-opacity="0.25">
         <animate attributeName="r" values="8;26" dur="2s" repeatCount="indefinite" />
         <animate attributeName="fill-opacity" values="0.4;0" dur="2s" repeatCount="indefinite" />
       </circle>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    ${ring}
    <circle cx="30" cy="30" r="6" fill="#4285F4" stroke="#ffffff" stroke-width="2" />
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card" style={{ gap: 10 }}>
          <div className="skeleton" style={{ height: 11, width: "35%" }} />
          <div className="skeleton" style={{ height: 16, width: "70%" }} />
          <div className="skeleton" style={{ height: 12, width: "92%" }} />
          <div className="skeleton" style={{ height: 10, width: "45%" }} />
        </div>
      ))}
    </div>
  );
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
  const reduce = !!useReducedMotion();
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
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const router = useRouter();

  // Dual view (specs §14). Defaults render on the server; the stored choice is
  // applied after mount to avoid a hydration mismatch.
  const [view, setView] = useState<ViewMode>("browse");
  const [sort, setSort] = useState<SortKey>("distance");
  const [mapActivated, setMapActivated] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerClassRef = useRef<typeof google.maps.Marker | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const dropTimersRef = useRef<number[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);

  function changeView(next: ViewMode) {
    setView(next);
    if (next === "map") setMapActivated(true);
  }

  function openPark(parkId: string) {
    setSelectedParkId(parkId);
    setSheetExpanded(false);
  }

  useEffect(() => {
    // One-time read of the stored view/sort preference. Applied after mount
    // (not in a lazy initializer) so server and first client render agree.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const v = localStorage.getItem("tailmap:view");
      if (v === "map" || v === "browse") {
        setView(v);
        if (v === "map") setMapActivated(true);
      }
      const s = localStorage.getItem("tailmap:sort");
      if (s === "distance" || s === "grade" || s === "dogs") setSort(s);
    } catch {
      // no stored preference / storage unavailable — keep defaults
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("tailmap:view", view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem("tailmap:sort", sort);
    } catch {
      /* ignore */
    }
  }, [sort]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation isn't available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError("Location access was denied. Enable it to see nearby parks."),
      { timeout: 10000, maximumAge: 5 * 60 * 1000, enableHighAccuracy: false }
    );
  }, []);

  // No selectedDogId here — switching the viewing dog never needs a re-fetch.
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

  // Map init — deferred until the first switch to Map view (specs §14.2).
  useEffect(() => {
    if (!coords || !mapActivated || !mapDivRef.current || mapRef.current) return;
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
            url: userLocationDotUrl(reduce),
            scaledSize: new google.maps.Size(60, 60),
            anchor: new google.maps.Point(30, 30),
          },
          zIndex: 999,
          title: "Your location",
        });

        setMapReady(true);
      }
    );
  }, [coords, mapActivated, reduce]);

  const selectedDog = dogs.find((d) => d.id === selectedDogId);
  const gradedParks = useMemo(() => gradeParks(parks, selectedDog), [parks, selectedDog]);
  const gradedSavedParks = useMemo(
    () => gradeParks(savedParks, selectedDog),
    [savedParks, selectedDog]
  );

  const displayedParks = tab === "nearby" ? gradedParks : gradedSavedParks;
  const sortedParks = useMemo(() => sortParks(displayedParks, sort), [displayedParks, sort]);
  const selectedPark = sortedParks.find((p) => p.id === selectedParkId) ?? null;
  const loading = tab === "nearby" ? loadingParks : loadingSaved;

  const paintMarker = useCallback(
    (marker: google.maps.Marker, park: GradedPark, selected: boolean, dimmed: boolean) => {
      const color = park.grade ? TIER_COLOR[park.grade.tier] : NO_GRADE_COLOR;
      const label = park.grade ? park.grade.grade.toFixed(1) : "–";
      const size = selected ? MARKER_SELECTED : MARKER_BASE;
      marker.setIcon({
        url: diamondIconUrl(color, label, dimmed ? 0.55 : 1),
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(size / 2, size / 2),
      });
      marker.setZIndex(selected ? 500 : 1);
    },
    []
  );

  // Rebuild markers when the park set changes; each drops in on a short,
  // capped stagger (specs §13.5).
  useEffect(() => {
    if (!mapReady || !mapRef.current || !markerClassRef.current) return;
    const Marker = markerClassRef.current;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    dropTimersRef.current.forEach((t) => clearTimeout(t));
    dropTimersRef.current = [];

    gradedParks.forEach((park, i) => {
      const delay = reduce ? 0 : Math.min(i * 40, 600);
      const timer = window.setTimeout(() => {
        const marker = new Marker({
          position: { lat: park.lat, lng: park.lng },
          map: mapRef.current!,
          animation: reduce ? undefined : google.maps.Animation.DROP,
        });
        const isSel = park.id === selectedParkId;
        paintMarker(marker, park, isSel, selectedParkId != null && !isSel);
        marker.addListener("click", () => openPark(park.id));
        markersRef.current[i] = marker;
      }, delay);
      dropTimersRef.current.push(timer);
    });

    return () => {
      dropTimersRef.current.forEach((t) => clearTimeout(t));
      dropTimersRef.current = [];
    };
    // selectedParkId handled by the emphasis effect below without a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradedParks, mapReady, reduce, paintMarker]);

  useEffect(() => {
    if (!mapReady) return;
    gradedParks.forEach((park, i) => {
      const marker = markersRef.current[i];
      if (!marker) return;
      const isSel = park.id === selectedParkId;
      paintMarker(marker, park, isSel, selectedParkId != null && !isSel);
    });
  }, [selectedParkId, gradedParks, mapReady, paintMarker]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedPark) return;
    mapRef.current.panTo({ lat: selectedPark.lat, lng: selectedPark.lng });
  }, [selectedPark, mapReady]);

  function handleCheckIn(parkId: string) {
    startCheckIn(async () => {
      await checkIn(selectedDogId, parkId);
      // Stays pending through the navigation, not just the write.
      router.push(`/session?dog=${selectedDogId}`);
    });
  }

  const crossfade = { duration: reduce ? 0 : 0.28, ease: EASE_OUT };

  return (
    <main className="flex-1" style={{ position: "relative", minHeight: 0, overflow: "hidden" }}>
      <ViewToggle view={view} onChange={changeView} />

      {/* ── Browse layer ───────────────────────────────────────────── */}
      <motion.div
        className="view-layer view-layer--browse"
        animate={{ opacity: view === "browse" ? 1 : 0 }}
        transition={crossfade}
        style={{ pointerEvents: view === "browse" ? "auto" : "none" }}
        aria-hidden={view !== "browse"}
        inert={view !== "browse"}
      >
        <BrowseView
          parks={sortedParks}
          dogs={dogs}
          selectedDogId={selectedDogId}
          onSelectDog={setSelectedDogId}
          tab={tab}
          onTabChange={setTab}
          sort={sort}
          onSortChange={setSort}
          loading={loading}
          hasCoords={!!coords}
          geoError={geoError}
          fetchError={fetchError}
          distanceUnit={distanceUnit}
          reduce={reduce}
          onOpenPark={openPark}
          onToggleFavorite={handleToggleFavorite}
        />
      </motion.div>

      {/* ── Map layer ──────────────────────────────────────────────── */}
      <motion.div
        className="view-layer"
        animate={{ opacity: view === "map" ? 1 : 0 }}
        transition={crossfade}
        style={{ pointerEvents: view === "map" ? "auto" : "none" }}
        aria-hidden={view !== "map"}
        inert={view !== "map"}
      >
        <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />
        {mapActivated && !mapReady && <div className="map-loading">Loading map…</div>}

        <section
          className="map-panel floating-panel"
          data-expanded={sheetExpanded}
          aria-label="Park list"
        >
          <button
            type="button"
            className="map-panel__handle"
            onClick={() => setSheetExpanded((v) => !v)}
            aria-expanded={sheetExpanded}
            aria-label={sheetExpanded ? "Collapse park list" : "Expand park list"}
          >
            <span className="map-panel__grip" />
          </button>
          <div className="map-panel__inner">
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
            {loading && <SkeletonList />}
            {!loading && tab === "nearby" && sortedParks.length === 0 && !fetchError && coords && (
              <p className="text-muted" style={{ fontSize: 13 }}>No dog parks found nearby.</p>
            )}
            {!loading && tab === "saved" && sortedParks.length === 0 && (
              <p className="text-muted" style={{ fontSize: 13 }}>No saved parks yet.</p>
            )}

            <motion.div
              key={`${tab}-${sort}`}
              className="flex flex-col gap-2"
              style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 17 }}
              variants={reduce ? { hidden: {}, visible: {} } : staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {sortedParks.map((park) => (
                <motion.div
                  key={park.id}
                  variants={reduce ? reducedFade : fadeRise}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPark(park.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPark(park.id);
                    }
                  }}
                  className={`card park-card${park.id === selectedParkId ? " is-selected" : ""}`}
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
                        <GradePill grade={park.grade.grade} tier={park.grade.tier} reduce={reduce} />
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
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <AnimatePresence>
          {selectedPark && (
            <motion.div
              key={selectedPark.id}
              className="map-checkin-pill"
              style={{ x: "-50%" }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              transition={springSoft}
            >
              <button
                type="button"
                disabled={checkingIn}
                onClick={() => handleCheckIn(selectedPark.id)}
                className="btn btn-primary"
              >
                {checkingIn ? "Checking in…" : `Check in at ${selectedPark.name}`}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Shared detail overlay ──────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {selectedPark && (
          <ParkDetail
            key={selectedPark.id}
            park={selectedPark}
            distanceUnit={distanceUnit}
            checkingIn={checkingIn}
            reduce={reduce}
            showOnMap={view === "browse" ? () => changeView("map") : undefined}
            onCheckIn={() => handleCheckIn(selectedPark.id)}
            onToggleFavorite={() => handleToggleFavorite(selectedPark.id)}
            onClose={() => setSelectedParkId(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
