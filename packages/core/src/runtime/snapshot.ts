import type { InventoryState } from "../inventory/inventoryModel";

export const RUNTIME_SNAPSHOT_VERSION = 1;

export type RuntimeEntityRow = {
  instanceId: string;
  catalogId: string;
  position?: [number, number, number];
  rotationY?: number;
  parentSpace?: string;
  group?: string;
  stats?: Record<string, { current: number; max: number; min?: number }>;
  targetInstanceId?: string | null;
  userId?: string;
};

/**
 * The persisted form of a placed `SceneObject`: identity, placement, per-instance state, and slot
 * contents. Convert with `toRuntimeObjectRow`/`fromRuntimeObjectRow` (`runtime/objectRows`).
 */
export type RuntimeObjectRow = {
  instanceId: string;
  catalogId: string;
  position: [number, number, number];
  rotationY?: number;
  parentSpace?: string;
  /** Opaque per-instance state; the persisted name for `SceneObject.state`. */
  flags?: Record<string, unknown>;
  /** Container contents for a catalog `slotInventory` object. */
  slots?: InventoryState;
};

export type RuntimeInventorySlot = {
  item: string;
  count: number;
  slot?: number;
};

export type RuntimePlayerRow = {
  userId: string;
  inventories: Record<string, RuntimeInventorySlot[]>;
  economy: Record<string, number>;
  unlocks: string[];
  quests?: unknown;
  social?: unknown;
  leaderboard?: Record<string, number>;
  session?: Record<string, unknown>;
};

export type RuntimeChunkRow = {
  chunkKey: string;
  objects: RuntimeObjectRow[];
  entities: RuntimeEntityRow[];
  flags?: Record<string, unknown>;
};

export type RuntimeServerRow = {
  entities: RuntimeEntityRow[];
  objects: RuntimeObjectRow[];
  session: Record<string, unknown>;
  feeds?: Record<string, unknown[]>;
};

export type RuntimeProfileRow = {
  userId: string;
  gameId: string;
  player: RuntimePlayerRow;
  updatedAt: number;
};

export type GameRuntimeSnapshot = {
  version: number;
  gameId: string;
  serverId: string;
  server: RuntimeServerRow;
  players: Record<string, RuntimePlayerRow>;
  chunks: Record<string, RuntimeChunkRow>;
  revision: number;
  dirty: {
    server: boolean;
    players: string[];
    chunks: string[];
  };
};

/** @internal */
export function createEmptyServerRow(): RuntimeServerRow {
  return {
    entities: [],
    objects: [],
    session: {},
    feeds: {},
  };
}

/** @internal */
export function createEmptyPlayerRow(userId: string): RuntimePlayerRow {
  return {
    userId,
    inventories: {},
    economy: {},
    unlocks: [],
    session: {},
  };
}

/** @internal */
export function createRuntimeSnapshot(args: {
  gameId: string;
  serverId: string;
  server?: RuntimeServerRow;
  players?: Record<string, RuntimePlayerRow>;
  chunks?: Record<string, RuntimeChunkRow>;
  revision?: number;
}): GameRuntimeSnapshot {
  return {
    version: RUNTIME_SNAPSHOT_VERSION,
    gameId: args.gameId,
    serverId: args.serverId,
    server: args.server ?? createEmptyServerRow(),
    players: args.players ?? {},
    chunks: args.chunks ?? {},
    revision: args.revision ?? 0,
    dirty: {
      server: false,
      players: [],
      chunks: [],
    },
  };
}

/** @internal */
export function markServerDirty(snapshot: GameRuntimeSnapshot): GameRuntimeSnapshot {
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    dirty: { ...snapshot.dirty, server: true },
  };
}

/** @internal */
export function markPlayerDirty(snapshot: GameRuntimeSnapshot, userId: string): GameRuntimeSnapshot {
  if (snapshot.dirty.players.includes(userId)) {
    return markServerDirty(snapshot);
  }
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    dirty: {
      ...snapshot.dirty,
      server: true,
      players: [...snapshot.dirty.players, userId],
    },
  };
}

/** @internal */
export function clearDirtyFlags(snapshot: GameRuntimeSnapshot): GameRuntimeSnapshot {
  return {
    ...snapshot,
    dirty: {
      server: false,
      players: [],
      chunks: [],
    },
  };
}

/** @internal */
export function splitProfilePlayer(player: RuntimePlayerRow): {
  persistent: RuntimePlayerRow;
  session: Record<string, unknown>;
} {
  const { session = {}, ...persistentFields } = player;
  return {
    persistent: {
      ...persistentFields,
      session: {},
    },
    session,
  };
}

/**
 * Mark every player plus the server row dirty without bumping `revision` — the "write everything now"
 * preparation a flush needs, because hydrating a snapshot from storage resets the dirty set to empty.
 * Revision stays put so a flush cannot look like a mutation to the revision CAS.
 * @internal
 */
export function markAllPlayersDirty(snapshot: GameRuntimeSnapshot): GameRuntimeSnapshot {
  return {
    ...snapshot,
    dirty: { ...snapshot.dirty, server: true, players: Object.keys(snapshot.players) },
  };
}
