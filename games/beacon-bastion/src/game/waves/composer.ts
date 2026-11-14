import type { EncounterGroup, EncounterWave } from "@jgengine/core/waves/encounter";
import { seededRng } from "@jgengine/shell/gameKit";

import { FLANK_POINT_KEY, SPAWN_POINT_KEY } from "../world/path";

/** First wave the composer writes. Everything before it is authored in `manifest.ts`. */
export const COMPOSE_FROM_WAVE = 7;
/** Last wave the composer writes; the finale after it is authored. */
export const COMPOSE_TO_WAVE = 11;

/** The composed waves that bring a miniboss back, and which one. */
export const BOSS_WAVES: Readonly<Record<number, string>> = { 9: "tech_server" };

/** One squad in a pattern: what rolls, how many at rank 0, when, and down which street. */
export interface SquadSlot {
  unit: string;
  count: number;
  at: number;
  flank?: boolean;
  escalates?: boolean;
}

/**
 * Squad shapes the composer draws from. A pattern names the tech and the shape; the wave's rank
 * scales the counts and the seed picks the pattern, so wave 7 and wave 11 read differently without
 * a second table. `weight` is relative.
 */
export const SQUAD_PATTERNS: readonly { id: string; label: string; weight: number; squads: readonly SquadSlot[] }[] = [
  {
    id: "gpu-shortage",
    label: "Graphics Card Shortage",
    weight: 3,
    squads: [
      { unit: "tech_phone", count: 5, at: 0, escalates: true },
      { unit: "tech_gpu", count: 2, at: 4 },
      { unit: "tech_chatbot", count: 2, at: 7 },
      { unit: "tech_scooter", count: 3, at: 10, flank: true },
    ],
  },
  {
    id: "mining-season",
    label: "Mining Season",
    weight: 2,
    squads: [
      { unit: "tech_earbuds", count: 8, at: 0 },
      { unit: "tech_rig", count: 2, at: 4 },
      { unit: "tech_router", count: 1, at: 6 },
      { unit: "tech_drone", count: 4, at: 9, flank: true },
      { unit: "tech_gpu", count: 1, at: 12 },
    ],
  },
  {
    id: "autonomous-traffic",
    label: "Autonomous Traffic",
    weight: 2,
    squads: [
      { unit: "tech_scooter", count: 6, at: 0, escalates: true },
      { unit: "tech_flock", count: 1, at: 3 },
      { unit: "tech_car", count: 2, at: 6 },
      { unit: "tech_phone", count: 4, at: 10 },
    ],
  },
  {
    id: "language-model",
    label: "Large Language Model",
    weight: 2,
    squads: [
      { unit: "tech_chatbot", count: 3, at: 0 },
      { unit: "tech_speaker", count: 3, at: 4 },
      { unit: "tech_fridge", count: 2, at: 7, escalates: true },
      { unit: "tech_drone", count: 3, at: 9, flank: true },
    ],
  },
  {
    id: "internet-of-things",
    label: "Internet of Things",
    weight: 3,
    squads: [
      { unit: "tech_watch", count: 6, at: 0 },
      { unit: "tech_router", count: 2, at: 3 },
      { unit: "tech_vacuum", count: 3, at: 5, escalates: true },
      { unit: "tech_fridge", count: 1, at: 8 },
      { unit: "tech_drone", count: 3, at: 10, flank: true },
      { unit: "tech_rig", count: 1, at: 12 },
    ],
  },
];

/** The wave number's rank inside the composed band: 0 on the first composed wave. */
export function composeRank(wave: number): number {
  return Math.max(0, wave - COMPOSE_FROM_WAVE);
}

/** How much a pattern's counts grow by the wave's rank. */
function scaleCount(count: number, rank: number): number {
  if (count <= 0) return 0;
  return Math.max(1, Math.round(count * (1.25 + rank * 0.45)));
}

/** The miniboss a composed wave brings back, or null on an ordinary wave. */
export function bossForWave(wave: number): string | null {
  if (wave < COMPOSE_FROM_WAVE || wave > COMPOSE_TO_WAVE) return null;
  return BOSS_WAVES[wave] ?? null;
}

function pickPattern(rng: () => number) {
  const total = SQUAD_PATTERNS.reduce((sum, pattern) => sum + pattern.weight, 0);
  let roll = rng() * total;
  for (const pattern of SQUAD_PATTERNS) {
    roll -= pattern.weight;
    if (roll <= 0) return pattern;
  }
  return SQUAD_PATTERNS[0]!;
}

/**
 * Compose one wave from the seed. The same seed and wave number always produce the same wave, so a
 * saved run's later waves can be previewed from the document instead of remembered. Pure: no clock,
 * no ambient randomness, no game state.
 */
export function composeWave(seed: number, wave: number): EncounterWave {
  const rng = seededRng(`beacon-bastion:wave:${seed}:${wave}`);
  const rank = composeRank(wave);
  const pattern = pickPattern(rng);
  const boss = bossForWave(wave);
  const groups: EncounterGroup[] = pattern.squads.map((squad) => ({
    unit: squad.unit,
    entry: squad.flank === true ? FLANK_POINT_KEY : SPAWN_POINT_KEY,
    count: scaleCount(squad.count, rank),
    at: squad.at,
    jitterSeconds: 1,
    ...(squad.escalates === true ? { escalates: true } : {}),
  }));
  if (boss !== null) groups.push({ unit: boss, entry: SPAWN_POINT_KEY, count: 1, at: 13 });
  return {
    id: `composed-${wave}-${pattern.id}`,
    label: pattern.label,
    durationSeconds: 22 + Math.min(6, rank * 1.5) + (boss === null ? 0 : 2),
    groups,
  };
}

/** Every composed wave from `COMPOSE_FROM_WAVE` through `lastWave`, in order. */
export function composeWaves(seed: number, lastWave: number): EncounterWave[] {
  const waves: EncounterWave[] = [];
  for (let wave = COMPOSE_FROM_WAVE; wave <= lastWave; wave += 1) waves.push(composeWave(seed, wave));
  return waves;
}
