import type { EncounterGroup, EncounterWave } from "@jgengine/core/ai/director/encounter";
import { seededRng } from "@jgengine/shell/gameKit";

import { FLANK_POINT_KEY, SPAWN_POINT_KEY } from "../world/path";

/** First wave the composer writes. Everything before it is authored in `manifest.ts`. */
export const COMPOSE_FROM_WAVE = 7;

/** A composed boss lands on every wave divisible by this, so wave 8 and wave 12 carry one. */
export const BOSS_EVERY_WAVES = 4;

/** A named elite per group, so the HUD can name each one instead of saying "3 elites". */
export const ELITE_ROSTER: readonly { unit: string; name: string }[] = [
  { unit: "raider_captain", name: "Ironjaw" },
  { unit: "raider_reaver", name: "Sable" },
  { unit: "raider_breaker", name: "Hollow" },
];

/** The boss each composed boss wave calls up, in the order they appear: wave 8, wave 12, wave 16. */
export const BOSS_ORDER: readonly string[] = ["raider_warlord", "raider_warden"];

/**
 * Squad shapes the composer draws from. A pattern names the units and the shape; the wave's rank
 * scales the counts and the seed picks the pattern and its named elites, so wave 7 and wave 11 read
 * differently without a second table. `weight` is relative.
 */
export const SQUAD_PATTERNS: readonly {
  id: string;
  label: string;
  weight: number;
  scouts: number;
  grunts: number;
  brutes: number;
  elites: number;
  /** Wraiths over the flank road: only towers that hit air answer them. */
  wraiths?: number;
  /** Shield-bearers whose ward regrows. */
  bulwarks?: number;
  /** Shamans that mend the column. */
  shamans?: number;
  /** Hulks that break into bonelings. */
  hulks?: number;
}[] = [
  { id: "line", label: "Iron Line", weight: 3, scouts: 2, grunts: 3, brutes: 1, elites: 1, bulwarks: 1 },
  { id: "press", label: "Long Press", weight: 3, scouts: 1, grunts: 4, brutes: 0, elites: 2, shamans: 1 },
  { id: "hammer", label: "Hammerfall", weight: 2, scouts: 0, grunts: 3, brutes: 2, elites: 1, hulks: 1 },
  { id: "tide", label: "Ash Tide", weight: 2, scouts: 3, grunts: 2, brutes: 1, elites: 2, wraiths: 3 },
  { id: "host", label: "Barrow Host", weight: 2, scouts: 0, grunts: 2, brutes: 0, elites: 1, wraiths: 2, bulwarks: 1, shamans: 1, hulks: 1 },
];

/** The wave number's rank inside the composed band: 0 on the first composed wave. */
export function composeRank(wave: number): number {
  return Math.max(0, wave - COMPOSE_FROM_WAVE);
}

/** How much a pattern's counts grow by the wave's rank. */
function scaleCount(count: number, rank: number): number {
  if (count <= 0) return 0;
  return Math.max(1, Math.round(count * (1 + rank * 0.4)));
}

/** The boss a composed wave calls up, or null on a wave that is not a boss wave. */
export function bossForWave(wave: number): string | null {
  if (wave < COMPOSE_FROM_WAVE || wave % BOSS_EVERY_WAVES !== 0) return null;
  const bossIndex = wave / BOSS_EVERY_WAVES - 2;
  return BOSS_ORDER[((bossIndex % BOSS_ORDER.length) + BOSS_ORDER.length) % BOSS_ORDER.length] ?? null;
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

function pickElites(rng: () => number, count: number): { unit: string; name: string }[] {
  const pool = [...ELITE_ROSTER];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
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
  const elites = pickElites(rng, pattern.elites);
  const boss = bossForWave(wave);

  const groups: EncounterGroup[] = [];
  const scouts = scaleCount(pattern.scouts, rank);
  if (scouts > 0) {
    groups.push({ unit: "raider_scout", entry: SPAWN_POINT_KEY, count: scouts, jitterSeconds: 1 });
  }
  const grunts = scaleCount(pattern.grunts, rank);
  if (grunts > 0) {
    groups.push({ unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: grunts, at: 3, jitterSeconds: 1, escalates: true });
  }
  elites.forEach((elite, index) => {
    groups.push({ unit: elite.unit, entry: SPAWN_POINT_KEY, count: 1, at: 6 + index * 2, jitterSeconds: 1.5 });
  });
  const brutes = scaleCount(pattern.brutes, rank);
  if (brutes > 0) {
    groups.push({ unit: "raider_brute", entry: SPAWN_POINT_KEY, count: brutes, at: 10, jitterSeconds: 1, escalates: true });
  }
  const special: [string, number | undefined, number, string][] = [
    ["raider_bulwark", pattern.bulwarks, 5, SPAWN_POINT_KEY],
    ["raider_shaman", pattern.shamans, 7, SPAWN_POINT_KEY],
    ["raider_wraith", pattern.wraiths, 8, FLANK_POINT_KEY],
    ["raider_hulk", pattern.hulks, 11, SPAWN_POINT_KEY],
  ];
  for (const [unit, count, at, entry] of special) {
    const scaled = scaleCount(count ?? 0, rank);
    if (scaled > 0) groups.push({ unit, entry, count: scaled, at, jitterSeconds: 1 });
  }
  if (boss !== null) {
    groups.push({ unit: boss, entry: SPAWN_POINT_KEY, count: 1, at: 12 });
  }

  return {
    id: `composed-${wave}-${pattern.id}`,
    label: pattern.label,
    durationSeconds: 20 + Math.min(8, rank * 2) + (boss === null ? 0 : 2),
    groups,
  };
}

/** Every composed wave from `COMPOSE_FROM_WAVE` through `lastWave`, in order. */
export function composeWaves(seed: number, lastWave: number): EncounterWave[] {
  const waves: EncounterWave[] = [];
  for (let wave = COMPOSE_FROM_WAVE; wave <= lastWave; wave += 1) waves.push(composeWave(seed, wave));
  return waves;
}
