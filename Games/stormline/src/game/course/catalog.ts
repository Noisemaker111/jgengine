import { seededStreams } from "@jgengine/core/random/rng";

export const SEED = "stormline-cutbank-run";

export const COURSE_LENGTH = 1980;
export const GATE_COUNT = 6;
export const SEGMENT_LENGTH = COURSE_LENGTH / GATE_COUNT;
export const FORK_ENTRY_OFFSET = 120;
export const FORK_WARN_OFFSET = 70;
export const OUTER_BAND_METERS = 150;
export const STRIKE_RADIUS = 13;
export const FORK_LOCK_LANE = -0.3;

export interface GateSpec {
  readonly index: number;
  readonly progress: number;
  readonly name: string;
}

const GATE_NAMES: readonly string[] = [
  "Cutbank Crossing",
  "Silo Row",
  "Fence Line Draw",
  "Coulee Bridge",
  "Windbreak Stand",
  "Shelter Bluff",
];

export const GATES: readonly GateSpec[] = GATE_NAMES.map((name, i) => ({
  index: i + 1,
  progress: (i + 1) * SEGMENT_LENGTH,
  name,
}));

export interface StrikeZoneSpec {
  readonly id: string;
  readonly forkIndex: number;
  readonly progress: number;
  readonly radius: number;
  readonly windupMs: number;
  readonly activeMs: number;
  readonly cooldownMs: number;
  readonly phaseOffsetMs: number;
}

export interface ForkSpec {
  readonly index: number;
  readonly forkProgress: number;
  readonly gateProgress: number;
  readonly gateName: string;
  readonly bonusMeters: number;
  readonly fastName: string;
  readonly safeName: string;
  readonly hazards: readonly StrikeZoneSpec[];
}

const FORK_NAMES: readonly { fast: string; safe: string }[] = [
  { fast: "Cutbank Straight", safe: "Ridge Road" },
  { fast: "Wash Bottom", safe: "Section Line" },
  { fast: "Storm Shoulder", safe: "Coulee Bypass" },
  { fast: "Draw Shortcut", safe: "Windbreak Loop" },
  { fast: "Anvil Run", safe: "Old Grange Road" },
];

const HAZARD_COUNTS: readonly number[] = [3, 2, 3, 2, 3];

function buildHazards(
  forkIndex: number,
  spanStart: number,
  spanEnd: number,
  rng: () => number,
): readonly StrikeZoneSpec[] {
  const count = HAZARD_COUNTS[forkIndex - 1] ?? 2;
  const span = spanEnd - spanStart;
  const step = span / (count + 1);
  const zones: StrikeZoneSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const jitter = (rng() - 0.5) * step * 0.4;
    const progress = spanStart + step * (i + 1) + jitter;
    const windupMs = 900 + Math.floor(rng() * 500);
    const activeMs = 350 + Math.floor(rng() * 250);
    const cooldownMs = 1700 + Math.floor(rng() * 900);
    const cycleMs = windupMs + activeMs + cooldownMs;
    const phaseOffsetMs = Math.floor(rng() * cycleMs);
    zones.push({
      id: `fork-${forkIndex}-strike-${i + 1}`,
      forkIndex,
      progress,
      radius: STRIKE_RADIUS,
      windupMs,
      activeMs,
      cooldownMs,
      phaseOffsetMs,
    });
  }
  return zones;
}

export function buildForks(seed: string): readonly ForkSpec[] {
  const streams = seededStreams(seed);
  const bonusRng = streams("fork-bonus");
  const hazardRng = streams("fork-hazards");
  return GATES.slice(0, 5).map((gate, i) => {
    const forkIndex = i + 1;
    const nextGate = GATES[i + 1]!;
    const forkProgress = gate.progress + FORK_ENTRY_OFFSET;
    const names = FORK_NAMES[i]!;
    const bonusMeters = 50 + Math.floor(bonusRng() * 40);
    return {
      index: forkIndex,
      forkProgress,
      gateProgress: nextGate.progress,
      gateName: nextGate.name,
      bonusMeters,
      fastName: names.fast,
      safeName: names.safe,
      hazards: buildHazards(forkIndex, forkProgress + 15, nextGate.progress - 15, hazardRng),
    };
  });
}

export const FORKS: readonly ForkSpec[] = buildForks(SEED);
export const HAZARD_TOTAL = FORKS.reduce((sum, fork) => sum + fork.hazards.length, 0);

export function forkAfterProgress(progress: number): ForkSpec | null {
  for (const fork of FORKS) {
    if (progress < fork.gateProgress) return fork;
  }
  return null;
}
