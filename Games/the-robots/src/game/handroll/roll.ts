import { generate, type GenProvenance, type GenSchema } from "@jgengine/core/item/itemgen";
import {
  ELEMENTS,
  ELEMENT_PREFIX,
  FAMILY_BASES,
  LEGENDARY_NAMES,
  LEVEL_DAMAGE_GROWTH,
  MANUFACTURERS,
  RARITY_TIERS,
  type FamilyBase,
  type GunDef,
  type GunElement,
  type GunFamily,
  type Manufacturer,
  type Rarity,
  type RarityTier,
} from "./guns";

/**
 * The gun catalog is a process-global registry, not per-context: the engine resolves item stats,
 * use, and loot rarity through the ctx-less `GameContextContent.itemById(itemId)` contract, and the
 * game's static starter guns (see `items/weapons/catalog.ts`) are rolled at module load. Both paths
 * look guns up without a `GameContext`, so the registry must be reachable without one. Per-session
 * runtime state (magazines, shields, DOTs, FFYL) lives on the `perContext` seam instead.
 */
const gunRegistry = new Map<string, GunDef>();
const gunProvenanceById = new Map<string, GenProvenance>();
let gunSerial = 0;

export function gunById(id: string): GunDef | undefined {
  return gunRegistry.get(id);
}

/** The generation provenance for a rolled gun — every family/rarity/manufacturer pick and its weight. */
export function gunProvenance(id: string): GenProvenance | undefined {
  return gunProvenanceById.get(id);
}

export function registerGun(def: GunDef): GunDef {
  gunRegistry.set(def.id, def);
  return def;
}

export function allGuns(): readonly GunDef[] {
  return [...gunRegistry.values()];
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  const entry = list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  if (entry === undefined) throw new Error("pick: empty list");
  return entry;
}

export function rollRarity(rng: () => number, luck = 1): Rarity {
  const total = RARITY_TIERS.reduce((sum, tier) => sum + tier.weight * (tier.id === "common" ? 1 : luck), 0);
  let roll = rng() * total;
  for (const tier of RARITY_TIERS) {
    roll -= tier.weight * (tier.id === "common" ? 1 : luck);
    if (roll <= 0) return tier.id;
  }
  return "common";
}

export interface RollGunOptions {
  rarity?: Rarity;
  family?: GunFamily;
  level?: number;
  luck?: number;
}

/**
 * Weighted family/rarity/manufacturer selection expressed on the engine's composable generation
 * seam (`@jgengine/core/item/itemgen`). The uniform/weighted picks consume the injected rng in the
 * same order the hand-rolled selection did, so drops stay identical while the roll now carries
 * serializable provenance (see {@link gunProvenance}). The gun-specific stat, element, and name
 * feel below stays game-local — the seam owns selection, not the numbers.
 */
function gunSelectionSchema(luck: number): GenSchema {
  return {
    steps: [
      { id: "family", select: "uniform", pool: FAMILY_BASES.map((value) => ({ id: value.family, value })) },
      {
        id: "rarity",
        select: "weighted",
        pool: RARITY_TIERS.map((value) => ({ id: value.id, value })),
        weightOf: (option) => (option.value as RarityTier).weight * (option.id === "common" ? 1 : luck),
      },
      {
        id: "maker",
        select: "uniform",
        pool: (choices) => {
          if (choices.optionId("rarity") === "legendary") {
            const fam = (choices.value<FamilyBase>("family") ?? FAMILY_BASES[0]!).family;
            return LEGENDARY_NAMES[fam].map(([makerId, legendaryName]) => ({
              id: `${makerId}:${legendaryName}`,
              value: {
                manufacturer: MANUFACTURERS.find((candidate) => candidate.id === makerId) ?? MANUFACTURERS[0]!,
                legendaryName: legendaryName as string | null,
              },
            }));
          }
          return MANUFACTURERS.map((manufacturer) => ({
            id: manufacturer.id,
            value: { manufacturer, legendaryName: null as string | null },
          }));
        },
      },
    ],
  };
}

/** The elemental proc chance a rolled gun carries: none never procs, explosive always does, otherwise the tier scales it. */
function procChanceFor(element: GunElement, tier: RarityTier): number {
  if (element === "none") return 0;
  if (element === "explosive") return 1;
  return 0.25 + tier.elementChance * 0.4;
}

export function rollGun(rng: () => number, level: number, options: RollGunOptions = {}): GunDef {
  const pin: Record<string, string> = {};
  if (options.family !== undefined) pin.family = options.family;
  if (options.rarity !== undefined) pin.rarity = options.rarity;
  const rolled = generate(gunSelectionSchema(options.luck ?? 1), rng, { pin });
  if (!rolled.ok) throw new Error(`gun roll failed: ${rolled.reason}`);
  const base = rolled.result.values.family as FamilyBase;
  const tier = rolled.result.values.rarity as RarityTier;
  const rarity = tier.id;
  const maker = rolled.result.values.maker as { manufacturer: Manufacturer; legendaryName: string | null };
  const manufacturer = maker.manufacturer;
  const legendaryName = maker.legendaryName;

  let element: GunElement = "none";
  if (manufacturer.neverElemental !== true) {
    if (manufacturer.forcedElement !== undefined) element = manufacturer.forcedElement;
    else if (manufacturer.id === "Voltek" || rng() < tier.elementChance) element = pick(rng, ELEMENTS);
  }

  const gunLevel = options.level ?? level;
  const levelMult = LEVEL_DAMAGE_GROWTH ** (gunLevel - 1);
  const jitter = 0.92 + rng() * 0.16;
  const damage = Math.max(1, Math.round(base.stats.damage * tier.mult * manufacturer.damage * levelMult * jitter));
  const magSize = Math.max(2, Math.round(base.magSize * manufacturer.mag));
  const elementPrefix = element === "none" ? "" : `${ELEMENT_PREFIX[element]} `;
  const name = legendaryName !== null
    ? `${elementPrefix}${legendaryName}`
    : `${elementPrefix}${pick(rng, manufacturer.prefixes)} ${pick(rng, base.nouns)}`;

  gunSerial += 1;
  const def: GunDef = {
    id: `gun_${gunSerial}_${base.family}_${rarity}`,
    kind: "gun",
    name,
    family: base.family,
    manufacturer: manufacturer.id,
    rarity,
    element,
    level: gunLevel,
    ammo: base.ammo,
    auto: base.auto,
    ammoPerShot: base.ammoPerShot,
    magSize,
    reloadMs: Math.round(base.reloadMs * manufacturer.reload),
    elementChance: procChanceFor(element, tier),
    elementDps: Math.max(1, Math.round(damage * 0.35)),
    use: "fireGun",
    weapon: {
      damage,
      range: base.stats.range,
      spread: Math.round(base.stats.spread * manufacturer.spread * (rarity === "legendary" ? 0.7 : 1) * 100) / 100,
      fireIntervalMs: Math.max(60, Math.round(base.stats.fireIntervalMs * manufacturer.interval * (2 - tier.mult))),
      critChance: Math.min(0.5, base.stats.critChance + (tier.mult - 1) * 0.08),
      critMult: base.stats.critMult,
      ...(base.stats.pellets !== undefined ? { pellets: base.stats.pellets } : {}),
      ...(base.stats.projectile !== undefined ? { projectile: base.stats.projectile } : {}),
      ...(element === "explosive" && base.family !== "launcher" ? { explosion: { radius: 2.2 } } : {}),
      ...(base.stats.explosion !== undefined ? { explosion: base.stats.explosion } : {}),
    },
  };
  gunProvenanceById.set(def.id, rolled.result.provenance);
  return registerGun(def);
}
