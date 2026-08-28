"use client";

import { motion, useReducedMotion } from "motion/react";

import { fadeRise, reducedFade } from "@/lib/motion";

/** Fade + rise the auth form in on mount (specs §13.2 — light touch). */
export function AuthCard({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      style={{ width: "100%", maxWidth: 360 }}
      variants={reduce ? reducedFade : fadeRise}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}
