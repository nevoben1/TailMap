"use client";

import { motion, useReducedMotion } from "motion/react";

import { reducedNone, routeTransition } from "@/lib/motion";

/**
 * Route transition for the authenticated app (specs.md §13.2, architecture.md §12.5).
 *
 * A template re-mounts on navigation (unlike a layout), so `initial`/`animate`
 * replay on every route change — a short cross-fade + rise. No exit animation:
 * App Router templates have no exit hook. Renders children directly; introduces
 * no data boundary.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="flex-1 flex flex-col"
      style={{ minHeight: 0 }}
      variants={reduce ? reducedNone : routeTransition}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}
