"use client";

import { useActionState, useState } from "react";

import { saveSettings, type SaveSettingsState } from "@/lib/actions/settings";
import type { Settings } from "@prisma/client";

// discoveryRadius is stored in miles (architecture.md §3) regardless of display unit.
// Each option pairs the canonical mile value with its rounded km label.
const RADII = [
  { miles: 1, kmLabel: 2 },
  { miles: 3, kmLabel: 5 },
  { miles: 5, kmLabel: 8 },
  { miles: 10, kmLabel: 16 },
];
const EXPIRY_HOURS = [1, 2, 3, 6, 12, 24];

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState<SaveSettingsState, FormData>(
    saveSettings,
    null
  );
  const [unit, setUnit] = useState<"mi" | "km">(settings.distanceUnit === "km" ? "km" : "mi");

  return (
    <form action={formAction} className="flex flex-col" style={{ gap: 22 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Discovery radius</div>
        <div className="seg">
          {RADII.map((opt) => (
            <label key={opt.miles} className="seg-opt">
              <input
                type="radio"
                name="discoveryRadius"
                value={opt.miles}
                defaultChecked={settings.discoveryRadius === opt.miles}
              />
              {unit === "mi" ? `${opt.miles} mi` : `${opt.kmLabel} km`}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Distance units</div>
        <div className="seg">
          <label className="seg-opt">
            <input
              type="radio"
              name="distanceUnit"
              value="mi"
              checked={unit === "mi"}
              onChange={() => setUnit("mi")}
            />
            Miles
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="distanceUnit"
              value="km"
              checked={unit === "km"}
              onChange={() => setUnit("km")}
            />
            Kilometers
          </label>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Check-in expiry duration
        </div>
        <div className="seg" style={{ flexWrap: "wrap" }}>
          {EXPIRY_HOURS.map((hours) => (
            <label key={hours} className="seg-opt">
              <input
                type="radio"
                name="checkInExpiryHours"
                value={hours}
                defaultChecked={settings.checkInExpiryHours === hours}
              />
              {hours}h
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Messages</div>
        <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            name="notifyEmail"
            defaultChecked={settings.notifyEmail}
          />
          Email me about unread messages
        </label>
      </div>

      {state?.error && (
        <p style={{ color: "var(--color-accent-800)", fontSize: 13 }}>{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
