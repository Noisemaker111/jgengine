import { INPUT_COMMAND, type InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import type { HostedWorldSession } from "@jgengine/core/runtime/hostedWorldSession";
import type {
  GameRuntimeServerView,
  JoinServerResult,
  TransportRunCommandResult,
  WorldSyncFrame,
} from "@jgengine/core/runtime/transport";
import type { SnapshotViewer } from "@jgengine/core/runtime/worldSnapshot";
import type { GameHost, HostChangeEvent } from "./host";

/** Config for {@link createWorldGameHost}: how to resolve a hosted world's authoritative session per server. */
export interface WorldGameHostOptions {
  /**
   * Resolve (or lazily build) the authoritative {@link HostedWorldSession} for a server — called once per new
   * `serverId`. Return `null` for an unknown game. Bind the game's definition + content here.
   */
  session(args: { gameId: string; serverId: string }): HostedWorldSession | Promise<HostedWorldSession | null> | null;
  now?: () => number;
  /** Maximum active players per world; reconnecting members and spectators do not consume a new slot. */
  slotsPerServer?: number;
}

/** A {@link GameHost} whose worlds run on `HostedWorldSession`s; `tick` advances them and re-broadcasts on change. */
export interface WorldGameHost extends GameHost {
  /** Advance every live world by `dtSeconds` and emit a `server` change for each whose revision moved. */
  tick(dtSeconds: number): void;
  /** Permanently close admission/ticks, drain accepted world operations, and save. Repeated calls share completion. */
  stop(): Promise<void>;
}

/**
 * The GameContext-loop counterpart of the reducer `createGameHost`: a structural {@link GameHost} that serves each
 * world's full `WorldSnapshot` as `serverState`, so the existing ws router, `createWsBackend`, and the shell's
 * `attachWorldSync` carry host-authoritative GameContext worlds with zero changes to any of them. The harness owns
 * the tick cadence (call {@link WorldGameHost.tick} on an interval); commands and joins broadcast immediately.
 */
export function createWorldGameHost(options: WorldGameHostOptions): WorldGameHost {
  if (options.slotsPerServer !== undefined && (!Number.isSafeInteger(options.slotsPerServer) || options.slotsPerServer < 1)) {
    throw new Error("slotsPerServer must be a positive safe integer");
  }
  type Entry = { gameId: string; session: HostedWorldSession; residentMembers: ReadonlySet<string> };
  const live = new Map<string, Entry>();
  const loading = new Map<string, Promise<Entry | null>>();
  const queues = new Map<string, Promise<unknown>>();
  const roles = new Map<string, Map<string, SnapshotViewer["role"]>>();
  const announcedRevisions = new Map<string, number>();
  const listeners = new Set<(event: HostChangeEvent) => void>();
  const now = options.now ?? (() => Date.now());
  let stopped = false;
  let stopping: Promise<void> | null = null;

  function emit(event: HostChangeEvent): void {
    if (event.type === "server") {
      const entry = live.get(event.serverId);
      if (entry !== undefined) announcedRevisions.set(event.serverId, entry.session.revision());
    }
    for (const listener of listeners) listener(event);
  }

  function enqueue<T>(serverId: string, operation: () => Promise<T>): Promise<T> {
    if (stopped) return Promise.reject(new Error("World host is closed"));
    const previous = queues.get(serverId) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(operation);
    queues.set(serverId, run);
    void run.catch(() => {}).finally(() => {
      if (queues.get(serverId) === run) queues.delete(serverId);
    });
    return run;
  }

  function ensure(gameId: string, serverId: string): Entry | Promise<Entry | null> | null {
    const existing = live.get(serverId);
    if (existing !== undefined) return existing.gameId === gameId ? existing : null;
    const pending = loading.get(serverId);
    if (pending !== undefined) return pending.then((entry) => entry?.gameId === gameId ? entry : null);
    const resolved = options.session({ gameId, serverId });
    if (resolved instanceof Promise) {
      const pending = resolved.then((session) => {
        if (session === null) return null;
        const entry = { gameId, session, residentMembers: new Set(session.members()) };
        live.set(serverId, entry);
        return entry;
      });
      loading.set(serverId, pending);
      void pending.catch(() => {}).finally(() => loading.delete(serverId));
      return pending;
    }
    if (resolved === null) return null;
    const entry = { gameId, session: resolved, residentMembers: new Set(resolved.members()) };
    live.set(serverId, entry);
    return entry;
  }

  function tickAll(dtSeconds: number): void {
    if (stopped) return;
    for (const [serverId, entry] of live) {
      if (queues.has(serverId)) continue;
      const before = entry.session.revision();
      entry.session.tick(dtSeconds);
      if (entry.session.revision() !== before) emit({ type: "server", serverId });
    }
  }

  return {
    async joinServer({ userId, gameId, serverId, role }): Promise<JoinServerResult> {
      const id = serverId ?? gameId;
      return enqueue(id, async () => {
        const pending = ensure(gameId, id);
        const entry = pending instanceof Promise ? await pending : pending;
        if (entry === null) throw new Error(`no hosted world for game "${gameId}"`);
        const members = entry.session.members();
        const admittedRoles = roles.get(id);
        const occupiesSlot = (memberId: string) => admittedRoles?.get(memberId) === "player"
          || (admittedRoles?.get(memberId) === undefined && entry.residentMembers.has(memberId));
        const usedSlots = members.filter(occupiesSlot).length;
        if (role !== "spectator" && !(members.includes(userId) && occupiesSlot(userId)) && options.slotsPerServer !== undefined && usedSlots >= options.slotsPerServer) {
          throw new Error("Server is full");
        }
        const isNew = !entry.session.hasPlayer(userId);
        let serverRoles = roles.get(id);
        if (serverRoles === undefined) {
          serverRoles = new Map();
          roles.set(id, serverRoles);
        }
        if (role !== "spectator") entry.session.join(userId, isNew);
        await entry.session.save();
        serverRoles.set(userId, role ?? "player");
        emit({ type: "server", serverId: id });
        emit({ type: "player", serverId: id, userId });
        return { serverId: id, isNew };
      });
    },
    async leaveServer({ userId, serverId }): Promise<void> {
      return enqueue(serverId, async () => {
        const entry = live.get(serverId);
        if (entry === undefined) return;
        if (entry.session.members().includes(userId)) entry.session.leave(userId);
        roles.get(serverId)?.delete(userId);
        await entry.session.save();
        emit({ type: "server", serverId });
      });
    },
    async runCommand({ userId, serverId, command, input }): Promise<TransportRunCommandResult> {
      return enqueue(serverId, async () => {
        const entry = live.get(serverId);
        if (entry === undefined) return { ok: false, reason: "no-server" };
        if (!entry.session.members().includes(userId) || roles.get(serverId)?.get(userId) !== "player") return { ok: false, reason: "not-a-player" };
        if (command === INPUT_COMMAND) {
          entry.session.input(userId, input as InputFrame);
          return { ok: true };
        }
        const result = entry.session.command(userId, command, input);
        await entry.session.save();
        if (result.status === "rejected") return { ok: false, reason: result.reason };
        if (result.status === "unknown-command") return { ok: false, reason: "unknown-command" };
        if (entry.session.revision() !== announcedRevisions.get(serverId)) emit({ type: "server", serverId });
        return { ok: true };
      });
    },
    async isMember({ userId, serverId }): Promise<boolean> {
      return !stopped && roles.get(serverId)?.has(userId) === true;
    },
    async getServerView({ userId, serverId, role }): Promise<GameRuntimeServerView | null> {
      const entry = live.get(serverId);
      if (stopped || entry === undefined || !roles.get(serverId)?.has(userId)) return null;
      return {
        serverId,
        gameId: entry.gameId,
        revision: entry.session.revision(),
        memberUserIds: [...entry.session.members()],
        serverState: entry.session.snapshotFor({ userId, role: role ?? roles.get(serverId)?.get(userId) ?? "player" }),
        updatedAt: now(),
      };
    },
    async pullWorld({ userId, serverId, sinceRevision, role }): Promise<WorldSyncFrame | null> {
      const entry = live.get(serverId);
      if (stopped || entry === undefined || !roles.get(serverId)?.has(userId)) return null;
      if (entry.session.projectsViewers()) {
        return {
          kind: "baseline",
          revision: entry.session.revision(),
          snapshot: entry.session.snapshotFor({ userId, role: role ?? roles.get(serverId)?.get(userId) ?? "player" }),
        };
      }
      const sync = entry.session.pull(sinceRevision);
      return sync.kind === "baseline"
        ? sync
        : { kind: "diff", revision: sync.diff.revision, diff: sync.diff };
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
      await Promise.allSettled([...queues.values()]);
      await Promise.all([...live.values()].map((entry) => entry.session.save()));
      return live.size;
    },
    start() {},
    stop() {
      if (stopping !== null) return stopping;
      stopped = true;
      stopping = (async () => {
        await Promise.allSettled([...queues.values()]);
        try { await Promise.all([...live.values()].map(entry => entry.session.save())); }
        finally { listeners.clear(); }
      })();
      return stopping;
    },
    subscribe(listener) {
      if (stopped) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
