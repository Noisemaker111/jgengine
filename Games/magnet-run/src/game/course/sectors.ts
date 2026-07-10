import { SECTOR_LENGTH } from "../systems/constants";
import type { GateSegment, SectorLayout, StripSegment } from "../systems/course";
import {
  checkerboard,
  deadEndRepel,
  doubleGateCombo,
  laneWeave,
  polarityFlipCall,
  polarityGate,
  singleLaneGap,
  straightStrip,
  trainDesert,
} from "./motifs";

const ALL: readonly [0, 1, 2] = [0, 1, 2];

function sector1(): SectorLayout {
  const strips: StripSegment[] = [
    ...straightStrip(0, 40, ALL, "floor", "blue"),
    ...singleLaneGap(40, 65, 1, "floor", "blue"),
    ...straightStrip(65, 110, ALL, "floor", "blue"),
    ...polarityFlipCall(110, 135, 160, ALL, "floor", "blue"),
    ...straightStrip(160, 205, ALL, "floor", "red"),
    ...singleLaneGap(205, 235, 2, "floor", "red"),
    ...straightStrip(235, 260, ALL, "floor", "red"),
  ];
  const trap = deadEndRepel(260, 270, "blue");
  strips.push(...trap.strips);
  strips.push(
    ...straightStrip(320, 330, ALL, "ceiling", "blue"),
    ...straightStrip(320, 360, ALL, "floor", "red"),
    ...straightStrip(360, 400, ALL, "floor", "red"),
  );
  return {
    id: "sector-1",
    index: 0,
    length: SECTOR_LENGTH,
    tint: "#3c5a46",
    label: "SECTOR 1 // MAINTENANCE LINE",
    strips,
    gates: [],
    checkpoints: [
      { id: "s1-cp0", z: 0 },
      { id: "s1-cp1", z: 100 },
      { id: "s1-cp2", z: 200 },
      { id: "s1-cp3", z: 330 },
    ],
  };
}

function sector2(): SectorLayout {
  const gates: GateSegment[] = [
    ...polarityGate(40, 0, "floor", "blue"),
    ...polarityGate(40, 1, "floor", "blue"),
    ...polarityGate(40, 2, "floor", "blue"),
    ...polarityGate(220, 2, "floor", "red"),
    ...polarityGate(330, 0, "floor", "blue"),
    ...polarityGate(330, 1, "floor", "blue"),
    ...polarityGate(330, 2, "floor", "blue"),
  ];
  const strips: StripSegment[] = [
    ...straightStrip(0, 75, ALL, "floor", "blue"),
    ...laneWeave(75, 110, [1, 2], "floor", "blue"),
    ...straightStrip(110, 120, ALL, "floor", "blue"),
    ...trainDesert(120, 170, [0]),
    ...straightStrip(170, 260, ALL, "floor", "blue"),
    ...checkerboard(260, 300, "floor", 12, "blue"),
    ...straightStrip(300, 380, ALL, "floor", "blue"),
    ...straightStrip(380, 400, ALL, "floor", "blue"),
  ];
  return {
    id: "sector-2",
    index: 1,
    length: SECTOR_LENGTH,
    tint: "#8a6a2f",
    label: "SECTOR 2 // CARGO CONCOURSE",
    strips,
    gates,
    checkpoints: [
      { id: "s2-cp0", z: 0 },
      { id: "s2-cp1", z: 115 },
      { id: "s2-cp2", z: 200 },
      { id: "s2-cp3", z: 310 },
    ],
  };
}

function sector3(): SectorLayout {
  const gates: GateSegment[] = doubleGateCombo(120, 15, 0, 2, "floor", "blue", "red");
  const strips: StripSegment[] = [
    ...straightStrip(0, 30, ALL, "floor", "blue"),
    ...checkerboard(30, 90, "floor", 10, "blue"),
    ...straightStrip(90, 170, ALL, "floor", "blue"),
    ...trainDesert(170, 230, [0, 2]),
    ...straightStrip(230, 270, [0], "floor", "blue"),
    ...straightStrip(230, 270, [2], "floor", "red"),
    ...straightStrip(270, 300, ALL, "floor", "blue"),
    ...checkerboard(300, 360, "floor", 8, "red"),
    ...straightStrip(360, 400, ALL, "floor", "red"),
  ];
  return {
    id: "sector-3",
    index: 2,
    length: SECTOR_LENGTH,
    tint: "#4a6b8a",
    label: "SECTOR 3 // REACTOR SPINE",
    strips,
    gates,
    checkpoints: [
      { id: "s3-cp0", z: 0 },
      { id: "s3-cp1", z: 100 },
      { id: "s3-cp2", z: 285 },
      { id: "s3-cp3", z: 368 },
    ],
  };
}

export const sectors: readonly SectorLayout[] = [sector1(), sector2(), sector3()];
