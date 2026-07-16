import type { CardPile, CardPileConfig, CardPileState } from "../../cards/cardPile";
import type { CommandRegistry } from "../../commands/commandRegistry";
import {
  canAfford as walletCanAfford,
  chargeAll as walletChargeAll,
  type WalletState,
} from "../../economy/wallet";
import { createCosmetics } from "../../game/cosmetics";
import type { GameFeatures } from "../../game/defineGame";
import type { GameEvents } from "../../game/events";
import { createLeaderboard, type LeaderboardRow } from "../../game/leaderboard";
import { createGameDialogue } from "../../game/dialogue";
import { createQuestJournal, type QuestSnapshotEntry } from "../../game/quest";
import { createChat, type ChatSnapshot } from "../../game/chat";
import { type Social, type SocialSnapshot } from "../../game/social";
import { createTradeSystem } from "../../game/trade";
import { createUnlocks, type Unlocks } from "../../game/unlocks";
import type { InventoryLayout, InventorySet } from "../../inventory/inventoryModel";
import type { StatValueMap } from "../../scene/entityStats";
import type { EntityStore } from "../../scene/entityStore";
import { createRoster, type RosterEntry } from "../../scene/roster";
import { createConnectedPlayers } from "../../game/connectedPlayers";
import type { SpatialApi } from "../../scene/spatial";
import { notifyAfter } from "../../store/changeSignal";
import type { ObservableKeyedStore } from "../../store/observableKeyedStore";
import type { SnapshotModule } from "../worldSnapshot";
import type { TurnLoop, TurnLoopConfig, TurnLoopSnapshot } from "../../turn/turnLoop";
import type { RaceState, RaceStateConfig } from "../../game/race";
import type {
  GameContext,
  GameContextCards,
  GameContextContent,
  GameContextEconomy,
  GameContextRace,
  GameContextTurn,
} from "../gameContext";

/**
 * Shared wiring every optional-feature descriptor draws from — the live core subsystems (entities,
 * spatial, economy, inventory) plus reactive plumbing (`signalNotify`) and a `feature` reader for the
 * few features that reference another (quest reads unlocks). Handed to each {@link FeatureDescriptor}'s
 * `create` so a new opt-in subsystem plugs into one registration, never a new `features.x ?` branch.
 * @internal
 */
export interface FeatureDeps {
  features: GameFeatures;
  signalNotify: () => void;
  events: GameEvents;
  now: () => number;
  entities: EntityStore;
  spatial: SpatialApi;
  store: ObservableKeyedStore<unknown>;
  commandRegistry: CommandRegistry<GameContext>;
  economy: GameContextEconomy;
  content: GameContextContent;
  activeUserId: () => string;
  walletOf: (userId: string) => WalletState;
  setWallet: (userId: string, state: WalletState) => void;
  layouts: Record<string, InventoryLayout>;
  inventoryFor: (userId: string) => InventorySet<string>;
  ensureInstanceStats: (instanceId: string) => StatValueMap;
  seedUserPool: (userId: string, statId: string, pool: { current: number; max?: number; min?: number }) => void;
  sharedSocial: () => Social;
  pile: (id: string, config?: CardPileConfig) => CardPile;
  loop: (id: string, config?: TurnLoopConfig) => TurnLoop;
  cardPiles: ReadonlyMap<string, CardPile>;
  turnLoops: ReadonlyMap<string, TurnLoop>;
  raceState: (id: string, config?: RaceStateConfig) => RaceState;
  feature: <T>(key: keyof GameFeatures) => T | undefined;
}

/** @internal What a descriptor produces: the `ctx`-facing value plus its optional replication/save modules. */
export interface FeatureBuild {
  value: unknown;
  /** Registered into the host→client replication set when present (`ctx.snapshot`/`ctx.hydrate`). */
  replicate?: SnapshotModule;
  /** Registered into the whole-world save-only set when present (`ctx.game.save`). */
  save?: SnapshotModule;
}

/**
 * One opt-in subsystem expressed as data: which `features` flag turns it on, how it wires itself from
 * {@link FeatureDeps}, and whether it replicates or persists. `createGameContext` iterates the
 * descriptor list instead of hand-wiring each `features.x ? create : undefined` branch — the seam a
 * new feature extends through.
 * @internal
 */
export interface FeatureDescriptor {
  readonly key: keyof GameFeatures;
  enabled(features: GameFeatures): boolean;
  create(deps: FeatureDeps): FeatureBuild;
}

/** @internal */
export const featureDescriptors: readonly FeatureDescriptor[] = [
  {
    key: "unlocks",
    enabled: (f) => f.unlocks === true,
    create(d) {
      const unlocks = notifyAfter(createUnlocks(), ["grant", "hydrate"], d.signalNotify);
      return {
        value: unlocks,
        save: {
          key: "unlocks",
          snapshot: () => unlocks.snapshotAll(),
          hydrate: (data) => unlocks.hydrateAll(data as Record<string, string[]>),
        },
      };
    },
  },
  {
    key: "social",
    enabled: (f) => f.social === true,
    create(d) {
      const raw = d.sharedSocial();
      const social: Social = {
        friends: notifyAfter(
          raw.friends,
          ["request", "accept", "decline", "remove", "block", "hydrate"],
          d.signalNotify,
        ),
        party: notifyAfter(
          raw.party,
          ["invite", "accept", "decline", "kick", "leave", "promote"],
          d.signalNotify,
        ),
        presence: raw.presence,
        emotes: raw.emotes,
        worldInvites: notifyAfter(raw.worldInvites, ["invite", "accept", "decline"], d.signalNotify),
        snapshot: raw.snapshot,
        hydrate: (data) => {
          raw.hydrate(data);
          d.signalNotify();
        },
      };
      return {
        value: social,
        replicate: {
          key: "social",
          snapshot: () => social.snapshot(),
          hydrate: (data) => social.hydrate(data as SocialSnapshot),
        },
      };
    },
  },
  {
    key: "chat",
    enabled: (f) => f.chat === true,
    create(d) {
      const raw = d.sharedSocial();
      const chat = notifyAfter(
        createChat({
          events: d.events,
          now: d.now,
          party: raw.party,
          proximity: {
            entities: { get: (id) => d.entities.get(id) },
            spatial: { inRadius: (center, radius, filter) => d.spatial.inRadius(center, radius, filter) },
          },
          blockedBy: (userId) => raw.friends.snapshot(userId).blocked,
        }),
        ["register", "send", "whisper", "hydrate"],
        d.signalNotify,
      );
      return {
        value: chat,
        replicate: {
          key: "chat",
          snapshot: () => chat.snapshot(),
          hydrate: (data) => chat.hydrate(data as ChatSnapshot),
        },
      };
    },
  },
  {
    key: "leaderboard",
    enabled: (f) => f.leaderboard === true,
    create(d) {
      const leaderboard = notifyAfter(createLeaderboard(), ["increment", "hydrate"], d.signalNotify);
      return {
        value: leaderboard,
        replicate: {
          key: "leaderboard",
          snapshot: () => leaderboard.snapshot(),
          hydrate: (data) => leaderboard.hydrate(data as LeaderboardRow[]),
        },
      };
    },
  },
  {
    key: "roster",
    enabled: (f) => f.roster === true,
    create(d) {
      const roster = notifyAfter(
        createRoster({ now: d.now }),
        ["capture", "release", "setEquipped", "hydrate"],
        d.signalNotify,
      );
      return {
        value: roster,
        save: {
          key: "roster",
          snapshot: () => roster.snapshotAll(),
          hydrate: (data) => roster.hydrateAll(data as Record<string, readonly RosterEntry[]>),
        },
      };
    },
  },
  {
    key: "cosmetics",
    enabled: (f) => f.cosmetics === true,
    create(d) {
      const cosmetics = notifyAfter(createCosmetics({ events: d.events }), ["apply", "equip", "hydrate"], d.signalNotify);
      return {
        value: cosmetics,
        save: {
          key: "cosmetics",
          snapshot: () => cosmetics.snapshotAll(),
          hydrate: (data) => cosmetics.hydrateAll(data as Record<string, Record<string, string>>),
        },
      };
    },
  },
  {
    key: "trade",
    enabled: (f) => f.trade === true,
    create(d) {
      return {
        value: createTradeSystem({
          resolveTrade: (itemId) => d.content.itemById?.(itemId)?.trade,
          wallet: {
            canAfford: (costs) =>
              walletCanAfford(d.walletOf(d.activeUserId()), costs) ? null : "insufficient-funds",
            charge(costs) {
              const result = walletChargeAll(d.walletOf(d.activeUserId()), costs);
              if (result.status === "ok") {
                d.setWallet(d.activeUserId(), result.state);
                d.signalNotify();
              }
            },
            grant(gains) {
              for (const [currencyId, amount] of Object.entries(gains)) {
                d.economy.grant(d.activeUserId(), currencyId, amount);
              }
            },
          },
          inventory: {
            put(inventoryId, itemId, count) {
              if (d.layouts[inventoryId] === undefined) return { reason: `unknown inventory "${inventoryId}"` };
              const result = d.inventoryFor(d.activeUserId()).put(inventoryId, itemId, count);
              return result.status === "ok" ? null : { reason: result.reason };
            },
            take(inventoryId, itemId, count) {
              if (d.layouts[inventoryId] === undefined) return { reason: `unknown inventory "${inventoryId}"` };
              const result = d.inventoryFor(d.activeUserId()).take(inventoryId, itemId, count);
              return result.status === "ok" ? null : { reason: result.reason };
            },
            count: (inventoryId, itemId) => d.inventoryFor(d.activeUserId()).count(inventoryId, itemId),
          },
        }),
      };
    },
  },
  {
    key: "quest",
    enabled: (f) => f.quest === true,
    create(d) {
      const quest = notifyAfter(
        createQuestJournal({
          events: d.events,
          rewards: {
            grantXp(userId, amount) {
              const existing = d.ensureInstanceStats(userId)["xp"];
              const current = (existing?.current ?? 0) + amount;
              d.seedUserPool(userId, "xp", { current, max: Math.max(existing?.max ?? 0, current) });
            },
            grantEconomy: (userId, currencyId, amount) => d.economy.grant(userId, currencyId, amount),
            grantItem(userId, inventoryId, itemId, count) {
              if (d.layouts[inventoryId] === undefined) return { reason: `unknown inventory "${inventoryId}"` };
              const result = d.inventoryFor(userId).put(inventoryId, itemId, count);
              return result.status === "ok" ? null : { reason: result.reason };
            },
            grantUnlock: (userId, unlockId) => d.feature<Unlocks>("unlocks")?.grant(userId, unlockId),
          },
          hasUnlock: (userId, id) => d.feature<Unlocks>("unlocks")?.has(userId, id) ?? false,
        }),
        ["accept", "abandon", "progress", "turnIn", "grant", "revoke", "hydrate"],
        d.signalNotify,
      );
      return {
        value: quest,
        save: {
          key: "quest",
          snapshot: () => quest.snapshotAll(),
          hydrate: (data) => quest.hydrateAll(data as Record<string, QuestSnapshotEntry[]>),
        },
      };
    },
  },
  {
    key: "dialogue",
    enabled: (f) => f.dialogue === true,
    create(d) {
      const dialogue = createGameDialogue(d.store);
      d.commandRegistry.define("dialogue.open", {
        apply(state, input) {
          const id = (input as { id?: string }).id;
          if (id !== undefined) state.game.dialogue?.open(id);
        },
      });
      d.commandRegistry.define("dialogue.close", {
        apply(state) {
          state.game.dialogue?.close();
        },
      });
      return { value: dialogue };
    },
  },
  {
    key: "players",
    enabled: (f) => f.players === true,
    create(d) {
      return { value: notifyAfter(createConnectedPlayers(), ["join", "leave"], d.signalNotify) };
    },
  },
  {
    key: "cards",
    enabled: (f) => f.cards === true,
    create(d) {
      return {
        value: { pile: d.pile } satisfies GameContextCards,
        save: {
          key: "cards",
          snapshot: () => {
            const out: Record<string, CardPileState> = {};
            for (const [id, cardPile] of d.cardPiles) out[id] = cardPile.state();
            return out;
          },
          hydrate: (data) => {
            for (const [id, state] of Object.entries(data as Record<string, CardPileState>)) {
              d.cardPiles.get(id)?.reset(state);
            }
          },
        },
      };
    },
  },
  {
    key: "turn",
    enabled: (f) => f.turn === true,
    create(d) {
      return {
        value: { loop: d.loop } satisfies GameContextTurn,
        save: {
          key: "turn",
          snapshot: () => {
            const out: Record<string, TurnLoopSnapshot> = {};
            for (const [id, turnLoop] of d.turnLoops) out[id] = turnLoop.capture();
            return out;
          },
          hydrate: (data) => {
            for (const [id, state] of Object.entries(data as Record<string, TurnLoopSnapshot>)) {
              d.turnLoops.get(id)?.restore(state);
            }
          },
        },
      };
    },
  },
  {
    key: "race",
    enabled: (f) => f.race === true,
    create(d) {
      return { value: { state: d.raceState } satisfies GameContextRace };
    },
  },
];
