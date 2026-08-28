import { describe, expect, it } from "vitest";

import { computeParkGrade, describeCheckedInDogs, type CheckedInDog } from "@/lib/grading";

function dog(overrides: Partial<CheckedInDog> & { id: string; name: string }): CheckedInDog {
  return {
    breed: "Labrador",
    size: "Medium",
    color: "Black",
    age: "Adult",
    energy: "Moderate",
    gender: "Male",
    ...overrides,
  };
}

describe("computeParkGrade", () => {
  it("returns null (empty state) when no other dogs are checked in — specs.md §5.7", () => {
    expect(computeParkGrade("viewer", {}, [])).toBeNull();
  });

  it("excludes the viewing dog itself from scoring", () => {
    const viewer = dog({ id: "viewer", name: "Bella", size: "Large" });
    expect(computeParkGrade("viewer", { "Size:Large": "dislike" }, [viewer])).toBeNull();
  });

  it("scores a pure love match above neutral (5) and tiers correctly", () => {
    const other = dog({ id: "milo", name: "Milo", size: "Large" });
    const result = computeParkGrade("viewer", { "Size:Large": "love" }, [other]);
    expect(result).not.toBeNull();
    expect(result!.grade).toBeGreaterThan(5);
    expect(result!.reason).toContain("Milo");
    expect(result!.reason).toContain("loves");
  });

  it("scores a pure dislike match below neutral (5)", () => {
    const other = dog({ id: "shadow", name: "Shadow", color: "Black" });
    const result = computeParkGrade("viewer", { "Color:Black": "dislike" }, [other]);
    expect(result).not.toBeNull();
    expect(result!.grade).toBeLessThan(5);
    expect(result!.reason).toContain("Shadow");
  });

  it("cancels out to neutral (5) when love and dislike contributions offset", () => {
    const other = dog({ id: "milo", name: "Milo", size: "Large", color: "Black" });
    const result = computeParkGrade(
      "viewer",
      { "Size:Large": "love", "Color:Black": "dislike" },
      [other]
    );
    expect(result!.grade).toBe(5);
    expect(result!.tier).toBe("mid");
  });

  it("sums contributions across multiple checked-in dogs", () => {
    const dogs = [
      dog({ id: "a", name: "A", breed: "Golden Retriever" }),
      dog({ id: "b", name: "B", breed: "Golden Retriever" }),
    ];
    const result = computeParkGrade("viewer", { "Breed:Golden Retriever": "love" }, dogs);
    // raw score = +2, grade = 5 + 2*1.2 = 7.4
    expect(result!.grade).toBe(7.4);
  });

  it("a dog can contribute more than once via multiple matching attributes", () => {
    const other = dog({ id: "milo", name: "Milo", breed: "Golden Retriever", color: "Golden" });
    const result = computeParkGrade(
      "viewer",
      { "Breed:Golden Retriever": "love", "Color:Golden": "love" },
      [other]
    );
    // raw score = +2 from one dog, grade = 5 + 2*1.2 = 7.4
    expect(result!.grade).toBe(7.4);
  });

  it("clamps grade to [0, 10]", () => {
    const dogs = Array.from({ length: 10 }, (_, i) =>
      dog({ id: `d${i}`, name: `D${i}`, size: "Large" })
    );
    const good = computeParkGrade("viewer", { "Size:Large": "love" }, dogs);
    expect(good!.grade).toBeLessThanOrEqual(10);

    const bad = computeParkGrade("viewer", { "Size:Large": "dislike" }, dogs);
    expect(bad!.grade).toBeGreaterThanOrEqual(0);
  });

  it("tier boundaries: good >= 8, mid 5–8, low < 5 — specs.md §5.5", () => {
    // Exactly 3 love-only dogs -> 5 + 3*1.2 = 8.6 (good)
    const threeLove = Array.from({ length: 3 }, (_, i) =>
      dog({ id: `l${i}`, name: `L${i}`, size: "Large" })
    );
    expect(computeParkGrade("viewer", { "Size:Large": "love" }, threeLove)!.tier).toBe("good");

    // One love-only dog -> 5 + 1*1.2 = 6.2 (mid)
    const oneLove = [dog({ id: "l0", name: "L0", size: "Large" })];
    expect(computeParkGrade("viewer", { "Size:Large": "love" }, oneLove)!.tier).toBe("mid");

    // One dislike-only dog -> 5 - 1.2 = 3.8 (low)
    const oneDislike = [dog({ id: "d0", name: "D0", size: "Large" })];
    expect(
      computeParkGrade("viewer", { "Size:Large": "dislike" }, oneDislike)!.tier
    ).toBe("low");
  });

  it("reason string names the dog with the highest |contribution|", () => {
    const dogs = [
      dog({ id: "weak", name: "Weak", size: "Large" }), // +1
      dog({ id: "strong", name: "Strong", size: "Large", breed: "Golden Retriever", color: "Golden" }), // +3
    ];
    const result = computeParkGrade(
      "viewer",
      { "Size:Large": "love", "Breed:Golden Retriever": "love", "Color:Golden": "love" },
      dogs
    );
    expect(result!.reason).toContain("Strong");
  });
});

describe("describeCheckedInDogs", () => {
  it("excludes the viewing dog and labels sign per dog", () => {
    const viewer = dog({ id: "viewer", name: "Viewer" });
    const lover = dog({ id: "lover", name: "Lover", size: "Large", color: "White" });
    const hater = dog({ id: "hater", name: "Hater", color: "Black" });
    const neutral = dog({ id: "neutral", name: "Neutral", breed: "Poodle", color: "White" });

    const result = describeCheckedInDogs(
      "viewer",
      { "Size:Large": "love", "Color:Black": "dislike" },
      [viewer, lover, hater, neutral]
    );

    expect(result).toHaveLength(3);
    expect(result.find((d) => d.dogId === "lover")!.sign).toBe("love");
    expect(result.find((d) => d.dogId === "hater")!.sign).toBe("dislike");
    expect(result.find((d) => d.dogId === "neutral")!.sign).toBe("neutral");
  });
});
