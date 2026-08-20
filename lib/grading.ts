import type { DogAttributes, TraitValue } from "@/lib/dog-attributes";

const CATEGORIES: (keyof DogAttributes)[] = [
  "Size",
  "Breed",
  "Color",
  "Age",
  "Energy",
  "Gender",
];

// specs.md §5.4 flags the scaling factor as an open tuning parameter (range 1.0–1.5).
// Picked the midpoint; revisit once there's real check-in volume to tune against.
const SCALING_FACTOR = 1.2;

export type CheckedInDog = {
  id: string;
  name: string;
  breed: string;
  size: string;
  color: string;
  age: string;
  energy: string;
  gender: string;
};

export type ParkGrade = {
  grade: number;
  tier: "good" | "mid" | "low";
  reason: string;
};

export type DogMatch = {
  dogId: string;
  name: string;
  breed: string;
  sign: TraitValue | "neutral";
  reason: string;
};

function attrValue(dog: CheckedInDog, category: keyof DogAttributes): string {
  const key = category.toLowerCase() as keyof CheckedInDog;
  return dog[key] as string;
}

type ScoredDog = {
  dog: CheckedInDog;
  contribution: number;
  matches: { category: string; value: string; sign: TraitValue }[];
};

function scoreDog(
  preferences: Record<string, TraitValue>,
  dog: CheckedInDog
): ScoredDog {
  let contribution = 0;
  const matches: ScoredDog["matches"] = [];

  for (const category of CATEGORIES) {
    const value = attrValue(dog, category);
    const pref = preferences[`${category}:${value}`];
    if (pref === "love") {
      contribution += 1;
      matches.push({ category, value, sign: "love" });
    } else if (pref === "dislike") {
      contribution -= 1;
      matches.push({ category, value, sign: "dislike" });
    }
  }

  return { dog, contribution, matches };
}

function describeMatch(scored: ScoredDog): { sign: TraitValue | "neutral"; reason: string } {
  if (scored.contribution === 0) {
    return { sign: "neutral", reason: `${scored.dog.name} (${scored.dog.breed})` };
  }
  const sign: TraitValue = scored.contribution > 0 ? "love" : "dislike";
  const values = scored.matches.filter((m) => m.sign === sign).map((m) => m.value);
  const verb = sign === "love" ? "loves" : "tends to avoid";
  return { sign, reason: `${values.join(" & ")} — a trait your dog ${verb}` };
}

/**
 * specs.md §5 — computed on read from active check-ins, never persisted.
 * Returns null for the distinct empty state (§5.7) when no other dogs are checked in.
 */
export function computeParkGrade(
  viewingDogId: string,
  viewingDogPreferences: Record<string, TraitValue>,
  checkedInDogs: CheckedInDog[]
): ParkGrade | null {
  const others = checkedInDogs.filter((d) => d.id !== viewingDogId);
  if (others.length === 0) return null;

  let rawScore = 0;
  let topScored: ScoredDog | null = null;

  for (const dog of others) {
    const scored = scoreDog(viewingDogPreferences, dog);
    rawScore += scored.contribution;
    if (!topScored || Math.abs(scored.contribution) > Math.abs(topScored.contribution)) {
      topScored = scored;
    }
  }

  const grade = Math.min(10, Math.max(0, 5 + rawScore * SCALING_FACTOR));
  const tier: ParkGrade["tier"] = grade >= 8 ? "good" : grade >= 5 ? "mid" : "low";

  const reason =
    topScored && topScored.contribution !== 0
      ? `${topScored.dog.name} is here — ${describeMatch(topScored).reason}`
      : `${others.length} ${others.length === 1 ? "dog is" : "dogs are"} here now`;

  return { grade: Math.round(grade * 10) / 10, tier, reason };
}

/** Per-dog breakdown for the "who's here now" list (specs.md §8 Map / Park detail popover). */
export function describeCheckedInDogs(
  viewingDogId: string,
  viewingDogPreferences: Record<string, TraitValue>,
  checkedInDogs: CheckedInDog[]
): DogMatch[] {
  return checkedInDogs
    .filter((d) => d.id !== viewingDogId)
    .map((dog) => {
      const scored = scoreDog(viewingDogPreferences, dog);
      const { sign, reason } = describeMatch(scored);
      return { dogId: dog.id, name: dog.name, breed: dog.breed, sign, reason };
    });
}
