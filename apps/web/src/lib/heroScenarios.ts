/**
 * The rotating hero pitches and the generator dials each one feeds to
 * `generateCity`. Pure data — imported by the SSR'd landing route for the
 * typing loop and by the client-only hero world for the actual generation,
 * so the sentence on screen and the world behind it can never drift apart.
 */
import type { StreetNetworkRules } from "@jgengine/core/world/streetGenerator";

export interface HeroScenario {
  /** Completes "Make a game that ___ with jgengine." */
  fill: string;
  /** Street dial overrides passed straight to generateCity. */
  streets: Partial<Omit<StreetNetworkRules, "seed">>;
  lots: { footprint: { w: number; d: number }; setback: number };
  /** World half-extents fed to the generator. */
  halfExtent: number;
  /** Scales the seeded building heights (villages stay low, downtowns tower). */
  heightScale: number;
  camera: { radius: number; height: number };
  palette: {
    building: number;
    boulevard: number;
    avenue: number;
    street: number;
    lane: number;
    glow: number;
    windowWarm: number;
    windowCool: number;
    trafficA: number;
    trafficB: number;
    lightA: number;
    lightB: number;
    fogDensity: number;
  };
}

export const HERO_SCENARIOS: HeroScenario[] = [
  {
    fill: "is a neon rooftop heist sandbox",
    streets: { gridness: 0.88, connectivity: 0.7, branching: 0.25, winding: 0.12, segmentLength: 82, boulevards: 0.32 },
    lots: { footprint: { w: 13, d: 11 }, setback: 3 },
    halfExtent: 230,
    heightScale: 1,
    camera: { radius: 320, height: 150 },
    palette: {
      building: 0x38465c,
      boulevard: 0x33465f,
      avenue: 0x2a3a50,
      street: 0x223043,
      lane: 0x1a2534,
      glow: 0x34d399,
      windowWarm: 0xffd9a0,
      windowCool: 0x67e8f9,
      trafficA: 0xfff3d6,
      trafficB: 0xf87171,
      lightA: 0x34d399,
      lightB: 0x22d3ee,
      fogDensity: 0.0016,
    },
  },
  {
    fill: "is a midnight drift racer",
    streets: {
      gridness: 0,
      loopiness: 1,
      connectivity: 0,
      branching: 0,
      deadEnds: 0,
      winding: 0.55,
      segmentLength: 85,
      minCurveRadius: 26,
      width: 11,
      boulevards: 0,
    },
    lots: { footprint: { w: 14, d: 10 }, setback: 5 },
    halfExtent: 260,
    heightScale: 0.45,
    camera: { radius: 360, height: 130 },
    palette: {
      building: 0x453956,
      boulevard: 0x413655,
      avenue: 0x352c46,
      street: 0x2b2440,
      lane: 0x201b30,
      glow: 0xe879f9,
      windowWarm: 0xfcd34d,
      windowCool: 0xe879f9,
      trafficA: 0xfde68a,
      trafficB: 0xfb7185,
      lightA: 0xd946ef,
      lightB: 0xf59e0b,
      fogDensity: 0.0014,
    },
  },
  {
    fill: "is a cozy harbor trading village",
    streets: { gridness: 0.08, connectivity: 0.32, branching: 0.5, winding: 0.5, segmentLength: 58, boulevards: 0, width: 7 },
    lots: { footprint: { w: 9, d: 8 }, setback: 2 },
    halfExtent: 190,
    heightScale: 0.24,
    camera: { radius: 250, height: 95 },
    palette: {
      building: 0x5c4e3e,
      boulevard: 0x50443a,
      avenue: 0x443930,
      street: 0x382f27,
      lane: 0x2b241d,
      glow: 0xfbbf24,
      windowWarm: 0xffe8b0,
      windowCool: 0xa3e635,
      trafficA: 0xffedc2,
      trafficB: 0xfca5a5,
      lightA: 0xf59e0b,
      lightB: 0x84cc16,
      fogDensity: 0.002,
    },
  },
  {
    fill: "is a tower-defense megagrid",
    streets: { gridness: 1, connectivity: 0.9, branching: 0.1, winding: 0, segmentLength: 72, boulevards: 0.22, aspect: 1 },
    lots: { footprint: { w: 12, d: 12 }, setback: 3 },
    halfExtent: 220,
    heightScale: 0.7,
    camera: { radius: 300, height: 175 },
    palette: {
      building: 0x35455c,
      boulevard: 0x2f455e,
      avenue: 0x27384e,
      street: 0x1f2d40,
      lane: 0x182332,
      glow: 0x22d3ee,
      windowWarm: 0xbae6fd,
      windowCool: 0xa78bfa,
      trafficA: 0xcffafe,
      trafficB: 0xc4b5fd,
      lightA: 0x22d3ee,
      lightB: 0x8b5cf6,
      fogDensity: 0.0017,
    },
  },
];
