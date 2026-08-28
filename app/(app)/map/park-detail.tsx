"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { startConversationAction } from "@/lib/actions/chat";
import { springSoft } from "@/lib/motion";

import { FavoriteHeart, GradePill } from "./park-bits";
import { directionsUrl, formatDistance, photoProxyUrl, type GradedPark } from "./shared";

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

export function ParkDetail({
  park,
  me,
  distanceUnit,
  checkingIn,
  reduce,
  showOnMap,
  onCheckIn,
  onToggleFavorite,
  onClose,
}: {
  park: GradedPark;
  me: string;
  distanceUnit: "mi" | "km";
  checkingIn: boolean;
  reduce: boolean;
  /** Provided only when the detail is opened outside the map view. */
  showOnMap?: () => void;
  onCheckIn: () => void;
  onToggleFavorite: () => void;
  onClose: () => void;
}) {
  const narrow = useIsNarrow();
  const [photoFailed, setPhotoFailed] = useState(false);

  const from = reduce
    ? { opacity: 0 }
    : narrow
    ? { opacity: 0, y: "100%" as const }
    : { opacity: 0, x: 24 };
  const to = reduce ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 };

  const showPhoto = park.photoRef && !photoFailed;

  return (
    <>
      <motion.div
        className="park-detail__scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.2 }}
        onClick={onClose}
      />
      <motion.div
        className="park-detail floating-panel"
        role="dialog"
        aria-label={park.name}
        initial={from}
        animate={to}
        exit={from}
        transition={springSoft}
      >
        <button
          type="button"
          className="park-detail__close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="park-detail__media">
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
        </div>

        <div className="park-detail__body">
          <div className="flex items-center justify-between">
            <div className="card-title">{park.name}</div>
            <div className="flex items-center gap-2">
              {park.grade && (
                <GradePill grade={park.grade.grade} tier={park.grade.tier} reduce={reduce} />
              )}
              <FavoriteHeart filled={park.isFavorited} onClick={() => onToggleFavorite()} />
            </div>
          </div>
          <div className="card-meta">
            {formatDistance(park.distanceMiles, distanceUnit)}
            {park.grade ? ` · ${park.grade.tier}` : ""}
          </div>

          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginTop: 10,
              marginBottom: 8,
            }}
          >
            Who&apos;s here now
          </div>
          {park.matches.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 12.5 }}>No dogs checked in yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {park.matches.map((dog) => (
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
                  {dog.ownerId && dog.ownerId !== me && (
                    <form action={startConversationAction}>
                      <input type="hidden" name="to" value={dog.ownerId} />
                      <button type="submit" className="chat-msg-owner">
                        Message owner
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={checkingIn}
            onClick={onCheckIn}
            className="btn btn-primary btn-block"
            style={{ marginTop: 14 }}
          >
            {checkingIn ? "Checking in…" : "Check in here"}
          </button>
          {showOnMap && (
            <button
              type="button"
              onClick={showOnMap}
              className="btn btn-secondary btn-block"
            >
              Show on map
            </button>
          )}
          <a
            href={directionsUrl(park)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-block"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 11l19-9-9 19-2-8-8-2z" />
            </svg>
            Directions
          </a>
        </div>
      </motion.div>
    </>
  );
}
