import { describe, expect, it } from "vitest";

import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then rejects", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
    }
    const result = checkRateLimit(key, 5, 60_000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    const keyA = `a-${Math.random()}`;
    const keyB = `b-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(keyA, 3, 60_000);
    expect(checkRateLimit(keyA, 3, 60_000).allowed).toBe(false);
    expect(checkRateLimit(keyB, 3, 60_000).allowed).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const key = `reset-${Math.random()}`;
    expect(checkRateLimit(key, 1, 50).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 50).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(checkRateLimit(key, 1, 50).allowed).toBe(true);
  });
});
