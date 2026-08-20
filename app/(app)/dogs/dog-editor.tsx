"use client";

import { useActionState, useRef, useState } from "react";

import type { Dog } from "@prisma/client";

import { saveDog, type SaveDogState } from "@/lib/actions/dogs";
import { createDogPhotoUploadUrl } from "@/lib/actions/storage";
import {
  COLOR_HEX,
  TRAIT_DEFS,
  cyclePreference,
  type AttributeCategory,
  type DogAttributes,
  type DogPreferences,
} from "@/lib/dog-attributes";
import { createClient } from "@/lib/supabase/client";

function initialAttrs(dog: Dog | null): DogAttributes {
  return {
    Size: dog?.size ?? "",
    Breed: dog?.breed ?? "",
    Color: dog?.color ?? "",
    Age: dog?.age ?? "",
    Energy: dog?.energy ?? "",
    Gender: dog?.gender ?? "",
  };
}

export function DogEditor({ dog }: { dog: Dog | null }) {
  const [state, formAction, pending] = useActionState<SaveDogState, FormData>(
    saveDog,
    null
  );
  const [attrs, setAttrs] = useState<DogAttributes>(initialAttrs(dog));
  const [preferences, setPreferences] = useState<DogPreferences>(
    (dog?.preferences as DogPreferences | undefined) ?? {}
  );
  const [breedQuery, setBreedQuery] = useState("");
  const [loveBreedQuery, setLoveBreedQuery] = useState("");
  const [name, setName] = useState(dog?.name ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(dog?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const { token, path, publicUrl } = await createDogPhotoUploadUrl(ext);
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("dog-photos")
        .uploadToSignedUrl(path, token, file);
      if (error) throw error;
      setPhotoUrl(publicUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function setAttr(category: AttributeCategory, value: string) {
    setAttrs((prev) => ({ ...prev, [category]: value }));
  }

  function togglePreference(category: AttributeCategory, option: string) {
    const key = `${category}:${option}`;
    setPreferences((prev) => {
      const next = { ...prev };
      const nextValue = cyclePreference(prev[key]);
      if (nextValue === undefined) delete next[key];
      else next[key] = nextValue;
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col">
      {dog && <input type="hidden" name="id" value={dog.id} />}
      <input type="hidden" name="preferences" value={JSON.stringify(preferences)} />
      <input type="hidden" name="photoUrl" value={photoUrl ?? ""} />

      <div className="flex gap-6" style={{ marginBottom: 26 }}>
        <div style={{ flex: "none" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center"
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: photoUrl ? "transparent" : "var(--color-neutral-300)",
              color: "var(--color-neutral-700)",
              fontSize: 11,
              textAlign: "center",
              cursor: "pointer",
              border: "none",
              padding: 0,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : uploading ? (
              "Uploading…"
            ) : (
              "Add photo"
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePhotoChange}
            style={{ display: "none" }}
          />
          {uploadError && (
            <p style={{ color: "var(--color-accent-800)", fontSize: 11, marginTop: 6, maxWidth: 96 }}>
              {uploadError}
            </p>
          )}
        </div>
        <div className="field" style={{ flex: 1, maxWidth: 280 }}>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", marginBottom: 2 }}>
        About {name || "your dog"}
      </div>
      <p className="text-muted" style={{ fontSize: 12, marginBottom: 13 }}>
        Pick one value per category — this is what other owners will match against.
      </p>
      {TRAIT_DEFS.map((group) => (
        <div key={group.name} style={{ marginBottom: 15 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 8,
            }}
          >
            {group.name}
          </div>
          {group.name === "Breed" && (
            <input
              type="text"
              value={breedQuery}
              onChange={(e) => setBreedQuery(e.target.value)}
              placeholder="Search breeds…"
              className="input"
              style={{ maxWidth: 280, marginBottom: 9 }}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {group.options
              .filter((option) =>
                group.name === "Breed"
                  ? option.toLowerCase().includes(breedQuery.toLowerCase())
                  : true
              )
              .map((option) => {
                const selected = attrs[group.name] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAttr(group.name, option)}
                    className="flex items-center"
                    style={{
                      cursor: "pointer",
                      padding: "7px 14px",
                      borderRadius: 999,
                      background: selected ? "var(--color-accent-2-200)" : "var(--color-bg)",
                      border: `1.5px solid ${selected ? "var(--color-accent-2-600)" : "rgba(32,30,29,0.35)"}`,
                      fontSize: 13,
                      color: selected ? "var(--color-accent-2-900)" : "rgba(32,30,29,0.65)",
                    }}
                  >
                    {group.name === "Color" && (
                      <span
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: "50%",
                          flex: "none",
                          background: COLOR_HEX[option] ?? "transparent",
                          border: "1px solid rgba(32,30,29,0.15)",
                          marginRight: 7,
                          display: "inline-block",
                        }}
                      />
                    )}
                    {option}
                  </button>
                );
              })}
          </div>
          <input type="hidden" name={group.name} value={attrs[group.name]} />
        </div>
      ))}

      <div style={{ height: 1, background: "rgba(32,30,29,0.12)", margin: "22px 0" }} />

      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
        Loves &amp; dislikes
      </div>
      <div
        className="flex items-center"
        style={{ gap: 17, fontSize: 12, color: "rgba(32,30,29,0.65)", marginBottom: 17 }}
      >
        <span className="flex items-center gap-2">
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#728157",
              display: "inline-block",
            }}
          />
          Loves
        </span>
        <span className="flex items-center gap-2">
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#8c491a",
              display: "inline-block",
            }}
          />
          Dislikes
        </span>
        <span style={{ color: "rgba(32,30,29,0.4)" }}>— click a trait to cycle</span>
      </div>

      {TRAIT_DEFS.map((group) => (
        <div key={group.name} style={{ marginBottom: 15 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 8,
            }}
          >
            {group.name}
          </div>
          {group.name === "Breed" && (
            <input
              type="text"
              value={loveBreedQuery}
              onChange={(e) => setLoveBreedQuery(e.target.value)}
              placeholder="Search breeds…"
              className="input"
              style={{ maxWidth: 280, marginBottom: 9 }}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {group.options
              .filter((option) =>
                group.name === "Breed"
                  ? option.toLowerCase().includes(loveBreedQuery.toLowerCase())
                  : true
              )
              .map((option) => {
                const key = `${group.name}:${option}`;
                const value = preferences[key];
                const style =
                  value === "love"
                    ? { bg: "#f0fae1", border: "#728157", color: "#3d472b" }
                    : value === "dislike"
                    ? { bg: "#fff2eb", border: "#8c491a", color: "#8c491a" }
                    : { bg: "var(--color-bg)", border: "rgba(32,30,29,0.35)", color: "rgba(32,30,29,0.6)" };
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => togglePreference(group.name, option)}
                    className="flex items-center"
                    style={{
                      cursor: "pointer",
                      padding: "7px 14px",
                      borderRadius: 999,
                      background: style.bg,
                      border: `1.5px solid ${style.border}`,
                      fontSize: 13,
                      color: style.color,
                    }}
                  >
                    {group.name === "Color" && (
                      <span
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: "50%",
                          flex: "none",
                          background: COLOR_HEX[option] ?? "transparent",
                          border: "1px solid rgba(32,30,29,0.15)",
                          marginRight: 7,
                          display: "inline-block",
                        }}
                      />
                    )}
                    {option}
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      {state?.error && (
        <p style={{ color: "var(--color-accent-800)", fontSize: 13, marginBottom: 8 }}>
          {state.error}
        </p>
      )}

      <div className="flex gap-3" style={{ marginTop: 22 }}>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : "Save & continue to map"}
        </button>
      </div>
    </form>
  );
}
