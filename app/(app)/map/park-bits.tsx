"use client";

import { motion } from "motion/react";

import { springSnappy } from "@/lib/motion";

export function FavoriteHeart({
  filled,
  onClick,
}: {
  filled: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={filled ? "Remove from saved" : "Save park"}
      style={{ cursor: "pointer", background: "none", border: "none", padding: 0, flex: "none" }}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill={filled ? "var(--color-accent)" : "none"}
        stroke={filled ? "var(--color-accent)" : "rgba(32,30,29,0.55)"}
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.04 3 5.5l7 7Z" />
      </svg>
    </button>
  );
}

/** Grade badge — pops in and re-pops when its value changes (specs §13.2). */
export function GradePill({
  grade,
  tier,
  reduce,
}: {
  grade: number;
  tier: string;
  reduce: boolean;
}) {
  const text = grade.toFixed(1);
  const className = `grade-pill grade-pill--${tier}`;
  if (reduce) return <div className={className}>{text}</div>;
  return (
    <motion.div
      key={text}
      className={className}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springSnappy}
    >
      {text}
    </motion.div>
  );
}
