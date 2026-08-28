import type { Transition, Variants } from "motion/react";

/**
 * Shared motion vocabulary for the UI refresh (specs.md §13, architecture.md §12).
 *
 * One tuning point for the whole app — the same way lib/grading.ts is the one
 * place grading rules live. Components import from here instead of inlining
 * `transition={{ ... }}` / `variants={{ ... }}` so timing stays consistent and
 * adjustable in a single file.
 *
 * Duration numbers mirror the CSS tokens in the Organic system
 * (`--dur-fast` / `--dur-base` / `--dur-slow`); springs have no CSS equivalent
 * and only exist here.
 */

export const DURATION = {
  fast: 0.14,
  base: 0.24,
  slow: 0.4,
} as const;

// cubic-bezier(0.22, 1, 0.36, 1) — matches --ease-out in the tokens file.
export const EASE_OUT: Transition["ease"] = [0.22, 1, 0.36, 1];

/** Gentle settle — panels, cards, the session payoff card. */
export const springSoft: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 30,
  mass: 1,
};

/** Quick, low-overshoot — chips, taps, small toggles. */
export const springSnappy: Transition = {
  type: "spring",
  stiffness: 480,
  damping: 32,
  mass: 0.7,
};

/** Fade + small upward rise. Use for mount/enter of a single element. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: 8, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/**
 * Parent variant for a list whose children each use `fadeRise` (or an
 * equivalent hidden/visible pair). Keep the stagger envelope short so long
 * lists don't trail far behind the data (specs.md §13.5).
 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

/** Route-transition wrapper (app/(app)/template.tsx). */
export const routeTransition: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
};

/**
 * Reduced-motion fallbacks — opacity only, no transform, near-instant. Pair
 * with `useReducedMotion()` at the call site:
 *
 *   const reduce = useReducedMotion();
 *   <motion.div variants={reduce ? reducedFade : fadeRise} .../>
 */
export const reducedFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

export const reducedNone: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
  exit: { opacity: 1 },
};
