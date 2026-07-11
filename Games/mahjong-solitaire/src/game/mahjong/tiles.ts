// Tile faces and match rules. A face is a string id; the multiset of 144 faces
// is the canonical mahjong set. Match rule: identical faces match; any flower
// matches any flower; any season matches any season.

export type FaceGroup = "suit" | "wind" | "dragon" | "flower" | "season";

export const SUITS = ["dots", "bamboo", "characters"] as const;
export type SuitId = (typeof SUITS)[number];

export function groupOf(id: string): FaceGroup {
  if (id.startsWith("wind-")) return "wind";
  if (id.startsWith("dragon-")) return "dragon";
  if (id.startsWith("flower-")) return "flower";
  if (id.startsWith("season-")) return "season";
  return "suit";
}

export function matchable(a: string, b: string): boolean {
  if (a === b) return true;
  const ga = groupOf(a);
  if (ga !== groupOf(b)) return false;
  return ga === "flower" || ga === "season";
}

// 72 matched pairs covering all 144 faces. Suits/winds/dragons pair identicals;
// the four distinct flowers and four distinct seasons pair within their group.
export function buildPairs(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const suit of SUITS) {
    for (let r = 1; r <= 9; r += 1) {
      const f = `${suit}-${r}`;
      pairs.push([f, f]);
      pairs.push([f, f]);
    }
  }
  for (const w of ["e", "s", "w", "n"]) {
    const f = `wind-${w}`;
    pairs.push([f, f]);
    pairs.push([f, f]);
  }
  for (const d of ["red", "green", "white"]) {
    const f = `dragon-${d}`;
    pairs.push([f, f]);
    pairs.push([f, f]);
  }
  pairs.push(["flower-plum", "flower-orchid"]);
  pairs.push(["flower-mum", "flower-bamboo"]);
  pairs.push(["season-spring", "season-summer"]);
  pairs.push(["season-autumn", "season-winter"]);
  return pairs;
}

export const ALL_FACES: readonly string[] = buildPairs().flat();

export const SUIT_ACCENT: Record<SuitId, string> = {
  dots: "#1f7a8c",
  bamboo: "#2f8f4e",
  characters: "#b3322c",
};

export function accentOf(id: string): string {
  const group = groupOf(id);
  if (group === "suit") return SUIT_ACCENT[id.split("-")[0] as SuitId];
  if (group === "wind") return "#33506b";
  if (group === "dragon") {
    if (id === "dragon-red") return "#c0392b";
    if (id === "dragon-green") return "#2e8b57";
    return "#2f5d8a";
  }
  if (group === "flower") return "#c65a86";
  return "#b06a2c";
}
