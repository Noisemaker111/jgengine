import type { HostedWorldSession } from "@jgengine/core/runtime/hostedWorldSession";
import type {
  GameRuntimeServerView,
  JoinServerResult,
  TransportRunCommandResult,
} from "@jgengine/core/runtime/transport";
import type { GameHost, HostChangeEvent } from "./host";

/** Config for {@link createWorldGameHost}: how to resolve a hosted world's authoritative session per server. */
export interface WorldGameHostOptions {
  /**
   * Resolve (or lazily build) the authoritative {@link HostedWorldSession} for a server — called once per new
   * `serverId`. Return `null` for an unknown game. Bind the game's definition + content here.
   */
  session(args: { gameId: string; serverId: string }): HostedWorldSession | null;
  now?: () => number;
}

/** A {@link GameHost} whose worlds run on `HostedWorldSession`s; `tick` advances them and re-broadcasts on change. */
export interface WorldGameHost extends GameHost {
  /** Advance every live world by `dtSeconds` and emit a `server` change for each whose revision moved. */
  tick(dtSeconds: number): void;
}

/**
 * The GameContext-loop counterpart of the reducer `createGameHost`: a structural {@link GameHost} that serves each
 * world's full `WorldSnapshot` as `serverState`, so the existing ws router, `createWsBackend`, and the shell's
 * `attachWorldSync` carry host-authoritative GameContext worlds with zero changes to any of them. The harness owns
 * the tick cadence (call {@link WorldGameHost.tick} on an interval); commands and joins broadcast immediately.
 */
export function createWorldGameHost(options: WorldGameHostOptions): WorldGameHost {
  const live = new Map<string, { gameId: string; session: HostedWorldSession }>();
  const listeners = new Set<(event: HostChangeEvent) => void>();
  const now = options.now ?? (() => Date.now());

  function emit(event: HostChangeEvent): void {
    for (const listener of listeners) listener(event);
  }

  function ensure(gameId: string, serverId: string): { gameId: string; session: HostedWorldSession } | null {
    const existing = live.get(serverId);
    if (existing !== undefined) return existing;
    const session = options.session({ gameId, serverId });
    if (session === null) return null;
    const entry = { gameId, session };
    live.set(serverId, entry);
    return entry;
  }

  function tickAll(dtSeconds: number): void {
    for (const [serverId, entry] of live) {
      const before = entry.session.revision();
      entry.session.tick(dtSeconds);
      if (entry.session.revision() !== before) emit({ type: "server", serverId });
    }
  }

  return {
    async joinServer({ userId, gameId, serverId }): Promise<JoinServerResult> {
      const id = serverId ?? gameId;
      const entry = ensure(gameId, id);
      if (entry === null) throw new Error(`no hosted world for game "${gameId}"`);
      const isNew = !entry.session.members().includes(userId);
      entry.session.join(userId, isNew);
      emit({ type: "server", serverId: id });
      emit({ type: "player", serverId: id, userId });
      return { serverId: id, isNew };
    },
    async leaveServer({ userId, serverId }): Promise<void> {
      const entry = live.get(serverId);
      if (entry === undefined) return;
      entry.session.leave(userId);
      emit({ type: "server", serverId });
    },
    async runCommand({ userId, serverId, command, input }): Promise<TransportRunCommandResult> {
      const entry = live.get(serverId);
      if (entry === undefined) return { ok: false, reason: "no-server" };
      const before = entry.session.revision();
      const result = entry.session.command(userId, command, input);
      if (result.status === "rejected") return { ok: false, reason: result.reason };
      if (result.status === "unknown-command") return { ok: false, reason: "unknown-command" };
      if (entry.session.revision() !== before) emit({ type: "server", serverId });
      return { ok: true };
    },
    async isMember({ userId, serverId }): Promise<boolean> {
      return live.get(serverId)?.session.members().includes(userId) ?? false;
    },
    async getServerView({ serverId }): Promise<GameRuntimeServerView | null> {
      const entry = live.get(serverId);
      if (entry === undefined) return null;
      return {
        serverId,
        gameId: entry.gameId,
        revision: entry.session.revision(),
        memberUserIds: [...entry.session.members()],
        serverState: entry.session.runner().snapshot(),
        updatedAt: now(),
      };
    },
    async getPlayerView(): Promise<null> {
      return null;
    },
    async getFeed(): Promise<unknown[]> {
      return [];
    },
    async pushFeedEntry(): Promise<void> {},
    async browseServers() {
      return [];
    },
    async joinByCode(): Promise<null> {
      return null;
    },
    async listOpenServers() {
      return [];
    },
    tick: tickAll,
    async tickOnce() {
      tickAll(0);
      return { ticked: live.size, saved: 0 };
    },
    async flushAll() {
      return 0;
    },
    start() {},
    async stop() {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
