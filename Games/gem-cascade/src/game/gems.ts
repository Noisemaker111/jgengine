export type Point = readonly [number, number];

export interface GemDef {
  readonly id: number;
  readonly name: string;
  readonly shape: string;
  readonly base: string;
  readonly light: string;
  readonly dark: string;
  /** Silhouette in a 0..100 viewBox — the colour-blind-safe identity of the gem. */
  readonly outline: readonly Point[];
}

const kite: Point[] = [
  [50, 3],
  [93, 40],
  [50, 97],
  [7, 40],
];

const octagon: Point[] = [
  [50, 4],
  [82, 18],
  [96, 50],
  [82, 82],
  [50, 96],
  [18, 82],
  [4, 50],
  [18, 18],
];

const stepRect: Point[] = [
  [26, 8],
  [74, 8],
  [92, 26],
  [92, 74],
  [74, 92],
  [26, 92],
  [8, 74],
  [8, 26],
];

const trillion: Point[] = [
  [50, 7],
  [93, 86],
  [7, 86],
];

const marquise: Point[] = [
  [50, 4],
  [66, 26],
  [72, 50],
  [66, 74],
  [50, 96],
  [34, 74],
  [28, 50],
  [34, 26],
];

const pear: Point[] = [
  [50, 5],
  [66, 20],
  [78, 40],
  [82, 60],
  [74, 80],
  [50, 95],
  [26, 80],
  [18, 60],
  [22, 40],
  [34, 20],
];

const hexagon: Point[] = [
  [50, 4],
  [92, 28],
  [92, 72],
  [50, 96],
  [8, 72],
  [8, 28],
];

export const GEMS: readonly GemDef[] = [
  { id: 0, name: "Ruby", shape: "kite", base: "#e11d48", light: "#fb7185", dark: "#881337", outline: kite },
  { id: 1, name: "Sapphire", shape: "octagon", base: "#2563eb", light: "#60a5fa", dark: "#1e3a8a", outline: octagon },
  { id: 2, name: "Emerald", shape: "step", base: "#10b981", light: "#6ee7b7", dark: "#065f46", outline: stepRect },
  { id: 3, name: "Citrine", shape: "trillion", base: "#f59e0b", light: "#fcd34d", dark: "#92400e", outline: trillion },
  { id: 4, name: "Amethyst", shape: "marquise", base: "#a855f7", light: "#d8b4fe", dark: "#6b21a8", outline: marquise },
  { id: 5, name: "Topaz", shape: "pear", base: "#f97316", light: "#fdba74", dark: "#9a3412", outline: pear },
  { id: 6, name: "Aquamarine", shape: "hexagon", base: "#06b6d4", light: "#67e8f9", dark: "#155e75", outline: hexagon },
];

export const GEM_COUNT = GEMS.length;
