"use client";

import { motion, useReducedMotion } from "motion/react";

import { springSnappy } from "@/lib/motion";

import type { ViewMode } from "./shared";

const OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "browse", label: "Browse" },
  { value: "map", label: "Map" },
];

export function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="view-toggle" role="tablist" aria-label="View mode">
      {OPTIONS.map((opt) => {
        const active = view === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`view-toggle__opt${active ? " is-active" : ""}`}
          >
            {active && (
              <motion.span
                layoutId="view-toggle-pill"
                className="view-toggle__pill"
                transition={reduce ? { duration: 0 } : springSnappy}
              />
            )}
            <span className="view-toggle__label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
