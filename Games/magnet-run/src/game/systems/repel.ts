import type { Lane, FloorSurfaceKind, StripSegment } from "./course";
import { otherSurface, stripPolarityAt } from "./course";
import type { Polarity } from "./polarity";
import { holds } from "./polarity";

export type RepelOutcome =
  | { landed: "opposite-surface"; surface: FloorSurfaceKind }
  | { landed: "none" };

export function resolveRepelLanding(
  strips: readonly StripSegment[],
  currentSurface: FloorSurfaceKind,
  lane: Lane,
  z: number,
  botPolarity: Polarity,
): RepelOutcome {
  const landingSurface = otherSurface(currentSurface);
  const landingPolarity = stripPolarityAt(strips, landingSurface, lane, z);
  if (landingPolarity !== null && holds(botPolarity, landingPolarity)) {
    return { landed: "opposite-surface", surface: landingSurface };
  }
  return { landed: "none" };
}
