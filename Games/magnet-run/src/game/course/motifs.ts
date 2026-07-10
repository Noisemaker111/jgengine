import type { FloorSurfaceKind, GateSegment, Lane, StripSegment } from "../systems/course";
import { opposite, type Polarity } from "../systems/polarity";

const ALL_LANES: readonly Lane[] = [0, 1, 2];

export function straightStrip(
  fromZ: number,
  toZ: number,
  lanes: readonly Lane[],
  surface: FloorSurfaceKind,
  polarity: Polarity,
): StripSegment[] {
  return lanes.map((lane) => ({ surface, lane, fromZ, toZ, polarity }));
}

export function singleLaneGap(
  fromZ: number,
  toZ: number,
  gapLane: Lane,
  surface: FloorSurfaceKind,
  polarity: Polarity,
): StripSegment[] {
  return ALL_LANES.filter((lane) => lane !== gapLane).map((lane) => ({ surface, lane, fromZ, toZ, polarity }));
}

export function laneWeave(
  fromZ: number,
  toZ: number,
  openLanes: readonly Lane[],
  surface: FloorSurfaceKind,
  polarity: Polarity,
): StripSegment[] {
  return openLanes.map((lane) => ({ surface, lane, fromZ, toZ, polarity }));
}

export function polarityFlipCall(
  fromZ: number,
  flipAtZ: number,
  toZ: number,
  lanes: readonly Lane[],
  surface: FloorSurfaceKind,
  firstPolarity: Polarity,
): StripSegment[] {
  const second = opposite(firstPolarity);
  return lanes.flatMap((lane) => [
    { surface, lane, fromZ, toZ: flipAtZ, polarity: firstPolarity },
    { surface, lane, fromZ: flipAtZ, toZ, polarity: second },
  ]);
}

export function checkerboard(
  fromZ: number,
  toZ: number,
  surface: FloorSurfaceKind,
  cellLength: number,
  startPolarity: Polarity,
): StripSegment[] {
  const segments: StripSegment[] = [];
  let cellIndex = 0;
  for (let z = fromZ; z < toZ; z += cellLength) {
    const rowEnd = Math.min(toZ, z + cellLength);
    for (const lane of ALL_LANES) {
      const flip = (cellIndex + lane) % 2 === 1;
      segments.push({
        surface,
        lane,
        fromZ: z,
        toZ: rowEnd,
        polarity: flip ? opposite(startPolarity) : startPolarity,
      });
    }
    cellIndex += 1;
  }
  return segments;
}

export function polarityGate(
  z: number,
  lane: Lane,
  surface: FloorSurfaceKind,
  requires: Polarity,
  width = 1.2,
): GateSegment[] {
  return [{ surface, lane, z, width, requires }];
}

export function deadEndRepel(
  fromZ: number,
  toZ: number,
  trapPolarity: Polarity,
): { strips: StripSegment[]; ceilingReliefFromZ: number; ceilingReliefToZ: number } {
  const strips: StripSegment[] = [
    ...straightStrip(fromZ, toZ, ALL_LANES, "floor", trapPolarity),
    ...straightStrip(fromZ - 6, toZ + 10, ALL_LANES, "ceiling", opposite(trapPolarity)),
  ];
  return { strips, ceilingReliefFromZ: fromZ - 6, ceilingReliefToZ: toZ + 10 };
}

export function doubleGateCombo(
  z: number,
  gap: number,
  firstLane: Lane,
  secondLane: Lane,
  surface: FloorSurfaceKind,
  firstRequires: Polarity,
  secondRequires: Polarity,
): GateSegment[] {
  return [
    ...polarityGate(z, firstLane, surface, firstRequires),
    ...polarityGate(z + gap, secondLane, surface, secondRequires),
  ];
}

export function trainDesert(fromZ: number, toZ: number, boardableLanes: readonly Lane[]): readonly StripSegment[] {
  if (fromZ >= toZ) throw new Error("trainDesert: fromZ must be before toZ");
  if (boardableLanes.length === 0) throw new Error("trainDesert: needs at least one boardable train lane");
  return [];
}
