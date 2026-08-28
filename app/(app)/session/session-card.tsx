"use client";

import { motion, useReducedMotion } from "motion/react";

import { startConversationAction } from "@/lib/actions/chat";
import { fadeRise, reducedFade, springSoft, staggerContainer } from "@/lib/motion";
import type { DogMatch } from "@/lib/grading";

export function SessionCard({
  parkName,
  checkedInLabel,
  alsoHere,
  me,
  endSession,
}: {
  parkName: string;
  checkedInLabel: string;
  alsoHere: DogMatch[];
  me: string;
  endSession: (formData: FormData) => void | Promise<void>;
}) {
  const reduce = !!useReducedMotion();

  return (
    <motion.div
      className="card elev-lg"
      style={{ width: "100%", maxWidth: 420 }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={springSoft}
    >
      <motion.div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          background: "var(--color-accent-2-100)",
          color: "var(--color-accent-2-800)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "5px 12px",
          borderRadius: 999,
          marginBottom: 12,
        }}
        animate={reduce ? undefined : { opacity: [1, 0.72, 1] }}
        transition={reduce ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      >
        Checked in now
      </motion.div>
      <div className="card-title" style={{ fontSize: 24, marginBottom: 4 }}>
        {parkName}
      </div>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 17 }}>
        {checkedInLabel}
      </p>

      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.5,
          marginBottom: 8,
        }}
      >
        Also here now
      </div>
      {alsoHere.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>No other dogs checked in right now.</p>
      ) : (
        <motion.div
          className="flex flex-col gap-2"
          style={{ marginBottom: 17 }}
          variants={reduce ? { hidden: {}, visible: {} } : staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {alsoHere.map((match) => (
            <motion.div key={match.dogId} variants={reduce ? reducedFade : fadeRise}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{match.name} · {match.breed}</div>
              <div
                style={{
                  fontSize: 12,
                  color:
                    match.sign === "love"
                      ? "#3d472b"
                      : match.sign === "dislike"
                      ? "#8c491a"
                      : "rgba(32,30,29,0.6)",
                }}
              >
                {match.reason}
              </div>
              {match.ownerId && match.ownerId !== me && (
                <form action={startConversationAction}>
                  <input type="hidden" name="to" value={match.ownerId} />
                  <button type="submit" className="chat-msg-owner">
                    Message owner
                  </button>
                </form>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      <form action={endSession}>
        <button type="submit" className="btn btn-secondary btn-block">
          End session
        </button>
      </form>
    </motion.div>
  );
}
