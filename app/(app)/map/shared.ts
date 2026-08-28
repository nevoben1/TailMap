import type { NearbyPark } from "@/lib/actions/parks";
import type { DogPreferences } from "@/lib/dog-attributes";
import type { DogMatch, ParkGrade } from "@/lib/grading";

/** Shared, framework-agnostic pieces for the Browse / Map dual view (specs §14). */

export type DogSummary = {
  id: string;
  name: string;
  breed: string;
  preferences: DogPreferences;
};

export type GradedPark = NearbyPark & { grade: ParkGrade | null; matches: DogMatch[] };

export type SortKey = "distance" | "grade" | "dogs";
export type ViewMode = "browse" | "map";

// Marker glyph + list-card kicker color per tier. The grade *pill* is styled
// via the .grade-pill--<tier> classes in globals.css, not this map.
export const TIER_COLOR: Record<string, string> = {
  good: "#728157",
  mid: "#82796a",
  low: "#8c491a",
};
export const NO_GRADE_COLOR = "#a19786";

export function formatDistance(miles: number | null, unit: "mi" | "km"): string {
  if (miles == null) return "";
  return unit === "km"
    ? `${Math.round(miles * 1.60934 * 10) / 10} km`
    : `${miles} mi`;
}

export function photoProxyUrl(photoRef: string): string {
  return `/api/places/photo/${encodeURIComponent(photoRef)}`;
}

const SORT_LABEL: Record<SortKey, string> = {
  distance: "Distance",
  grade: "Best match",
  dogs: "Most dogs here",
};
export const SORT_OPTIONS = (Object.keys(SORT_LABEL) as SortKey[]).map((value) => ({
  value,
  label: SORT_LABEL[value],
}));

/** Stable sort of an already-graded list. Ungraded parks sink to the bottom
 *  for the grade sort; distance nulls sink for the distance sort. */
export function sortParks(parks: GradedPark[], key: SortKey): GradedPark[] {
  const copy = [...parks];
  if (key === "grade") {
    copy.sort((a, b) => (b.grade?.grade ?? -1) - (a.grade?.grade ?? -1));
  } else if (key === "dogs") {
    copy.sort((a, b) => b.checkedInDogs.length - a.checkedInDogs.length);
  } else {
    copy.sort(
      (a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity)
    );
  }
  return copy;
}
