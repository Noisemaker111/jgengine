import { createInventorySet } from "@jgengine/core/inventory/inventoryModel";
import { defaultKeyValueStorage } from "@jgengine/core/game/keyValueStore";
import type { AffixPool, RarityTier } from "@jgengine/core/item/affix";
import type { LootCatalog, LootItem } from "@jgengine/core/loot/lootGen";
import { compareToEquipped, rollDrop, type EquippedStatDelta, type ItemDrop } from "@jgengine/core/loot/drop";
import { createRunHaul } from "@jgengine/core/loot/haul";
import { createItemLedger, salvageItem, type SalvageYield } from "@jgengine/core/loot/salvage";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { noteEquipped } from "../feel";
import { earn } from "../cash";
import { FAMILY_BASES, MANUFACTURERS, gunById, perkLines, registerGun, type GunDef, type GunFamily, type PerkLine, type Rarity } from "../handroll";
import { lastPickupStore } from "../stores";

const pools: AffixPool[] = [
  {
    id: "gun",
    affixes: [
      { id: "overclocked", stat: "damage", roll: [3, 9], weight: 3, minLevel: 1, namePart: { position: "prefix", text: "Overclocked" } },
      { id: "hollowpoint", stat: "damage", op: "mul", roll: [1.1, 1.28], weight: 2, minLevel: 2 },
      { id: "quickdraw", stat: "fireIntervalMs", op: "mul", roll: [0.74, 0.9], weight: 2, minLevel: 1, namePart: { position: "prefix", text: "Quickdraw" } },
      { id: "stable", stat: "spread", op: "mul", roll: [0.68, 0.88], weight: 2, minLevel: 2, namePart: { position: "suffix", text: "of Stability" } },
      { id: "highcap", stat: "magSize", roll: [2, 6], weight: 2, minLevel: 2, namePart: { position: "suffix", text: "Extended" } },
      { id: "hairsplitter", stat: "critChance", roll: [0.05, 0.12], weight: 1, minLevel: 4, namePart: { position: "prefix", text: "Hairsplitter" } },
    ],
  },
];

const rarities: RarityTier[] = [
  { id: "common", weight: 52, affixCount: 1, statScale: 1 },
  { id: "uncommon", weight: 26, affixCount: 2, statScale: 1.12, namePart: "Tuned" },
  { id: "rare", weight: 14, affixCount: 2, statScale: 1.28, namePart: "Custom" },
  { id: "epic", weight: 6, affixCount: 3, statScale: 1.5, namePart: "Prototype" },
  { id: "legendary", weight: 2, affixCount: 4, statScale: 1.85, namePart: "Relic" },
];

const catalog: LootCatalog = {
  bases: FAMILY_BASES.map((base) => ({
    id: base.family,
    name: base.nouns[0]!,
    baseStats: {
      damage: base.stats.damage,
      fireIntervalMs: base.stats.fireIntervalMs,
      spread: base.stats.spread,
      critChance: base.stats.critChance,
      magSize: base.magSize,
      reloadMs: base.reloadMs,
    },
    pools: ["gun"],
    mass: base.family === "launcher" ? 7 : base.family === "sniper" ? 5 : 3,
  })),
  parts: [],
  pools,
  rarities,
  manufacturers: MANUFACTURERS.map((maker) => ({
    id: maker.id,
    name: maker.id,
    scale: {
      damage: maker.damage,
      fireIntervalMs: maker.interval,
      spread: maker.spread,
      magSize: maker.mag,
      reloadMs: maker.reload,
    },
  })),
  levelScale: [[1, 1], [10, 1.8], [20, 2.6]],
};

const dropById = new Map<string, ItemDrop>();
const ledger = createItemLedger();
const storage = typeof localStorage === "undefined" ? null : defaultKeyValueStorage();
const DROPS_KEY = "scrap-signal.field-drops";
const LEDGER_KEY = "scrap-signal.field-ledger";

function saveDrops(): void {
  if (storage === null) return;
  try {
    storage.setItem(DROPS_KEY, JSON.stringify([...dropById.values()].slice(-60)));
    storage.setItem(LEDGER_KEY, JSON.stringify(ledger.snapshot()));
  } catch {
    // A blocked save cell keeps the session working; the next roll retries.
  }
}

function hydrateDrops(): void {
  if (storage === null) return;
  try {
    const rawDrops = storage.getItem(DROPS_KEY);
    if (rawDrops !== null) {
      for (const drop of JSON.parse(rawDrops) as ItemDrop[]) {
        dropById.set(drop.id, drop);
        toGun(drop);
      }
    }
    const rawLedger = storage.getItem(LEDGER_KEY);
    if (rawLedger !== null) ledger.restore(JSON.parse(rawLedger) as Record<string, "salvaged" | "sold">);
  } catch {
    // A malformed save starts the field stash empty rather than crashing the run.
  }
}

const inventories = createInventorySet({ run: { slots: 6 }, stash: { slots: 12 } }, { stackLimit: () => 99 });
const haul = createRunHaul({
  inventories,
  runId: "run",
  stashId: "stash",
  weightOf: (id) => dropById.get(id)?.mass ?? 3,
  capacity: 24,
  storage,
  key: "scrap-signal.field-stash",
});

/** HUD read-model: the newest field gun, its deltas against the worn gun, and the stash load. */
export interface FieldGearView {
  dropId: string;
  name: string;
  rarity: string;
  manufacturer: string;
  level: number;
  mass: number;
  affixes: readonly string[];
  /** The gun's perks (rare and up), as the card draws them. */
  perks: readonly PerkLine[];
  deltas: readonly EquippedStatDelta[];
  better: "candidate" | "equipped" | "equal";
  carried: boolean;
  stash: readonly string[];
  runMass: number;
  remaining: number;
}

export const fieldGearStore = defineStore<FieldGearView | null>("scrap.fieldGear", null);

function wornStats(ctx: GameContext): ItemDrop | null {
  for (const slot of ctx.player.inventory.state("hotbar").slots) {
    if (slot === null) continue;
    const gun = gunById(slot.itemId);
    if (gun === undefined) continue;
    return {
      id: gun.id,
      baseId: gun.family,
      manufacturer: gun.manufacturer,
      rarity: gun.rarity,
      level: gun.level,
      name: gun.name,
      parts: [],
      affixes: [],
      stats: {
        damage: gun.weapon.damage,
        fireIntervalMs: gun.weapon.fireIntervalMs,
        spread: gun.weapon.spread,
        critChance: gun.weapon.critChance,
        magSize: gun.magSize,
        reloadMs: gun.reloadMs,
      },
      mass: 3,
    };
  }
  return null;
}

function toGun(drop: ItemDrop): GunDef {
  const family = drop.baseId as GunFamily;
  const base = FAMILY_BASES.find((entry) => entry.family === family) ?? FAMILY_BASES[0]!;
  const stats = drop.stats;
  const gun: GunDef = {
    id: drop.id,
    kind: "gun",
    name: drop.name,
    family,
    manufacturer: drop.manufacturer,
    rarity: drop.rarity as Rarity,
    element: "none",
    level: drop.level,
    ammo: base.ammo,
    auto: base.auto,
    ammoPerShot: base.ammoPerShot,
    magSize: Math.max(1, Math.round(stats.magSize ?? base.magSize)),
    reloadMs: Math.max(200, Math.round(stats.reloadMs ?? base.reloadMs)),
    elementChance: 0,
    elementDps: 0,
    use: "fireGun",
    weapon: {
      ...base.stats,
      damage: Math.max(1, Math.round(stats.damage ?? base.stats.damage)),
      fireIntervalMs: Math.max(40, Math.round(stats.fireIntervalMs ?? base.stats.fireIntervalMs)),
      spread: Math.max(0.05, stats.spread ?? base.stats.spread),
      critChance: Math.min(0.95, stats.critChance ?? base.stats.critChance),
    },
  };
  return registerGun(gun);
}

function stashNames(): string[] {
  return inventories.state("stash").slots
    .filter((slot) => slot !== null)
    .map((slot) => gunById(slot!.itemId)?.name ?? slot!.itemId);
}

function writeView(ctx: GameContext, drop: ItemDrop, carried: boolean, worn: ItemDrop | null): FieldGearView {
  const comparison = compareToEquipped(drop, worn, {
    lowerIsBetter: ["fireIntervalMs", "spread", "reloadMs"],
    weights: { damage: 10, fireIntervalMs: 0.05, spread: 5, magSize: 0.4, reloadMs: 0.02, critChance: 25 },
  });
  const label: Record<string, string> = {
    damage: "damage",
    fireIntervalMs: "fire rate",
    spread: "spread",
    critChance: "crit",
    magSize: "mag",
    reloadMs: "reload",
  };
  const mass = haul.mass();
  const fieldGun = gunById(drop.id);
  const view: FieldGearView = {
    dropId: drop.id,
    name: drop.name,
    rarity: drop.rarity,
    manufacturer: drop.manufacturer,
    level: drop.level,
    mass: drop.mass ?? 3,
    affixes: drop.affixes.map((affix) =>
      affix.op === "mul"
        ? `${label[affix.stat] ?? affix.stat} x${Math.round(affix.value * 100) / 100}`
        : `${label[affix.stat] ?? affix.stat} +${Math.round(affix.value * 10) / 10}`,
    ),
    perks: fieldGun === undefined ? [] : perkLines(fieldGun),
    deltas: comparison.deltas,
    better: comparison.better,
    carried,
    stash: stashNames(),
    runMass: mass.run,
    remaining: mass.remaining,
  };
  fieldGearStore.write(ctx, view);
  return view;
}

/**
 * Roll one field gun at `level`, compare it with the worn gun, and try to carry it. A gun over the
 * carry weight stays on the ground (`carried: false`) but still compares.
 */
export function scanFieldGun(ctx: GameContext, seed: string, level: number): FieldGearView {
  const drop = rollDrop(catalog, seed, { level });
  dropById.set(drop.id, drop);
  toGun(drop);
  saveDrops();
  const carried = haul.carry(drop.id).ok;
  return writeView(ctx, drop, carried, wornStats(ctx));
}

/** Bank every carried field gun into the persistent stash; called when the player changes zone. */
export function bankFieldHaul(ctx: GameContext): number {
  const moved = haul.bank().stacks.length;
  const current = fieldGearStore.read(ctx);
  if (current !== null) fieldGearStore.write(ctx, { ...current, stash: stashNames(), runMass: 0 });
  return moved;
}

/** Break a carried or stashed field gun into cores, once. */
export function salvageFieldGun(ctx: GameContext, dropId: string): SalvageYield | null {
  const drop = dropById.get(dropId);
  if (drop === undefined) return null;
  const result = salvageItem(drop, { currency: "cores", perLevel: 4, rarityMultiplier: { rare: 1.5, epic: 2, legendary: 3 } }, ledger);
  if (!result.ok) return null;
  if (inventories.count("run", dropId) > 0) inventories.take("run", dropId, 1);
  else inventories.take("stash", dropId, 1);
  saveDrops();
  earn(ctx, result.yield.currency, result.yield.amount, "salvage", dropId);
  const current = fieldGearStore.read(ctx);
  if (current !== null) fieldGearStore.write(ctx, { ...current, stash: stashNames() });
  return result.yield;
}

/** Move a carried field gun into the hotbar and mark it worn. */
export function equipFieldGun(ctx: GameContext, dropId: string): boolean {
  if (!ledger.canUse(dropId)) return false;
  const gun = gunById(dropId);
  if (gun === undefined) return false;
  const put = ctx.player.inventory.put("hotbar", dropId, 1, { slot: 0 });
  if (put.status !== "ok") return false;
  inventories.take("run", dropId, 1);
  noteEquipped(dropId);
  lastPickupStore.write(ctx, { gunId: dropId, atMs: ctx.time.now() * 1000 });
  return true;
}

/** Stash and run state for a HUD or test, detached from the live inventories. */
export function fieldHaulState(): { run: readonly string[]; stash: readonly string[]; mass: number; remaining: number } {
  const state = haul.state();
  const ids = (slots: readonly ({ itemId: string } | null)[]) => slots.filter((slot) => slot !== null).map((slot) => slot!.itemId);
  const mass = haul.mass();
  return { run: ids(state.run.slots), stash: ids(state.stash.slots), mass: mass.run, remaining: mass.remaining };
}

export type { LootItem };

hydrateDrops();
