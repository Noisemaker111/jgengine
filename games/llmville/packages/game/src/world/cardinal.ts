/**
 * Room-facing directions on the build/map grid.
 *
 * North (+Z) is toward the tier front door. East is +X, South is -Z, West is -X.
 * Stored as 0–3 quarter-turns; 0 = North.
 */

export const CARDINAL = {
  N: 0,
  E: 1,
  S: 2,
  W: 3,
} as const;

export type CardinalDirection = (typeof CARDINAL)[keyof typeof CARDINAL];
export type CardinalLabel = keyof typeof CARDINAL;

export const CARDINAL_LABELS: readonly CardinalLabel[] = ["N", "E", "S", "W"];

/** @deprecated Use CardinalDirection — same values, clearer name. */
export type GridDirection = CardinalDirection;

/** @deprecated Use CardinalDirection */
export type BuildDirection = CardinalDirection;

export function cardinalToRotationY(direction: CardinalDirection | undefined): number {
  return (direction ?? CARDINAL.N) * (Math.PI / 2);
}

export function rotationYToCardinal(rotationY: number): CardinalDirection {
  const quarter = Math.round(rotationY / (Math.PI / 2));
  return ((quarter % 4) + 4) % 4 as CardinalDirection;
}

export function cardinalLabel(direction: CardinalDirection | undefined): CardinalLabel {
  return CARDINAL_LABELS[direction ?? CARDINAL.N] ?? "N";
}

export function parseCardinal(value: CardinalLabel | CardinalDirection | string | number | null | undefined): CardinalDirection {
  if (value === null || value === undefined) return CARDINAL.N;
  if (typeof value === "number") {
    const normalized = ((Math.round(value) % 4) + 4) % 4;
    return normalized as CardinalDirection;
  }
  const upper = String(value).trim().toUpperCase();
  if (upper === "N" || upper === "NORTH" || upper === "0") return CARDINAL.N;
  if (upper === "E" || upper === "EAST" || upper === "1") return CARDINAL.E;
  if (upper === "S" || upper === "SOUTH" || upper === "2") return CARDINAL.S;
  if (upper === "W" || upper === "WEST" || upper === "3") return CARDINAL.W;
  return CARDINAL.N;
}

export function formatFacing(direction: CardinalDirection | undefined): string {
  return `Facing ${cardinalLabel(direction)}`;
}
