import Link from "next/link";

import type { Dog } from "@prisma/client";

export function DogRail({
  dogs,
  selectedDogId,
}: {
  dogs: Dog[];
  selectedDogId?: string;
}) {
  return (
    <aside
      className="flex flex-col"
      style={{ width: 250, flex: "none", gap: 9 }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-text)",
          opacity: 0.55,
          marginBottom: 4,
        }}
      >
        Your dogs
      </div>
      {dogs.map((dog) => (
        <Link
          key={dog.id}
          href={`/dogs?dog=${dog.id}`}
          className="flex items-center gap-2"
          style={{
            padding: "9px 13px",
            borderRadius: 16,
            background:
              dog.id === selectedDogId ? "var(--color-surface)" : "transparent",
            textDecoration: "none",
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 34,
              height: 34,
              flex: "none",
              borderRadius: "50%",
              background: "var(--color-accent-2-200)",
              color: "var(--color-accent-2-800)",
              fontFamily: "var(--font-heading)",
              fontSize: 13,
            }}
          >
            {dog.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
              {dog.name}
            </div>
            <div style={{ fontSize: 11, opacity: 0.55 }}>{dog.breed}</div>
          </div>
        </Link>
      ))}
      <Link
        href="/dogs?dog=new"
        className="flex items-center justify-center gap-2"
        style={{
          border: "1px solid var(--color-divider)",
          borderRadius: 999,
          padding: "9px 15px",
          fontFamily: "var(--font-heading)",
          fontSize: 13,
          color: "var(--color-text)",
          marginTop: 6,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round">
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
        Add a dog
      </Link>
    </aside>
  );
}
