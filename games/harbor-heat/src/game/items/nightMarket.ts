import { createShopStock } from "@jgengine/core/economy/shopStock";
import type { AffixPool, RarityTier } from "@jgengine/core/item/affix";
import type { LootCatalog } from "@jgengine/core/loot/lootGen";
import { rollLoot, type LootItem } from "@jgengine/core/loot/lootGen";
import { stockVendor, type VendorPriceRule } from "@jgengine/core/loot/vendor";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { credLevel } from "../progression/cred";
import type { WeaponDef } from "./weapons/catalog";
import { earn, spend } from "../cash";

const BASES = [
  { id: "street_pistol", label: "Harbor 9", damage: 14, fireIntervalMs: 280, magSize: 12, ammo: "9mm" as const },
  { id: "street_smg", label: "Carmine SMG", damage: 9, fireIntervalMs: 95, magSize: 28, ammo: "9mm" as const },
  { id: "street_shotgun", label: "Boardwalk 12g", damage: 42, fireIntervalMs: 850, magSize: 6, ammo: "shell" as const },
];

const pools: AffixPool[] = [
  {
    id: "street",
    affixes: [
      { id: "ported", stat: "damage", roll: [2, 7], weight: 3, minLevel: 1, namePart: { position: "prefix", text: "Ported" } },
      { id: "wired", stat: "fireIntervalMs", op: "mul", roll: [0.75, 0.92], weight: 2, minLevel: 2, namePart: { position: "suffix", text: "Wired" } },
      { id: "extended", stat: "magSize", roll: [2, 6], weight: 2, minLevel: 2, namePart: { position: "suffix", text: "Extended" } },
    ],
  },
];

const rarities: RarityTier[] = [
  { id: "common", weight: 50, affixCount: 1 },
  { id: "uncommon", weight: 28, affixCount: 2, statScale: 1.12, namePart: "Tuned" },
  { id: "rare", weight: 16, affixCount: 2, statScale: 1.3, namePart: "Custom" },
  { id: "epic", weight: 6, affixCount: 3, statScale: 1.55, namePart: "Prototype" },
];

const catalog: LootCatalog = {
  bases: BASES.map((base) => ({
    id: base.id,
    name: base.label,
    baseStats: { damage: base.damage, fireIntervalMs: base.fireIntervalMs, magSize: base.magSize },
    pools: ["street"],
    mass: 3,
  })),
  parts: [],
  pools,
  rarities,
  manufacturers: [
    { id: "Vice", name: "Vice", scale: { damage: 1.1, fireIntervalMs: 0.95 }, favoredPools: ["street"] },
    { id: "Dockside", name: "Dockside", scale: { damage: 0.92, magSize: 1.25 }, favoredPools: ["street"] },
  ],
  levelScale: [[1, 1], [10, 1.7], [20, 2.4]],
};

const DAY_SECONDS = 240;
const priceRule: VendorPriceRule = {
  currency: "cash",
  base: 180,
  perLevel: 55,
  rarityMultiplier: { uncommon: 1.15, rare: 1.4, epic: 1.8 },
  sellFactor: 0.45,
};

export interface MarketItemView {
  id: string;
  name: string;
  rarity: string;
  level: number;
  damage: number;
  price: number;
}

export interface MarketView {
  day: number;
  items: readonly MarketItemView[];
}

export const marketStore = defineStore<MarketView | null>("harbor.market", null);

function parseId(id: string): { day: number; level: number; index: number } | null {
  const match = /^market\.(\d+)\.(\d+):(\d+)$/.exec(id);
  if (match === null) return null;
  return { day: Number(match[1]), level: Number(match[2]), index: Number(match[3]) };
}

function rollAt(day: number, level: number, index: number): LootItem {
  const rng = seededRng(`harbor-market:${day}`);
  let item = rollLoot(catalog, rng, { level });
  for (let i = 0; i < index; i += 1) item = rollLoot(catalog, rng, { level });
  return item;
}

function toWeapon(def: WeaponDef): WeaponDef {
  return def;
}

/** The generated gun behind a night-market id, rebuilt deterministically from the id itself. */
export function marketGunById(id: string): WeaponDef | null {
  const parsed = parseId(id);
  if (parsed === null) return null;
  const item = rollAt(parsed.day, parsed.level, parsed.index);
  const base = BASES.find((entry) => entry.id === item.baseId) ?? BASES[0]!;
  return toWeapon({
    id,
    label: item.name,
    kind: "weapon",
    use: "fireGun",
    ammo: base.ammo,
    ammoPerShot: 1,
    fireIntervalMs: Math.max(45, Math.round((item.stats.fireIntervalMs as number | undefined) ?? base.fireIntervalMs)),
    weapon: { damage: Math.max(1, Math.round((item.stats.damage as number | undefined) ?? base.damage)) },
  });
}

/** Refresh the night market once per authored day and publish its rows to the HUD. */
export function ensureNightMarket(ctx: GameContext): MarketView {
  const day = Math.floor(ctx.time.now() / DAY_SECONDS);
  const current = marketStore.read(ctx);
  if (current !== null && current.day === day) return current;
  const level = Math.max(1, credLevel(ctx));
  const shop = createShopStock();
  const offers = stockVendor(shop, {
    catalog,
    rng: seededRng(`harbor-market:${day}`),
    level,
    count: 3,
    price: priceRule,
    idPrefix: `market.${day}.${level}`,
  });
  const items = offers.map((offer) => ({
    id: offer.entry.id,
    name: offer.item.name,
    rarity: offer.item.rarity,
    level: offer.item.level,
    damage: Math.round((offer.item.stats.damage as number | undefined) ?? 0),
    price: offer.entry.price.amount,
  }));
  const view: MarketView = { day, items };
  marketStore.write(ctx, view);
  return view;
}

/** Buy one night-market gun with cash through the shared economy, then hand it to the hotbar. */
export function buyNightMarket(ctx: GameContext, id: string): boolean {
  const view = ensureNightMarket(ctx);
  const row = view.items.find((item) => item.id === id);
  if (row === undefined) return false;
  const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
  if (cash < row.price) {
    ctx.game.notices.push({ text: `Night market wants $${row.price}.`, tone: "deny" });
    return false;
  }
  if (!spend(ctx, row.price, "market-purchase", id)) return false;
  const put = ctx.player.inventory.put("hotbar", id, 1);
  if (put.status !== "ok") {
    earn(ctx, row.price, "market-refund", id);
    ctx.game.notices.push({ text: "Hotbar is full.", tone: "deny" });
    return false;
  }
  marketStore.write(ctx, { ...view, items: view.items.filter((item) => item.id !== id) });
  ctx.game.notices.push({ text: `Bought ${row.name} for $${row.price}.`, tone: "success" });
  return true;
}
