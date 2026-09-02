"use client";

import type { GeoStatus } from "./use-geolocation";

type Copy = { title: string; body: string; action: string | null };

function copyFor(status: GeoStatus, dismissed: boolean): Copy | null {
  switch (status) {
    case "prompt":
      return {
        title: "See parks near you",
        body: dismissed
          ? "The browser's location prompt closed without an answer. Tap below and choose Allow."
          : "Tailmap uses your location to find dog parks nearby. Nothing is shared with other users.",
        action: dismissed ? "Try again" : "Enable location",
      };
    case "denied":
      return {
        title: "Location is blocked",
        body: "Your browser is blocking location for this site. Open the permission icon next to the address bar, set Location to Allow, then retry.",
        action: "Retry",
      };
    case "timeout":
      return {
        title: "Couldn't get a location in time",
        body: "Your device took too long to respond. This usually clears up on a second try.",
        action: "Retry",
      };
    case "unavailable":
      return {
        title: "Location unavailable",
        body: "This browser or device couldn't provide a location fix.",
        action: "Retry",
      };
    case "insecure":
      return {
        title: "Secure connection required",
        body: "Browsers only share location over https. Open Tailmap on its https address.",
        action: null,
      };
    // "checking" and "locating" are transient, "ready" needs no gate — the
    // existing skeletons cover those.
    default:
      return null;
  }
}

/**
 * Everything the viewer sees when we don't have coords. The action button is
 * what actually triggers getCurrentPosition, so the browser prompt is always
 * raised by a click the user just made (see use-geolocation.ts).
 */
export function LocationGate({
  status,
  dismissed,
  onRequest,
  className,
}: {
  status: GeoStatus;
  dismissed: boolean;
  onRequest: () => void;
  className?: string;
}) {
  const copy = copyFor(status, dismissed);
  if (!copy) return null;

  return (
    <div className={`card location-gate${className ? ` ${className}` : ""}`} role="status">
      <div className="card-title">{copy.title}</div>
      <p className="text-muted" style={{ fontSize: 13 }}>
        {copy.body}
      </p>
      {copy.action && (
        <button type="button" className="btn btn-primary" onClick={onRequest}>
          {copy.action}
        </button>
      )}
    </div>
  );
}
