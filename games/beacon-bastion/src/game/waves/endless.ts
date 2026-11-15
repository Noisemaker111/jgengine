import type { EncounterDefinition, EncounterGroup, EncounterWave } from "@jgengine/core/waves/encounter";
import { seededRng } from "@jgengine/shell/gameKit";

import { FLANK_POINT_KEY, SPAWN_POINT_KEY } from "../world/path";

/**
 * Overtime: the endless shift. Technology marches on through its eras, dial-up first, then the
 * smartphone, then AI, each wave a little thicker and tougher than the last, until the town loses
 * focus. Every eighth wave closes on that era's boss. Pure: the same seed writes the same night.
 */

export interface EraDef {
  id: "dialup" | "smartphone" | "ai";
  label: string;
  /** The first wave this era owns. */
  fromWave: number;
  /** What the era fields, with relative odds and its base squad size. */
  units: readonly { unit: string; weight: number; count: number }[];
  /** The boss every eighth wave of the era brings. */
  boss: string;
}

export const ERAS: readonly EraDef[] = [
  {
    id: "dialup",
    label: "Dial-Up Era",
    fromWave: 1,
    units: [
      { unit: "tech_earbuds", weight: 3, count: 6 },
      { unit: "tech_watch", weight: 3, count: 5 },
      { unit: "tech_phone", weight: 2, count: 4 },
      { unit: "tech_speaker", weight: 2, count: 2 },
      { unit: "tech_vacuum", weight: 2, count: 2 },
      { unit: "tech_fridge", weight: 1, count: 1 },
    ],
    boss: "tech_server",
  },
  {
    id: "smartphone",
    label: "Smartphone Era",
    fromWave: 9,
    units: [
      { unit: "tech_phone", weight: 4, count: 6 },
      { unit: "tech_drone", weight: 3, count: 3 },
      { unit: "tech_scooter", weight: 3, count: 4 },
      { unit: "tech_flock", weight: 1, count: 1 },
      { unit: "tech_router", weight: 2, count: 1 },
      { unit: "tech_car", weight: 2, count: 1 },
    ],
    boss: "tech_server",
  },
  {
    id: "ai",
    label: "AI Era",
    fromWave: 17,
    units: [
      { unit: "tech_chatbot", weight: 4, count: 3 },
      { unit: "tech_gpu", weight: 3, count: 2 },
      { unit: "tech_rig", weight: 2, count: 1 },
      { unit: "tech_drone", weight: 3, count: 4 },
      { unit: "tech_car", weight: 2, count: 2 },
      { unit: "tech_phone", weight: 3, count: 7 },
    ],
    boss: "boss_datacenter",
  },
];

/** Overtime writes this many waves; nobody has worked them all. */
export const ENDLESS_WAVES = 99;
/** How much each wave thickens every squad. */
export const ENDLESS_COUNT_RAMP = 0.06;
/** How much tougher each wave past the day's twelfth makes a boss. */
export const ENDLESS_BOSS_RAMP = 0.05;

export function eraOf(wave: number): EraDef {
  let era = ERAS[0]!;
  for (const candidate of ERAS) if (wave >= candidate.fromWave) era = candidate;
  return era;
}

function pick(rng: () => number, units: EraDef["units"], taken: Set<string>): EraDef["units"][number] {
  const open = units.filter((entry) => !taken.has(entry.unit));
  const total = open.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of open) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return open[0]!;
}

/** One Overtime wave: three or four squads of its era, thicker every wave, one down the side road from the third. */
export function endlessWave(seed: number, wave: number): EncounterWave {
  const rng = seededRng(`beacon-bastion:overtime:${seed}:${wave}`);
  const era = eraOf(wave);
  const scale = 1 + ENDLESS_COUNT_RAMP * (wave - 1);
  const squads = wave < 7 ? 3 : 4;
  const taken = new Set<string>();
  const groups: EncounterGroup[] = [];
  for (let index = 0; index < squads; index += 1) {
    const entry = pick(rng, era.units, taken);
    taken.add(entry.unit);
    groups.push({
      unit: entry.unit,
      entry: wave >= 5 && index === squads - 1 ? FLANK_POINT_KEY : SPAWN_POINT_KEY,
      count: Math.max(1, Math.round(entry.count * scale)),
      at: index * 4,
      jitterSeconds: 1,
      ...(index === 0 && wave >= 6 ? { escalates: true } : {}),
    });
  }
  const boss = wave % 8 === 0;
  if (boss) groups.push({ unit: era.boss, entry: SPAWN_POINT_KEY, count: 1, at: 14 });
  return {
    id: `overtime-${wave}-${era.id}`,
    label: boss ? `${era.label}: ${era.boss === "boss_datacenter" ? "a Data Center" : "a Server Rack"}` : era.label,
    durationSeconds: 22 + Math.min(8, wave * 0.3),
    groups,
  };
}

const cache = new Map<number, EncounterDefinition>();

/** The whole Overtime shift for a seed. */
export function endlessEncounter(seed: number): EncounterDefinition {
  const cached = cache.get(seed);
  if (cached !== undefined) return cached;
  const definition: EncounterDefinition = {
    id: "beacon-bastion:overtime",
    waves: Array.from({ length: ENDLESS_WAVES }, (_, index) => endlessWave(seed, index + 1)),
  };
  cache.set(seed, definition);
  return definition;
}
