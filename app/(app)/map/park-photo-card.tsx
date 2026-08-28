"use client";

import { motion } from "motion/react";
import { useState } from "react";

import { fadeRise, reducedFade } from "@/lib/motion";

import { FavoriteHeart, GradePill } from "./park-bits";
import {
  NO_GRADE_COLOR,
  TIER_COLOR,
  formatDistance,
  photoProxyUrl,
  type GradedPark,
} from "./shared";

export function ParkPhotoCard({
  park,
  distanceUnit,
  reduce,
  onOpen,
  onToggleFavorite,
}: {
  park: GradedPark;
  distanceUnit: "mi" | "km";
  reduce: boolean;
  onOpen: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = park.photoRef && !photoFailed;

  return (
    <motion.div
      variants={reduce ? reducedFade : fadeRise}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="photo-card"
    >
      <div className="photo-card__media">
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoProxyUrl(park.photoRef!)}
            alt=""
            loading="lazy"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <div className="park-photo-fallback" aria-hidden>
            {park.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="photo-card__fav" onClick={(e) => e.stopPropagation()}>
          <FavoriteHeart filled={park.isFavorited} onClick={onToggleFavorite} />
        </div>
      </div>

      <div className="photo-card__body">
        <div className="flex items-center justify-between">
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
          {park.grade && (
            <GradePill grade={park.grade.grade} tier={park.grade.tier} reduce={reduce} />
          )}
        </div>
        <div className="card-title">{park.name}</div>
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
    </motion.div>
  );
}
