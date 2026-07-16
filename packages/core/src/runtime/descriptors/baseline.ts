import type { WalletState } from "../../economy/wallet";
import type { FeedEntry, GameFeed } from "../../game/feed";
import type { InventorySet, InventoryState } from "../../inventory/inventoryModel";
import type { PoseSnapshot, PoseState } from "../../movement/poseState";
import {
  hydrateEntityStats,
  snapshotEntityStats,
  type StatValueMap,
} from "../../scene/entityStats";
import type { EntityStore, SceneEntity } from "../../scene/entityStore";
import type { Possession, PossessionSnapshot } from "../../scene/possession";
import type { ObservableKeyedStore } from "../../store/observableKeyedStore";
import type { ClockSnapshot, SimClock } from "../../time/simClock";
import type { MotionIntentBatch, MotionIntents } from "../motionIntents";
import type { SnapshotModule } from "../worldSnapshot";

/** @internal The live always-on subsystems the baseline descriptors serialize — handed in by `createGameContext`. */
export interface BaselineDeps {
  signalNotify: () => void;
  entities: EntityStore;
  statsByInstance: Map<string, StatValueMap>;
  store: ObservableKeyedStore<unknown>;
  feed: GameFeed;
  inventoryIds: readonly string[];
  inventoryByUser: ReadonlyMap<string, InventorySet<string>>;
  inventoryFor: (userId: string) => InventorySet<string>;
  wallets: Map<string, WalletState>;
  time: SimClock;
  pose: PoseState;
  possession: Possession;
  motionByUser: ReadonlyMap<string, MotionIntents>;
  motionFor: (userId: string) => MotionIntents;
}

/** @internal What an always-on baseline descriptor contributes: a replication module, a save-only module, or both. */
export interface BaselineBuild {
  /** Registered into the host→client replication set (`ctx.snapshot`/`ctx.hydrate`), and therefore also into the save set. */
  replicate?: SnapshotModule;
  /** Registered into the whole-world save-only set (`ctx.game.save`) — persisted but never sent to clients. */
  save?: SnapshotModule;
}

/**
 * Always-on counterpart to {@link featureDescriptors}: each baseline subsystem (entities, stats,
 * store, feed, inventory, economy, time, pose, possession, motion) owns its own serialization here
 * instead of `createGameContext` hand-maintaining two distant module arrays. Order is
 * load-bearing — it fixes the snapshot key order, so it must stay stable.
 * @internal
 */
export interface BaselineDescriptor {
  readonly key: string;
  create(deps: BaselineDeps): BaselineBuild;
}

/** @internal */
export const baselineDescriptors: readonly BaselineDescriptor[] = [
  {
    key: "entities",
    create: (d) => ({
      replicate: {
        key: "entities",
        snapshot: () => d.entities.snapshot(),
        hydrate: (data) => d.entities.hydrate(data as SceneEntity[]),
      },
    }),
  },
  {
    key: "stats",
    create: (d) => ({
      replicate: {
        key: "stats",
        snapshot: () => snapshotEntityStats(d.statsByInstance),
        hydrate: (data) => hydrateEntityStats(d.statsByInstance, data as Record<string, StatValueMap>),
      },
    }),
  },
  {
    key: "store",
    create: (d) => ({
      replicate: {
        key: "store",
        snapshot: () => d.store.snapshot(),
        hydrate: (data) => d.store.hydrate(data as readonly (readonly [string, unknown])[]),
      },
    }),
  },
  {
    key: "feed",
    create: (d) => ({
      replicate: {
        key: "feed",
        snapshot: () => d.feed.snapshot(),
        hydrate: (data) => d.feed.hydrate(data as Record<string, FeedEntry[]>),
      },
    }),
  },
  {
    key: "inventory",
    create: (d) => ({
      replicate: {
        key: "inventory",
        snapshot: () => {
          const byUser: Record<string, Record<string, InventoryState>> = {};
          for (const [userId, set] of d.inventoryByUser) {
            const states: Record<string, InventoryState> = {};
            for (const inventoryId of d.inventoryIds) states[inventoryId] = set.state(inventoryId);
            byUser[userId] = states;
          }
          return byUser;
        },
        hydrate: (data) => {
          for (const [userId, states] of Object.entries(data as Record<string, Record<string, InventoryState>>)) {
            const set = d.inventoryFor(userId);
            for (const [inventoryId, state] of Object.entries(states)) set.replaceState(inventoryId, state);
          }
        },
      },
    }),
  },
  {
    key: "economy",
    create: (d) => ({
      save: {
        key: "economy",
        snapshot: () => Object.fromEntries(d.wallets),
        hydrate: (data) => {
          d.wallets.clear();
          for (const [userId, state] of Object.entries(data as Record<string, WalletState>)) {
            d.wallets.set(userId, state);
          }
          d.signalNotify();
        },
      },
    }),
  },
  {
    key: "time",
    create: (d) => ({
      save: {
        key: "time",
        snapshot: () => d.time.snapshot(),
        hydrate: (data) => d.time.hydrate(data as ClockSnapshot),
      },
    }),
  },
  {
    key: "pose",
    create: (d) => ({
      save: {
        key: "pose",
        snapshot: () => d.pose.snapshotAll(),
        hydrate: (data) => d.pose.hydrateAll(data as PoseSnapshot),
      },
    }),
  },
  {
    key: "possession",
    create: (d) => ({
      save: {
        key: "possession",
        snapshot: () => d.possession.snapshotAll(),
        hydrate: (data) => d.possession.hydrateAll(data as PossessionSnapshot),
      },
    }),
  },
  {
    key: "motion",
    create: (d) => ({
      save: {
        key: "motion",
        snapshot: () => {
          const out: Record<string, MotionIntentBatch> = {};
          for (const [userId, queue] of d.motionByUser) out[userId] = queue.snapshot();
          return out;
        },
        hydrate: (data) => {
          for (const [userId, batch] of Object.entries(data as Record<string, MotionIntentBatch>)) {
            d.motionFor(userId).hydrate(batch);
          }
        },
      },
    }),
  },
];
