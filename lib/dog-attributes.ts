export type AttributeCategory =
  | "Size"
  | "Breed"
  | "Color"
  | "Age"
  | "Energy"
  | "Gender";

export const TRAIT_DEFS: { name: AttributeCategory; options: string[] }[] = [
  { name: "Size", options: ["Small", "Medium", "Large"] },
  {
    name: "Breed",
    options: [
      "Labrador",
      "Golden Retriever",
      "Poodle",
      "Boxer",
      "Chihuahua",
      "Husky",
      "German Shepherd",
      "French Bulldog",
      "Beagle",
      "Dachshund",
      "Australian Shepherd",
      "Border Collie",
      "Corgi",
      "Shih Tzu",
      "Great Dane",
      "Rottweiler",
      "Doberman",
      "Bulldog",
      "Yorkshire Terrier",
      "Cavalier King Charles",
      "Pit Bull",
      "Mixed Breed",
    ],
  },
  {
    name: "Color",
    options: [
      "Black",
      "Golden",
      "Tan",
      "Brown",
      "White",
      "Cream",
      "Brindle",
      "Merle",
      "Red",
      "Gray",
    ],
  },
  { name: "Age", options: ["Puppy", "Young", "Adult", "Senior"] },
  { name: "Energy", options: ["Calm", "Moderate", "Playful", "High-energy"] },
  { name: "Gender", options: ["Male", "Female"] },
];

export const COLOR_HEX: Record<string, string> = {
  Black: "#2e2b25",
  White: "#f9f4ed",
  Golden: "#f6a06b",
  Tan: "#dcb98a",
  Brown: "#8c491a",
  Cream: "#f0e6d2",
  Brindle: "#6b4a2f",
  Merle: "#8fa0ad",
  Red: "#a63b23",
  Gray: "#a19786",
};

export type TraitValue = "love" | "dislike";

export type DogAttributes = {
  Size: string;
  Breed: string;
  Color: string;
  Age: string;
  Energy: string;
  Gender: string;
};

export type DogPreferences = Record<string, TraitValue>;

export function cyclePreference(current: TraitValue | undefined): TraitValue | undefined {
  if (current === undefined) return "love";
  if (current === "love") return "dislike";
  return undefined;
}
