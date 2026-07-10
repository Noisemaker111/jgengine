import { seededRng } from "@jgengine/core/random/rng";

import {
  BRIDGE_PILLAR_OBJECT,
  GATE_ARCH_OBJECT,
  GRANDSTAND_OBJECT,
  PYLON_OBJECT,
  SPECTATOR_BLOCK_OBJECT,
} from "../objects/catalog";
import { GRID_VIOLET, LOOP_TEAL, TAPE_MAGENTA } from "./palette";
import {
  buildLap,
  lapLength,
  sampleAtDistance,
  zoneRange,
  LANE_HALF_WIDTH,
  MAIN_LANES,
  TRACK_SEED,
} from "./geometry";

export interface PlacedProp {
  catalogId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  color: string;
  scale: readonly [number, number, number];
}

const PYLON_SPACING = 8;
const PYLON_OFFSET = LANE_HALF_WIDTH + 1.5;

function pylonsAlong(distances: readonly number[], offsetSign: 1 | -1, segments: ReturnType<typeof buildLap>): PlacedProp[] {
  return distances.map((distance, index) => {
    const sample = sampleAtDistance(segments, distance);
    const nx = Math.cos(sample.headingRad);
    const nz = -Math.sin(sample.headingRad);
    const color = index % 2 === 0 ? TAPE_MAGENTA : LOOP_TEAL;
    return {
      catalogId: PYLON_OBJECT,
      x: sample.x + nx * PYLON_OFFSET * offsetSign,
      y: sample.y,
      z: sample.z + nz * PYLON_OFFSET * offsetSign,
      rotationY: sample.headingRad,
      color,
      scale: [0.4, 3, 0.4] as const,
    };
  });
}

function distanceRange(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let d = start; d < end; d += step) out.push(d);
  return out;
}

function gateArch(distance: number, segments: ReturnType<typeof buildLap>, color: string): PlacedProp {
  const sample = sampleAtDistance(segments, distance);
  return {
    catalogId: GATE_ARCH_OBJECT,
    x: sample.x,
    y: sample.y + 2,
    z: sample.z,
    rotationY: sample.headingRad,
    color,
    scale: [LANE_HALF_WIDTH * 2 + 1, 4.5, 0.6] as const,
  };
}

function grandstandCluster(
  center: readonly [number, number],
  facingRad: number,
  rng: () => number,
  index: number,
): PlacedProp[] {
  const props: PlacedProp[] = [];
  props.push({
    catalogId: GRANDSTAND_OBJECT,
    x: center[0],
    y: 0,
    z: center[1],
    rotationY: facingRad,
    color: GRID_VIOLET,
    scale: [11, 4, 3.5] as const,
  });
  const nx = Math.cos(facingRad);
  const nz = -Math.sin(facingRad);
  const tx = Math.sin(facingRad);
  const tz = Math.cos(facingRad);
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const jitter = (rng() - 0.5) * 0.6;
      const along = (col - 2) * 2 + jitter;
      const forward = 1.6 + row * 1.1;
      props.push({
        catalogId: SPECTATOR_BLOCK_OBJECT,
        x: center[0] + nx * forward + tx * along,
        y: 0.6 + row * 1.1,
        z: center[1] + nz * forward + tz * along,
        rotationY: facingRad + Math.PI,
        color: rng() > 0.5 ? TAPE_MAGENTA : LOOP_TEAL,
        scale: [0.6, 1.1, 0.6] as const,
      });
    }
  }
  return props;
}

export function generateTrackProps(): readonly PlacedProp[] {
  const props: PlacedProp[] = [];
  const mainSegments = buildLap(MAIN_LANES);
  const total = lapLength(mainSegments);

  const mainPylonDistances = distanceRange(4, total - 4, PYLON_SPACING);
  props.push(...pylonsAlong(mainPylonDistances, 1, mainSegments));
  props.push(...pylonsAlong(mainPylonDistances, -1, mainSegments));

  const forkASegments = buildLap({ forkA: "branch", forkB: "main" });
  const forkAZone = zoneRange(forkASegments, "forkA")!;
  const forkADistances = distanceRange(forkAZone.start + 2, forkAZone.end - 2, 5);
  props.push(...pylonsAlong(forkADistances, 1, forkASegments));

  const forkBSegments = buildLap({ forkA: "main", forkB: "branch" });
  const forkBZone = zoneRange(forkBSegments, "forkB")!;
  const forkBDistances = distanceRange(forkBZone.start + 2, forkBZone.end - 2, 5);
  props.push(...pylonsAlong(forkBDistances, -1, forkBSegments));

  const gateDistances = [12, 60, 90, 145, 185];
  gateDistances.forEach((distance, index) => {
    props.push(gateArch(distance, mainSegments, index % 2 === 0 ? TAPE_MAGENTA : LOOP_TEAL));
  });

  const rampZone = zoneRange(mainSegments, "rampUp")!;
  const bridgeMid = sampleAtDistance(mainSegments, (rampZone.start + rampZone.end) / 2);
  const bridgeNormal: readonly [number, number] = [Math.cos(bridgeMid.headingRad), -Math.sin(bridgeMid.headingRad)];
  for (const side of [-1, 1] as const) {
    props.push({
      catalogId: BRIDGE_PILLAR_OBJECT,
      x: bridgeMid.x + bridgeNormal[0] * LANE_HALF_WIDTH * side,
      y: 0,
      z: bridgeMid.z + bridgeNormal[1] * LANE_HALF_WIDTH * side,
      rotationY: 0,
      color: GRID_VIOLET,
      scale: [1, 5, 1] as const,
    });
  }

  const rng = seededRng(`${TRACK_SEED}:spectators`);
  const grandstandSpots: readonly [readonly [number, number], number][] = [
    [[-16, -22], Math.PI / 2],
    [[16, 22], -Math.PI / 2],
    [[-30, 8], 0],
  ];
  grandstandSpots.forEach(([center, facing], index) => {
    props.push(...grandstandCluster(center, facing, rng, index));
  });

  return props;
}
