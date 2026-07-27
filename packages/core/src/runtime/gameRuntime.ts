import type { SaveConfig } from "./save";
import type { CommandDef, CommandScope } from "./commandRunner";
import { resolveCommandScope, runCommand } from "./commandRunner";
import {
  createEmptyPlayerRow,
  createRuntimeSnapshot,
  type GameRuntimeSnapshot,
  type RuntimeChunkRow,
  type RuntimePlayerRow,
  type RuntimeProfileRow,
  type RuntimeServerRow,
} from "./snapshot";

export type ServerLoopHooks = {
  onInit?: (ctx: RuntimeInitContext) => void;
  onNewPlayer?: (ctx: RuntimeLoopContext) => void;
  onTick?: (ctx: RuntimeWorldContext, dtSeconds: number) => void;
  /**
   * What `onNewPlayer` touches, so a join hydrates that instead of the whole world. Only consulted
   * when `onNewPlayer` exists — without the hook a join provably needs the joining member and nothing
   * else. Omit it and a join keeps hydrating everything.
   */
  joinScope?: (userId: string, isNew: boolean) => CommandScope;
};

export type RuntimeInitContext = {
  snapshot: GameRuntimeSnapshot;
  setSnapshot: (snapshot: GameRuntimeSnapshot) => void;
  /**
   * Host wall clock at the start of this call, in ms. The host already knows it, so anything keyed to
   * real time — a UTC date rollover, a `lastTickAt` anchor other code paths read, a seed or a
   * `createdAt` stamp — reads it here instead of re-deriving one by accumulating `dtSeconds` against a
   * persisted epoch. It is authoritative: unlike a `now` carried in command input, no client supplied it.
   */
  nowMs: number;
};

export type RuntimeLoopContext = RuntimeInitContext & {
  player: {
    userId: string;
    isNew: boolean;
  };
};

export type RuntimeWorldContext = RuntimeInitContext & {
  playerIds: readonly string[];
};

export type GameRuntimeDefinition = {
  gameId: string;
  save: SaveConfig;
  commands: Record<string, CommandDef>;
  loop?: ServerLoopHooks;
};

export type HydrateInput = {
  gameId: string;
  serverId: string;
  serverRow: RuntimeServerRow;
  playersByUserId: Record<string, RuntimePlayerRow>;
  chunksByKey: Record<string, RuntimeChunkRow>;
  revision?: number;
  /** Host wall clock for `onInit`, in ms. Defaults to `Date.now()`. */
  nowMs?: number;
};

export type GameRuntime = {
  gameId: string;
  save: SaveConfig;
  /**
   * Whether this runtime declares `loop.onTick`. A host's tick cron reads it to skip hydrating and
   * persisting a server whose `tick` is a no-op by construction — the difference between a world that
   * costs a full read/write every second while idle and one that costs nothing.
   */
  hasTick: boolean;
  hydrate: (input: HydrateInput) => GameRuntimeSnapshot;
  runCommand: (
    snapshot: GameRuntimeSnapshot,
    actorUserId: string,
    commandName: string,
    input: unknown,
    /** Host wall clock handed to `validate`/`apply`, in ms. Defaults to `Date.now()`. */
    nowMs?: number,
  ) => ReturnType<typeof runCommand>;
  /**
   * What a command declares it will touch, evaluated before hydration so a host can load that slice
   * and nothing else. `undefined` means the command declared no scope — hydrate everything.
   */
  commandScope: (commandName: string, input: unknown, actorUserId: string) => CommandScope | undefined;
  /** What a join has to hydrate. `undefined` means the whole world, as when `onNewPlayer` is unscoped. */
  joinScope: (userId: string, isNew: boolean) => CommandScope | undefined;
  /** `nowMs` is the host wall clock at the start of the tick, in ms; defaults to `Date.now()`. */
  tick: (snapshot: GameRuntimeSnapshot, dtSeconds: number, nowMs?: number) => GameRuntimeSnapshot;
  joinPlayer: (
    snapshot: GameRuntimeSnapshot,
    userId: string,
    isNew: boolean,
    nowMs?: number,
  ) => GameRuntimeSnapshot;
  toProfileRow: (snapshot: GameRuntimeSnapshot, userId: string) => RuntimeProfileRow | null;
};

/** @internal */
export function createGameRuntime(definition: GameRuntimeDefinition): GameRuntime {
  const loop = definition.loop;
  let initialized = false;

  return {
    gameId: definition.gameId,
    save: definition.save,
    hasTick: loop?.onTick !== undefined,

    hydrate(input) {
      let current = createRuntimeSnapshot({
        gameId: input.gameId,
        serverId: input.serverId,
        server: input.serverRow,
        players: input.playersByUserId,
        chunks: input.chunksByKey,
        revision: input.revision,
      });
      if (loop?.onInit && !initialized) {
        initialized = true;
        loop.onInit({
          get snapshot() {
            return current;
          },
          nowMs: input.nowMs ?? Date.now(),
          setSnapshot(next) {
            current = next;
          },
        });
      }
      return current;
    },

    runCommand(snapshot, actorUserId, commandName, input, nowMs) {
      return runCommand(
        snapshot,
        definition.commands,
        commandName,
        input,
        actorUserId,
        nowMs ?? Date.now(),
      );
    },

    commandScope(commandName, input, actorUserId) {
      return resolveCommandScope(definition.commands, commandName, input, actorUserId);
    },

    joinScope(userId, isNew) {
      if (!loop?.onNewPlayer) return { players: [userId], chunkKeys: [] };
      return loop.joinScope?.(userId, isNew);
    },

    tick(snapshot, dtSeconds, nowMs) {
      if (!loop?.onTick) return snapshot;
      let current = snapshot;
      const ctx: RuntimeWorldContext = {
        get snapshot() {
          return current;
        },
        get playerIds() {
          return Object.keys(current.players);
        },
        nowMs: nowMs ?? Date.now(),
        setSnapshot(next) {
          current = next;
        },
      };
      loop.onTick(ctx, dtSeconds);
      return current;
    },

    joinPlayer(snapshot, userId, isNew, nowMs) {
      const players = { ...snapshot.players };
      if (!players[userId]) {
        players[userId] = createEmptyPlayerRow(userId);
      }

      let next = {
        ...snapshot,
        players,
        revision: snapshot.revision + 1,
        dirty: {
          ...snapshot.dirty,
          server: true,
          players: snapshot.dirty.players.includes(userId)
            ? snapshot.dirty.players
            : [...snapshot.dirty.players, userId],
        },
      };

      if (!loop?.onNewPlayer) {
        return next;
      }

      const ctx: RuntimeLoopContext = {
        get snapshot() {
          return next;
        },
        player: { userId, isNew },
        nowMs: nowMs ?? Date.now(),
        setSnapshot(updated) {
          next = updated;
        },
      };
      loop.onNewPlayer(ctx);
      return next;
    },

    toProfileRow(snapshot, userId) {
      const player = snapshot.players[userId];
      if (!player) return null;
      return {
        userId,
        gameId: snapshot.gameId,
        player,
        updatedAt: Date.now(),
      };
    },
  };
}
