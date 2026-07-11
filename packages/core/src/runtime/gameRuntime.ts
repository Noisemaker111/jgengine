import type { SaveConfig } from "./save";
import type { CommandDef } from "./commandRunner";
import { runCommand } from "./commandRunner";
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
};

export type RuntimeInitContext = {
  snapshot: GameRuntimeSnapshot;
  setSnapshot: (snapshot: GameRuntimeSnapshot) => void;
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
};

export type GameRuntime = {
  gameId: string;
  save: SaveConfig;
  hydrate: (input: HydrateInput) => GameRuntimeSnapshot;
  runCommand: (
    snapshot: GameRuntimeSnapshot,
    actorUserId: string,
    commandName: string,
    input: unknown,
  ) => ReturnType<typeof runCommand>;
  tick: (snapshot: GameRuntimeSnapshot, dtSeconds: number) => GameRuntimeSnapshot;
  joinPlayer: (
    snapshot: GameRuntimeSnapshot,
    userId: string,
    isNew: boolean,
  ) => GameRuntimeSnapshot;
  toProfileRow: (snapshot: GameRuntimeSnapshot, userId: string) => RuntimeProfileRow | null;
};

export function createGameRuntime(definition: GameRuntimeDefinition): GameRuntime {
  const loop = definition.loop;
  let initialized = false;

  return {
    gameId: definition.gameId,
    save: definition.save,

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
          setSnapshot(next) {
            current = next;
          },
        });
      }
      return current;
    },

    runCommand(snapshot, actorUserId, commandName, input) {
      return runCommand(snapshot, definition.commands, commandName, input, actorUserId);
    },

    tick(snapshot, dtSeconds) {
      if (!loop?.onTick) return snapshot;
      let current = snapshot;
      const ctx: RuntimeWorldContext = {
        get snapshot() {
          return current;
        },
        get playerIds() {
          return Object.keys(current.players);
        },
        setSnapshot(next) {
          current = next;
        },
      };
      loop.onTick(ctx, dtSeconds);
      return current;
    },

    joinPlayer(snapshot, userId, isNew) {
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
