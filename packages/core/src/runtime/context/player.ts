import {
  balance as walletBalance,
  charge as walletCharge,
  createEmptyWallet,
  grant as walletGrant,
  isOverdrawn as walletIsOverdrawn,
  type WalletState,
} from "../../economy/wallet";
import type { GameFeatures } from "../../game/defineGame";
import type { InventoryDeclaration } from "../../game/defineGame";
import type { GameEvents } from "../../game/events";
import { createLoadouts, type Loadouts } from "../../game/loadout";
import type { Unlocks } from "../../game/unlocks";
import {
  createInventorySet,
  putItem,
  type InventoryLayout,
  type InventorySet,
  type InventoryState,
  type ItemTraits,
} from "../../inventory/inventoryModel";
import { createPoseState, type PoseState } from "../../movement/poseState";
import { createPossession, type Possession } from "../../scene/possession";
import type { EntityStore } from "../../scene/entityStore";
import { setStatValue, type StatValueMap } from "../../scene/entityStats";
import { createStats, type Stats } from "../../stats/statModifiers";
import { notifyAfter } from "../../store/changeSignal";
import { createMotionIntents, type MotionIntents } from "../motionIntents";
import type {
  GameContextEconomy,
  GameContextEntityEntry,
} from "../gameContext";

/** @internal Wiring player-owned state needs from the live context. */
export interface PlayerSubsystemDeps {
  signalNotify: () => void;
  inventoryDeclarations: Record<string, InventoryDeclaration>;
  entities: EntityStore;
  events: GameEvents;
  catalogEntry: (instanceId: string) => GameContextEntityEntry | null | undefined;
  ensureInstanceStats: (instanceId: string) => StatValueMap;
  /** Reads another feature after descriptor install (loadout → unlocks). */
  feature: <T>(key: keyof GameFeatures) => T | undefined;
}

/** @internal Inventory, wallets, pose, motion, loadout — per-player state surfaces. */
export interface PlayerSubsystem {
  inventoryIds: readonly string[];
  inventoryByUser: ReadonlyMap<string, InventorySet<string>>;
  inventoryFor: (userId: string) => InventorySet<string>;
  layouts: Record<string, InventoryLayout>;
  wallets: Map<string, WalletState>;
  walletOf: (userId: string) => WalletState;
  economy: GameContextEconomy;
  putIntoAnyInventory: (userId: string, itemId: string, count: number) => void;
  playerStatsFor: (userId: string) => Stats<string>;
  pose: PoseState;
  possession: Possession;
  motionByUser: ReadonlyMap<string, MotionIntents>;
  motionFor: (userId: string) => MotionIntents;
  loadouts: Loadouts;
  seedUserPool: (
    userId: string,
    statId: string,
    pool: { current: number; max?: number; min?: number },
  ) => void;
}

/** @internal */
export function createPlayerSubsystem(d: PlayerSubsystemDeps): PlayerSubsystem {
  const { signalNotify, entities, events, catalogEntry, ensureInstanceStats, feature } = d;

  const playerStatsByUser = new Map<string, Stats<string>>();
  function playerStatsFor(userId: string): Stats<string> {
    let stats = playerStatsByUser.get(userId);
    if (stats === undefined) {
      stats = createStats<string>({});
      playerStatsByUser.set(userId, stats);
    }
    return stats;
  }

  const pose = createPoseState((instanceId) => catalogEntry(instanceId)?.movement);
  const possession = notifyAfter(
    createPossession({ entities, events }),
    ["possess", "own", "disown"],
    signalNotify,
  );

  const inventoryDeclarations = d.inventoryDeclarations;
  const inventoryIds = Object.keys(inventoryDeclarations);
  const layouts: Record<string, InventoryLayout> = {};
  for (const [inventoryId, declaration] of Object.entries(inventoryDeclarations)) {
    layouts[inventoryId] = { slots: declaration.slots, accepts: declaration.accepts };
  }
  const traits: ItemTraits =
    Object.values(inventoryDeclarations).find((declaration) => declaration.traits !== undefined)
      ?.traits ?? { stackLimit: () => Number.POSITIVE_INFINITY };
  const inventoryByUser = new Map<string, InventorySet<string>>();
  function inventoryFor(userId: string): InventorySet<string> {
    let set = inventoryByUser.get(userId);
    if (set === undefined) {
      set = notifyAfter(
        createInventorySet(layouts, traits),
        ["put", "take", "move", "replaceState"],
        signalNotify,
      );
      inventoryByUser.set(userId, set);
    }
    return set;
  }

  const wallets = new Map<string, WalletState>();
  const walletOf = (userId: string) => wallets.get(userId) ?? createEmptyWallet();
  const economy: GameContextEconomy = {
    balance: (userId, currencyId) => walletBalance(walletOf(userId), currencyId),
    grant(userId, currencyId, amount) {
      wallets.set(userId, walletGrant(walletOf(userId), currencyId, amount));
      signalNotify();
    },
    charge(userId, currencyId, amount, options) {
      const result = walletCharge(walletOf(userId), currencyId, amount, options);
      if (result.status === "rejected") return { reason: result.reason };
      wallets.set(userId, result.state);
      signalNotify();
      return null;
    },
    isOverdrawn: (userId, currencyId) => walletIsOverdrawn(walletOf(userId), currencyId),
  };

  function putIntoAnyInventory(userId: string, itemId: string, count: number): void {
    const inventory = inventoryFor(userId);
    for (const inventoryId of inventoryIds) {
      if (inventory.put(inventoryId, itemId, count).status === "ok") return;
    }
  }

  function seedUserPool(
    userId: string,
    statId: string,
    pool: { current: number; max?: number; min?: number },
  ): void {
    const map = ensureInstanceStats(userId);
    const next = setStatValue(map, statId, pool);
    map[statId] = next[statId]!;
  }

  const loadouts = notifyAfter(
    createLoadouts({
      inventory: {
        begin(userId) {
          const inventory = inventoryFor(userId);
          const staged = new Map<string, InventoryState>();
          return {
            put(inventoryId, itemId, count, slot) {
              const layout = layouts[inventoryId];
              if (layout === undefined) return { reason: `unknown inventory "${inventoryId}"` };
              const state = staged.get(inventoryId) ?? inventory.state(inventoryId);
              const result = putItem(
                state,
                layout,
                traits,
                itemId,
                count,
                slot === undefined ? undefined : { slot },
              );
              if (result.status === "rejected") return { reason: result.reason };
              staged.set(inventoryId, result.state);
              return null;
            },
            commit() {
              for (const [inventoryId, state] of staged) inventory.replaceState(inventoryId, state);
            },
          };
        },
      },
      stats: { seed: seedUserPool },
      economy: { grant: economy.grant },
      unlocks: { grant: (userId, unlockId) => feature<Unlocks>("unlocks")?.grant(userId, unlockId) },
    }),
    ["applyLoadout"],
    signalNotify,
  );

  const motionByUser = new Map<string, MotionIntents>();
  function motionFor(userId: string): MotionIntents {
    let queue = motionByUser.get(userId);
    if (queue === undefined) {
      queue = createMotionIntents();
      motionByUser.set(userId, queue);
    }
    return queue;
  }

  return {
    inventoryIds,
    inventoryByUser,
    inventoryFor,
    layouts,
    wallets,
    walletOf,
    economy,
    putIntoAnyInventory,
    playerStatsFor,
    pose,
    possession,
    motionByUser,
    motionFor,
    loadouts,
    seedUserPool,
  };
}
