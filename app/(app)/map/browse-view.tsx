"use client";

import { motion } from "motion/react";
import Link from "next/link";

import { staggerContainer } from "@/lib/motion";

import { ParkPhotoCard } from "./park-photo-card";
import { SORT_OPTIONS, type DogSummary, type GradedPark, type SortKey } from "./shared";

function SkeletonGrid() {
  return (
    <div className="photo-grid" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="photo-card">
          <div className="skeleton" style={{ height: 150, borderRadius: 0 }} />
          <div className="photo-card__body" style={{ gap: 9 }}>
            <div className="skeleton" style={{ height: 11, width: "35%" }} />
            <div className="skeleton" style={{ height: 17, width: "72%" }} />
            <div className="skeleton" style={{ height: 12, width: "92%" }} />
            <div className="skeleton" style={{ height: 10, width: "45%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BrowseView({
  parks,
  dogs,
  selectedDogId,
  onSelectDog,
  tab,
  onTabChange,
  sort,
  onSortChange,
  loading,
  hasCoords,
  geoError,
  fetchError,
  distanceUnit,
  reduce,
  onOpenPark,
  onToggleFavorite,
}: {
  parks: GradedPark[];
  dogs: DogSummary[];
  selectedDogId: string;
  onSelectDog: (id: string) => void;
  tab: "nearby" | "saved";
  onTabChange: (tab: "nearby" | "saved") => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  loading: boolean;
  hasCoords: boolean;
  geoError: string | null;
  fetchError: string | null;
  distanceUnit: "mi" | "km";
  reduce: boolean;
  onOpenPark: (id: string) => void;
  onToggleFavorite: (id: string, e?: React.MouseEvent) => void;
}) {
  const showEmptyNearby =
    tab === "nearby" && !geoError && !fetchError && !loading && hasCoords && parks.length === 0;
  const showEmptySaved = tab === "saved" && !loading && parks.length === 0;

  return (
    <div className="browse">
      <header className="browse__header">
        <div className="browse__controls">
          {dogs.length > 1 && (
            <select
              value={selectedDogId}
              onChange={(e) => onSelectDog(e.target.value)}
              className="input"
            >
              {dogs.map((dog) => (
                <option key={dog.id} value={dog.id}>
                  Viewing for {dog.name}
                </option>
              ))}
            </select>
          )}

          <div className="seg">
            <label className="seg-opt">
              <input
                type="radio"
                checked={tab === "nearby"}
                onChange={() => onTabChange("nearby")}
              />
              Nearby
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                checked={tab === "saved"}
                onChange={() => onTabChange("saved")}
              />
              Saved
            </label>
          </div>

          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="input"
            aria-label="Sort parks"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="browse__count">
          {loading
            ? "Finding parks…"
            : `${parks.length} ${parks.length === 1 ? "park" : "parks"}`}
        </div>
      </header>

      <div className="browse__scroll">
        {geoError && <p className="browse__msg">{geoError}</p>}
        {fetchError && <p className="browse__msg">{fetchError}</p>}

        {loading && <SkeletonGrid />}

        {showEmptyNearby && (
          <div className="browse__empty">
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
              No dog parks found nearby.
            </p>
            <Link href="/settings" className="btn btn-secondary">
              Expand search radius
            </Link>
          </div>
        )}
        {showEmptySaved && (
          <div className="browse__empty">
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
              No saved parks yet.
            </p>
            <button
              type="button"
              onClick={() => onTabChange("nearby")}
              className="btn btn-secondary"
            >
              Browse nearby parks
            </button>
          </div>
        )}

        {!loading && parks.length > 0 && (
          <motion.div
            key={`${tab}-${sort}`}
            className="photo-grid"
            variants={reduce ? { hidden: {}, visible: {} } : staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {parks.map((park) => (
              <ParkPhotoCard
                key={park.id}
                park={park}
                distanceUnit={distanceUnit}
                reduce={reduce}
                onOpen={() => onOpenPark(park.id)}
                onToggleFavorite={(e) => onToggleFavorite(park.id, e)}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
