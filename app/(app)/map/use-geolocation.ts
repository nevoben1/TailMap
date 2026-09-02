"use client";

import { useCallback, useEffect, useState } from "react";

export type GeoStatus =
  /** Still working out what the browser permission state is. */
  | "checking"
  /** Permission not granted yet — wait for a user gesture before prompting. */
  | "prompt"
  /** getCurrentPosition is in flight. */
  | "locating"
  | "ready"
  | "denied"
  /** No fix available (code 2) or no geolocation API at all. */
  | "unavailable"
  | "timeout"
  /** Not an HTTPS/localhost origin — geolocation is unavailable by spec. */
  | "insecure";

export type Coords = { lat: number; lng: number };

export type GeoState = {
  coords: Coords | null;
  status: GeoStatus;
  /** True once a prompt was raised and dismissed rather than answered. */
  dismissed: boolean;
  request: () => void;
};

const OPTIONS: PositionOptions = {
  timeout: 10000,
  maximumAge: 5 * 60 * 1000,
  enableHighAccuracy: false,
};

/**
 * Geolocation, gesture-gated.
 *
 * The browser permission prompt is easy to miss (and Chrome silently blocks the
 * origin after a few dismissals), so we only call getCurrentPosition when we
 * already hold permission or when the user explicitly asks — that way the
 * prompt always appears immediately after a click they initiated, and a missed
 * prompt leaves the in-app CTA on screen instead of a dead error line.
 */
export function useGeolocation(): GeoState {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<GeoStatus>("checking");
  const [dismissed, setDismissed] = useState(false);

  const request = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) {
      setStatus("insecure");
      return;
    }
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setDismissed(false);
        setStatus("ready");
      },
      async (err) => {
        if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus("unavailable");
          return;
        }
        if (err.code === err.TIMEOUT) {
          setStatus("timeout");
          return;
        }
        // PERMISSION_DENIED covers two different situations: an actual "Block",
        // and a prompt the user dismissed without answering. Only the permission
        // state tells them apart — a dismissal leaves it on "prompt", so we go
        // back to offering the button rather than showing recovery steps.
        const state = await queryPermission();
        if (state === "prompt") {
          setDismissed(true);
          setStatus("prompt");
        } else {
          setStatus("denied");
        }
      },
      OPTIONS
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let permission: PermissionStatus | null = null;

    const apply = (state: PermissionState) => {
      if (cancelled) return;
      // Already granted: no prompt will appear, so fetch without a gesture.
      if (state === "granted") request();
      else if (state === "denied") setStatus("denied");
      else setStatus("prompt");
    };
    const onChange = () => permission && apply(permission.state);

    // Async so the status writes below aren't synchronous effect-body setState.
    void (async () => {
      if (!window.isSecureContext) {
        if (!cancelled) setStatus("insecure");
        return;
      }
      if (!navigator.geolocation) {
        if (!cancelled) setStatus("unavailable");
        return;
      }
      try {
        // No Permissions API (older Safari) throws or returns undefined here;
        // falling back to "prompt" keeps the gesture gate either way — we never
        // fire a dialog the user didn't ask for.
        const p = await navigator.permissions?.query({ name: "geolocation" });
        if (cancelled) return;
        if (!p) {
          setStatus("prompt");
          return;
        }
        permission = p;
        p.addEventListener("change", onChange);
        apply(p.state);
      } catch {
        if (!cancelled) setStatus("prompt");
      }
    })();

    return () => {
      cancelled = true;
      permission?.removeEventListener("change", onChange);
    };
  }, [request]);

  return { coords, status, dismissed, request };
}

async function queryPermission(): Promise<PermissionState | null> {
  try {
    const p = await navigator.permissions?.query({ name: "geolocation" });
    return p?.state ?? null;
  } catch {
    return null;
  }
}
