import { registerGenerator } from "@jgengine/core/generator/generator";
import { defineParamSchema, type ParamsOf } from "@jgengine/core/generator/paramSchema";
import { defineItemGenerator, rollItemRecipe, type ItemRecipe } from "@jgengine/core/item/itemGenerator";
import type { GenProvenance, GenSchema } from "@jgengine/core/item/itemgen";
import { pickUniform, pickWeighted } from "@jgengine/core/random/pick";
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
  type GunRarity,
} from "./guns";
import { derivePerks } from "./perks";
import { UNIQUE_GUNS, uniqueGun } from "./uniques";

/**
 * The gun catalog is a process-global registry, not per-context: the engine resolves item stats,
 * use, and loot rarity through the ctx-less `GameContextContent.itemById(itemId)` contract, and the
 * game's static starter guns (see `items/weapons/catalog.ts`) are rolled at module load. Both paths
 * look guns up without a `GameContext`, so the registry must be reachable without one. Per-session
 * runtime state (magazines, shields, DOTs, RESERVE) lives on the `perContext` seam instead.
 */
const gunRegistry = new Map<string, GunDef>();
const gunProvenanceById = new Map<string, GenProvenance>();
let gunSerial = 0;

export function gunById(id: string): GunDef | undefined {
  return gunRegistry.get(id);
}

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

export function ensureGunSerialAtLeast(value: number): void {
  if (Number.isFinite(value) && value > gunSerial) gunSerial = Math.floor(value);
}

export function gunSerialOf(id: string): number {
  const match = /^gun_(\d+)_/.exec(id);
  return match === null ? 0 : Number(match[1]);
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  const entry = pickUniform(rng, list);
  if (entry === undefined) throw new Error("pick: empty list");
  return entry;
}

export function rollRarity(rng: () => number, luck = 1): Rarity {
  const picked = pickWeighted(rng, RARITY_TIERS, (tier) => tier.weight * (tier.id === "common" ? 1 : luck));
  return picked?.id ?? "common";
}

export function rarityRank(rarity: Rarity): number {
  return RARITY_TIERS.findIndex((tier) => tier.id === rarity);
}

export interface RollGunOptions {
  rarity?: Rarity;
  family?: GunFamily;
  level?: number;
  luck?: number;
  legendary?: string;
  maker?: string;
  maxRarity?: Rarity;
  unique?: string;
}

export function legendaryEntry(name: string): { family: GunFamily; maker: string } | undefined {
  for (const family of Object.keys(LEGENDARY_NAMES) as GunFamily[]) {
    for (const [maker, legendaryName] of LEGENDARY_NAMES[family]) {
      if (legendaryName === name) return { family, maker };
    }
  }
  return undefined;
}

function gunSelectionSchema(luck: number, maxRarity: Rarity): GenSchema {
  const cap = RARITY_TIERS.findIndex((tier) => tier.id === maxRarity);
  return {
    steps: [
      { id: "family", select: "uniform", pool: FAMILY_BASES.map((value) => ({ id: value.family, value })) },
      {
        id: "rarity",
        select: "weighted",
        pool: RARITY_TIERS.filter((_, index) => index <= cap).map((value) => ({ id: value.id, value })),
        weightOf: (option) => (option.value as GunRarity).weight * (option.id === "common" ? 1 : luck),
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
function procChanceFor(element: GunElement, tier: GunRarity): number {
  if (element === "none") return 0;
  if (element === "explosive") return 1;
  return 0.25 + tier.elementChance * 0.4;
}

const ANY = { value: "", label: "any" } as const;

const GUN_SCHEMA = defineParamSchema({
  fields: [
    { type: "number", key: "level", label: "level", min: 1, step: 1, default: 1, explore: [1, 30] },
    { type: "number", key: "luck", label: "luck", min: 0, step: 0.1, default: 1, explore: [1, 6] },
    { type: "select", key: "family", label: "family", options: [ANY, ...FAMILY_BASES.map((base) => ({ value: base.family }))], default: "", vary: false },
    { type: "select", key: "rarity", label: "rarity", options: [ANY, ...RARITY_TIERS.map((tier) => ({ value: tier.id }))], default: "", vary: false },
    { type: "select", key: "maxRarity", label: "rarest tier", options: [ANY, ...RARITY_TIERS.map((tier) => ({ value: tier.id }))], default: "", vary: false },
    { type: "select", key: "maker", label: "maker", options: [ANY, ...MANUFACTURERS.map((maker) => ({ value: maker.id }))], default: "", vary: false },
    {
      type: "select",
      key: "legendary",
      label: "named legendary",
      options: [ANY, ...Object.values(LEGENDARY_NAMES).flatMap((entries) => entries.map(([, name]) => ({ value: name })))],
      default: "",
      vary: false,
    },
    { type: "select", key: "unique", label: "quest unique", options: [ANY, ...UNIQUE_GUNS.map((gun) => ({ value: gun.name }))], default: "", vary: false },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
});

type GunParams = ParamsOf<typeof GUN_SCHEMA>;

/** A rolled gun before the registry gives it an id and its perks. */
export type GunRoll = Omit<GunDef, "id" | "perks">;

function gunPins(params: GunParams): { pin: Record<string, string>; maxRarity: Rarity } {
  const pin: Record<string, string> = {};
  if (params.family !== "") pin["family"] = params.family;
  if (params.rarity !== "") pin["rarity"] = params.rarity;
  if (params.maker !== "") pin["maker"] = params.maker;
  if (params.legendary !== "") {
    const entry = legendaryEntry(params.legendary);
    if (entry === undefined) throw new Error(`unknown legendary: ${params.legendary}`);
    pin["family"] = entry.family;
    pin["rarity"] = "legendary";
    pin["maker"] = `${entry.maker}:${params.legendary}`;
  }
  if (params.unique !== "") {
    const unique = uniqueGun(params.unique);
    if (unique === undefined) throw new Error(`unknown unique: ${params.unique}`);
    pin["family"] = unique.family;
    pin["rarity"] = unique.rarity;
    pin["maker"] = unique.maker;
  }
  // A pinned plain maker cannot land on a named legendary, whose maker ids carry the name.
  const ceiling: Rarity = pin["maker"] !== undefined && params.legendary === "" ? "epic" : "legendary";
  const wanted = params.maxRarity === "" ? ceiling : params.maxRarity;
  const maxRarity = pin["rarity"] !== undefined ? "legendary" : rarityRank(wanted) < rarityRank(ceiling) ? wanted : ceiling;
  return { pin, maxRarity };
}

const GUN_RECIPE: ItemRecipe<typeof GUN_SCHEMA, GunRoll> = {
  id: "scrap-signal.gun",
  label: "Scrap Signal gun",
  schema: GUN_SCHEMA,
  steps: (params) => gunSelectionSchema(params.luck, gunPins(params).maxRarity),
  pin: (params) => gunPins(params).pin,
  build(result, params, rng): GunRoll {
    const unique = params.unique === "" ? undefined : uniqueGun(params.unique);
    const base = result.values["family"] as FamilyBase;
    const tier = result.values["rarity"] as GunRarity;
    const rarity = tier.id;
    const maker = result.values["maker"] as { manufacturer: Manufacturer; legendaryName: string | null };
    const manufacturer = maker.manufacturer;
    const legendaryName = maker.legendaryName;

    let element: GunElement = "none";
    if (unique !== undefined) element = unique.element;
    else if (manufacturer.neverElemental !== true) {
      if (manufacturer.forcedElement !== undefined) element = manufacturer.forcedElement;
      else if (manufacturer.id === "Voltek" || rng() < tier.elementChance) element = pick(rng, ELEMENTS);
    }

    const gunLevel = params.level;
    const levelMult = LEVEL_DAMAGE_GROWTH ** (gunLevel - 1);
    const jitter = 0.92 + rng() * 0.16;
    const damage = Math.max(1, Math.round(base.stats.damage * tier.mult * manufacturer.damage * levelMult * jitter));
    const magSize = Math.max(2, Math.round(base.magSize * manufacturer.mag));
    const elementPrefix = element === "none" ? "" : `${ELEMENT_PREFIX[element]} `;
    const name = unique !== undefined
      ? unique.name
      : legendaryName !== null
        ? `${elementPrefix}${legendaryName}`
        : `${elementPrefix}${pick(rng, manufacturer.prefixes)} ${pick(rng, base.nouns)}`;

    return {
      kind: "gun",
      name,
      family: base.family,
      manufacturer: manufacturer.id,
      model: unique !== undefined ? `unique:${unique.name}` : legendaryName !== null ? `legendary:${legendaryName}` : `${manufacturer.id}:${base.family}`,
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
  },
  describe: (gun) => [gun.name, `${gun.rarity} ${gun.family} · ${gun.manufacturer} · L${gun.level}`, `${gun.weapon.damage} dmg · ${gun.magSize} mag · ${gun.element}`],
};

/** The gun roll as a seeded generator, so the editor and agents can roll variants of it. */
export const GUN_GENERATOR = defineItemGenerator(GUN_RECIPE);
registerGenerator(GUN_GENERATOR);

export function rollGun(rng: () => number, level: number, options: RollGunOptions = {}): GunDef {
  const params: GunParams = {
    level: options.level ?? level,
    luck: options.luck ?? 1,
    family: options.family ?? "",
    rarity: options.rarity ?? "",
    maxRarity: options.maxRarity ?? "",
    maker: options.maker ?? "",
    legendary: options.legendary ?? "",
    unique: options.unique ?? "",
    seed: "",
  };
  const rolled = rollItemRecipe(GUN_RECIPE, params, rng);
  gunSerial += 1;
  const def: GunDef = { id: `gun_${gunSerial}_${rolled.item.family}_${rolled.item.rarity}`, ...rolled.item };
  // Perks come off the gun's own id stream (see `derivePerks`), never the roll rng above.
  def.perks = derivePerks(def);
  gunProvenanceById.set(def.id, rolled.provenance);
  return registerGun(def);
}
