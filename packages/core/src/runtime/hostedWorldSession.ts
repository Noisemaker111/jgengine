import type { CommandResult } from "../commands/commandRegistry";
import type { ModelAssetRef } from "../scene/assetCatalog";
import type { GameContext, GameContextContent, GameContextModels } from "./gameContext";
import type { GameDefinition, LoopPlayer } from "../game/defineGame";
import { createHostedGameRunner, type HostedGameRunner, type InputFrame } from "./hostedGameRunner";
import type { WorldDiff } from "./worldReplication";
import type { SnapshotViewer, WorldSnapshot } from "./worldSnapshot";

/** One hosted world's persisted authoritative state — the unit a {@link HostedWorldStore} loads and saves. */
export interface HostedWorldRecord {
  snapshot: WorldSnapshot;
  revision: number;
}

/**
 * Narrow persistence seam for a hosted world — the {@link HostedWorldRecord} counterpart of `HostPersistence`.
 * Backends implement it (memory/file/sql/convex); the session never names one. A stateful host loads once and
 * saves on a cadence; a stateless host reconstructs from `load()` each invocation.
 */
export interface HostedWorldStore {
  load(): HostedWorldRecord | null;
  save(record: HostedWorldRecord): void;
}

/** In-process {@link HostedWorldStore} for tests, local play, and the browser-tab P2P host.
 * @internal
 */
export function memoryWorldStore(seed?: HostedWorldRecord): HostedWorldStore {
  let record: HostedWorldRecord | null = seed ?? null;
  return {
    load: () => record,
    save(next) {
      record = { snapshot: next.snapshot, revision: next.revision };
    },
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
  store?: HostedWorldStore;
  /** Minimum elapsed ms between auto-saves on tick, measured against `now` (defaults to `Date.now` when omitted). Default `0` — persist on every revision-changing tick. */
  saveIntervalMs?: number;
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
  leave(userId: string): void;
  input(userId: string, frame: InputFrame): void;
  command(userId: string, name: string, input: unknown): CommandResult<GameContext>;
  tick(dt: number): number;
  /** Replication pull: `null`/`0` cursor → full baseline; a prior revision → a diff since it. */
  sync(sinceRevision: number | null): HostedWorldSync;
  /** The full world baseline projected for one viewer (private/AOI). Identity when no replication policy is set. */
  snapshotFor(viewer: SnapshotViewer): WorldSnapshot;
  /** True when {@link snapshotFor} is viewer-dependent — a host must serve each connection its own projected frame instead of a shared diff. */
  projectsViewers(): boolean;
  revision(): number;
  members(): readonly string[];
  /** Force-persist the current world to the store. */
  save(): void;
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
    ...(options.models === undefined ? {} : { models: options.models }),
  });

  let savedRevision = loaded?.revision ?? 0;
  let lastSaveAt = clock();

  function persist(): void {
    savedRevision = runner.revision();
    store.save({ snapshot: runner.snapshot(), revision: savedRevision });
  }

  return {
    join: (userId, isNew) => runner.join(userId, isNew),
    leave: (userId) => runner.leave(userId),
    input: (userId, frame) => runner.input(userId, frame),
    command: (userId, name, input) => runner.command(userId, name, input),
    tick(dt) {
      const revision = runner.tick(dt);
      if (revision !== savedRevision) {
        const at = clock();
        if (saveIntervalMs <= 0 || at - lastSaveAt >= saveIntervalMs) {
          lastSaveAt = at;
          persist();
        }
      }
      return revision;
    },
    sync(sinceRevision) {
      if (sinceRevision === null || sinceRevision <= 0) {
        return { kind: "baseline", revision: runner.revision(), snapshot: runner.snapshot() };
      }
      return { kind: "diff", diff: runner.diff(sinceRevision) };
    },
    snapshotFor: (viewer) => runner.snapshot(viewer),
    projectsViewers: () => runner.projectsViewers(),
    revision: () => runner.revision(),
    members: () => runner.members(),
    save: persist,
    runner: () => runner,
  };
}
