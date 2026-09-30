import type { CommandResult } from "../commands/commandRegistry";
import type { ModelAssetRef } from "../scene/assetCatalog";
import type { GameContext, GameContextContent, GameContextModels } from "./gameContext";
import type { GameDefinition, LoopPlayer } from "../game/defineGame";
import { createHostedGameRunner, type HostedGameRunner, type InputFrame } from "./hostedGameRunner";
import type { WorldDiff } from "./worldReplication";
import type { SnapshotViewer, WorldSnapshot } from "./worldSnapshot";
import { applyWorldSnapshot, type SnapshotModule } from "./worldSnapshot";

import type { HostedWorldRecord, HostedWorldStore, SyncHostedWorldStore } from "./hostedWorldStore";
export type { HostedWorldRecord, HostedWorldStore, SyncHostedWorldStore } from "./hostedWorldStore";

/** @internal Decode the retry envelope shared by authoritative hosts. */
export function unwrapOpEnvelope(input: unknown): { opId: string; input: unknown } | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const opId = record["__jgWsOpId"];
  if (typeof opId !== "string") return null;
  const { __jgWsOpId: _opId, ...rest } = record;
  return { opId, input: rest };
}

/** Detached in-process {@link SyncHostedWorldStore} for tests, local play, and the browser-tab P2P host.
 * @internal
 */
export function memoryWorldStore(seed?: HostedWorldRecord): SyncHostedWorldStore {
  let record: HostedWorldRecord | null = seed === undefined ? null : structuredClone(seed);
  return {
    load: () => record === null ? null : structuredClone(record),
    save(next) {
      record = structuredClone(next);
    },
  };
}

/** Async in-process store for callers exercising the production persistence contract. */
export function asyncMemoryWorldStore(seed?: HostedWorldRecord): HostedWorldStore {
  let record: HostedWorldRecord | null = seed === undefined ? null : structuredClone(seed);
  return {
    async load() { return record === null ? null : structuredClone(record); },
    async save(next) { record = structuredClone(next); },
  };
}

/** A client replication pull: a full baseline (first sync / fell behind) or a diff since the client's cursor. */
export type HostedWorldSync =
  | { kind: "baseline"; revision: number; snapshot: WorldSnapshot }
  | { kind: "diff"; diff: WorldDiff };

/** Config for {@link createHostedWorldSession}: the game, its persistence store, and the auto-save cadence. */
export interface HostedWorldSessionOptions<TAssetRef extends ModelAssetRef, TMultiplayer> {
  definition: GameDefinition<TAssetRef, TMultiplayer>;
  content: GameContextContent;
  host?: LoopPlayer;
  now?: () => number;
  /** Where the authoritative snapshot persists; defaults to {@link memoryWorldStore}. */
  store?: SyncHostedWorldStore;
  /** Minimum elapsed ms between automatic saves, measured against `now` (default `Date.now`). Default `0`; private clock/simulation changes also count. A pending write defers automatic capture until a later tick. */
  saveIntervalMs?: number;
  /** Retained retry receipts per player. Default `64`; retries after eviction are new operations. */
  operationHistoryLimit?: number;
  /** Render-model lookup for collider auto-fit, forwarded to the runner — see {@link HostedGameRunnerOptions.models}. */
  models?: GameContextModels;
}

/**
 * The stateful host substrate a long-lived backend binds (ws server, browser P2P host): a live
 * {@link HostedGameRunner} loaded from a {@link HostedWorldStore}, auto-persisted on tick, serving each client a
 * baseline then diffs. The stateless Convex path doesn't use this — it reconstructs a runner from the same store
 * per invocation and diffs with `diffSnapshots`. Either way the store seam and the game code are identical.
 */
export interface HostedWorldSession {
  join(userId: string, isNew: boolean): void;
  /** Whether this identity has joined before, including across leave/restart. */
  hasPlayer(userId: string): boolean;
  leave(userId: string): void;
  input(userId: string, frame: InputFrame): void;
  /** Optional stable operation id deduplicates retries across reconnect/restart; the receipt persists atomically with state. */
  command(userId: string, name: string, input: unknown, operationId?: string): CommandResult<GameContext>;
  tick(dt: number): number;
  /** Replication pull: a fresh, pre-restart or future cursor receives a baseline; an in-session revision receives a diff. */
  sync(sinceRevision: number | null): HostedWorldSync;
  /** Alias used by host transports when pulling the next baseline or diff for a subscriber. */
  pull(sinceRevision: number | null): HostedWorldSync;
  /** The full world baseline projected for one viewer (private/AOI). Identity when no replication policy is set. */
  snapshotFor(viewer: SnapshotViewer): WorldSnapshot;
  /** True when {@link snapshotFor} is viewer-dependent — a host must serve each connection its own projected frame instead of a shared diff. */
  projectsViewers(): boolean;
  revision(): number;
  members(): readonly string[];
  /** Force-persist the current world to the store. */
  save(): void | Promise<void>;
  /** Most recent automatic save failure; cleared by a successful write. Explicit `save()` also rejects. */
  persistenceError(): unknown | null;
  runner(): HostedGameRunner;
}

/** Build a {@link HostedWorldSession} — a live runner loaded from a {@link HostedWorldStore} and auto-persisted on tick.
 * @internal
 */
export function createHostedWorldSession<TAssetRef extends ModelAssetRef, TMultiplayer>(
  options: HostedWorldSessionOptions<TAssetRef, TMultiplayer>,
): HostedWorldSession {
  const { definition, content, host, now, saveIntervalMs = 0 } = options;
  const clock = now ?? Date.now;
  const store = options.store ?? memoryWorldStore();
  const loaded = store.load();
  const runner = createHostedGameRunner({
    definition,
    content,
    ...(host === undefined ? {} : { host }),
    ...(now === undefined ? {} : { now }),
    ...(loaded === null ? {} : { restore: loaded.snapshot }),
    revision: loaded?.revision ?? 0,
    ...(options.models === undefined ? {} : { models: options.models }),
  });

  type Receipt = { id: string; command: string; input: string; outcome: "applied" | "rejected" | "unknown-command"; reason?: string };
  type SessionState = { players: string[]; operations: [string, Receipt[]][] };
  const knownPlayers = new Set<string>();
  const operations = new Map<string, Receipt[]>();
  const configuredHistory = options.operationHistoryLimit ?? 64;
  const historyLimit = Number.isFinite(configuredHistory) ? Math.max(1, Math.floor(configuredHistory)) : 64;
  const sessionModule: SnapshotModule<SessionState> = {
    key: "hostSession",
    snapshot: () => ({ players: [...knownPlayers], operations: [...operations] }),
    hydrate(state) {
      knownPlayers.clear();
      for (const userId of state.players) knownPlayers.add(userId);
      operations.clear();
      for (const [userId, receipts] of state.operations) operations.set(userId, receipts.slice(-historyLimit));
    },
    decode(raw) {
      if (raw === null || typeof raw !== "object" || !("players" in raw) || !("operations" in raw)) return null;
      if (!Array.isArray(raw.players) || !raw.players.every((id) => typeof id === "string") || !Array.isArray(raw.operations)) return null;
      for (const entry of raw.operations) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !Array.isArray(entry[1])) return null;
        for (const receipt of entry[1]) {
          if (receipt === null || typeof receipt !== "object" || typeof receipt.id !== "string" ||
            typeof receipt.command !== "string" || typeof receipt.input !== "string" ||
            !["applied", "rejected", "unknown-command"].includes(receipt.outcome) ||
            (receipt.outcome === "rejected" && typeof receipt.reason !== "string")) return null;
        }
      }
      return raw as SessionState;
    },
  };
  runner.context().game.registerSave?.(sessionModule as SnapshotModule);
  if (loaded !== null) {
    if (Object.hasOwn(loaded.snapshot, "hostSession") && sessionModule.decode!(loaded.snapshot["hostSession"]) === null) {
      throw new Error("Invalid hosted player/retry state; save left untouched");
    }
    applyWorldSnapshot([sessionModule as SnapshotModule], loaded.snapshot);
  }

  let savedRevision = loaded?.revision ?? 0;
  let savedVersion = runner.context().version();
  let savedSimTick = runner.context().sim.tick();
  let lastSaveAt = clock();
  let writing: Promise<void> | null = null;
  let saveFailure: unknown | null = null;

  function persist(): void | Promise<void> {
    const record = { snapshot: runner.state(), revision: runner.revision() };
    const version = runner.context().version();
    const simTick = runner.context().sim.tick();
    const success = () => {
      savedRevision = record.revision;
      savedVersion = version;
      savedSimTick = simTick;
      saveFailure = null;
    };
    const write = () => store.save(record);
    let pending: void | Promise<void>;
    try {
      pending = writing === null ? write() : writing.catch(() => {}).then(write);
    } catch (error) {
      saveFailure = error;
      throw error;
    }
    if (pending === undefined) {
      success();
      return;
    }
    const completion = pending.then(success, (error: unknown) => {
      saveFailure = error;
      throw error;
    });
    writing = completion;
    void completion.catch(() => {}).finally(() => {
      if (writing === completion) writing = null;
    });
    return completion;
  }

  const pull = (sinceRevision: number | null): HostedWorldSync => {
    if (sinceRevision === null || sinceRevision <= (loaded?.revision ?? 0) || sinceRevision > runner.revision()) {
      return { kind: "baseline", revision: runner.revision(), snapshot: runner.snapshot() };
    }
    return { kind: "diff", diff: runner.diff(sinceRevision) };
  };

  return {
    join(userId, isNew) {
      runner.join(userId, knownPlayers.has(userId) ? false : isNew);
      knownPlayers.add(userId);
      runner.context().touch();
      runner.commit();
    },
    hasPlayer: (userId) => knownPlayers.has(userId),
    leave(userId) {
      runner.leave(userId);
      runner.commit();
    },
    input: (userId, frame) => runner.input(userId, frame),
    command(userId, name, input, operationId) {
      const envelope = unwrapOpEnvelope(input);
      if (envelope !== null) {
        operationId ??= envelope.opId;
        input = envelope.input;
      }
      const receipts = operations.get(userId) ?? [];
      const inputJson = JSON.stringify(input) ?? "null";
      const receipt = operationId === undefined ? undefined : receipts.find((entry) => entry.id === operationId);
      if (receipt !== undefined) {
        if (receipt.command !== name || receipt.input !== inputJson) return { status: "rejected", reason: "operation-conflict" };
        if (receipt.outcome === "applied") return { status: "applied", state: runner.context() };
        if (receipt.outcome === "rejected") return { status: "rejected", reason: receipt.reason! };
        return { status: "unknown-command" };
      }
      const before = runner.state();
      let result: CommandResult<GameContext>;
      try {
        result = runner.command(userId, name, input);
      } catch (error) {
        runner.context().restore(before);
        throw error;
      }
      if (result.status !== "applied") runner.context().restore(before);
      if (operationId !== undefined) {
        receipts.push({ id: operationId, command: name, input: inputJson, outcome: result.status,
          ...(result.status === "rejected" ? { reason: result.reason } : {}) });
        operations.set(userId, receipts.slice(-historyLimit));
        runner.context().touch();
      }
      runner.commit();
      return result;
    },
    tick(dt) {
      const revision = runner.tick(dt);
      if (writing === null && (revision !== savedRevision || runner.context().version() !== savedVersion || runner.context().sim.tick() !== savedSimTick)) {
        const at = clock();
        if (saveIntervalMs <= 0 || at - lastSaveAt >= saveIntervalMs) {
          lastSaveAt = at;
          try { persist(); } catch { /* Exposed by persistenceError and retried by the next save. */ }
        }
      }
      return revision;
    },
    pull,
    sync: pull,
    snapshotFor: (viewer) => runner.snapshot(viewer),
    projectsViewers: () => runner.projectsViewers(),
    revision: () => runner.revision(),
    members: () => runner.members(),
    save: persist,
    persistenceError: () => saveFailure,
    runner: () => runner,
  };
}

/** Build a hosted session from an asynchronous persistence backend. */
export async function createHostedWorldSessionAsync<TAssetRef extends ModelAssetRef, TMultiplayer>(
  options: Omit<HostedWorldSessionOptions<TAssetRef, TMultiplayer>, "store"> & { store: HostedWorldStore },
): Promise<HostedWorldSession> {
  const { store, ...sessionOptions } = options;
  const loaded = await store.load();
  const session = createHostedWorldSession({
    ...sessionOptions,
    store: {
      load: () => loaded,
      save: (record) => store.save(record),
    },
  });
  return session;
}
