import type { Curve } from "@jgengine/core/progression/leveling";
import type { VehicleSpec } from "@jgengine/core/physics/vehicleSpec";
import { createUpgradeTree, type UpgradeBuy, type UpgradeNodeDef, type UpgradeState } from "@jgengine/core/progression/upgrades";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

/** Where an upgrade is sold: Rita's bay, the Ammu-Isle counter, or the bungalow itself. */
export type UpgradeShop = "garage" | "house";

export interface HarborUpgrade extends UpgradeNodeDef {
  shop: UpgradeShop;
  label: string;
  /** What each rank does, one line per rank, in the board's words. */
  lines: readonly string[];
}

/** Rank `n` costs `prices[n - 1]`. */
const priced = (...prices: number[]): Curve => ({ kind: "steps", values: [0, ...prices] });

/**
 * What Sunset Motors and the bungalow sell beyond the shop's own books: bike mods apply to every vehicle
 * you own, and the bungalow's rooms to resting there and to the tide warning.
 */
export const UPGRADES: readonly HarborUpgrade[] = [
  { id: "car_engine", shop: "garage", label: "Engine tune", maxRank: 3, cost: priced(900, 1800, 3600), lines: ["+12% pull", "+24% pull", "+36% pull"] },
  { id: "car_brakes", shop: "garage", label: "Race brakes", maxRank: 2, cost: priced(600, 1400), lines: ["+20% stopping", "+40% stopping"] },
  { id: "car_grip", shop: "garage", label: "Sticky tyres", maxRank: 2, cost: priced(800, 1700), lines: ["+10% grip", "+20% grip"] },
  { id: "car_armor", shop: "garage", label: "Armored panels", maxRank: 3, cost: priced(1000, 2000, 4000), lines: ["Crashes hurt 20% less", "Crashes hurt 40% less", "Crashes hurt 60% less"] },
  { id: "house_med", shop: "house", label: "Med cabinet", cost: priced(1000), lines: ["Resting stocks a first-aid kit when you have none"] },
  { id: "house_locker", shop: "house", label: "Gear locker", cost: priced(1500), lines: ["Resting hangs a fresh crash jacket when you have none"] },
  { id: "house_wire", shop: "house", label: "Tide scanner", cost: priced(3000), lines: ["The tide warns you 25 minutes ahead instead of 10"] },
];

export const upgradeById = (id: string): HarborUpgrade | undefined => UPGRADES.find((node) => node.id === id);

/** Ranks owned, node id → rank. Durable progress: the world snapshot keeps it. */
export const upgradesStore = defineStore<UpgradeState | undefined>("harbor.upgrades", undefined);

export function upgradeRank(ctx: GameContext, id: string): number {
  return upgradesStore.read(ctx)?.ranks[id] ?? 0;
}

/** Buy the next rank of one upgrade, charging `pay` only once every gate passed. */
export function buyUpgrade(ctx: GameContext, id: string, pay: (cost: number) => boolean): UpgradeBuy {
  const tree = createUpgradeTree({ nodes: UPGRADES, state: upgradesStore.read(ctx) ?? { ranks: {} } });
  const result = tree.buy(id, ctx.player.userId, pay);
  if (result.ok) upgradesStore.write(ctx, tree.snapshot());
  return result;
}

/** Price of the next rank, or null once maxed. */
export function nextUpgradeCost(ctx: GameContext, id: string): number | null {
  const tree = createUpgradeTree({ nodes: UPGRADES, state: upgradesStore.read(ctx) ?? { ranks: {} } });
  return tree.costOf(id);
}

/** An owned car's handling with the bay's mods on it. A stranger's car drives stock. */
export function moddedTuning(ctx: GameContext, base: VehicleSpec): VehicleSpec {
  const engine = 1 + 0.12 * upgradeRank(ctx, "car_engine");
  const brakes = 1 + 0.2 * upgradeRank(ctx, "car_brakes");
  const grip = 1 + 0.1 * upgradeRank(ctx, "car_grip");
  if (engine === 1 && brakes === 1 && grip === 1) return base;
  return {
    ...base,
    engine: {
      ...base.engine,
      accel: base.engine.accel * engine,
      topSpeed: base.engine.topSpeed * (1 + (engine - 1) / 2),
    },
    brakes: { ...base.brakes, brake: base.brakes.brake * brakes },
    tires: { ...base.tires, grip: base.tires.grip * grip },
    steering: { ...base.steering, turnRate: base.steering.turnRate * (1 + (grip - 1) / 2) },
  };
}

/** Share of a crash an owned car still takes, 1 stock down to 0.4 fully armored. */
export function crashShare(ctx: GameContext): number {
  return 1 - 0.2 * upgradeRank(ctx, "car_armor");
}

