import type { CommandResult } from "../commands/commandRegistry";
import type { GameDefinition, LoopPlayer } from "../game/defineGame";
import { syncLifecyclePhase } from "../game/gamePhase";
import { advanceBehaviors } from "../scene/behaviorRuntime";
import type { ModelAssetRef } from "../scene/assetCatalog";
import { createGameContext, type GameContext, type GameContextContent, type GameContextModels } from "./gameContext";
import { type InputFrame } from "./inputSnapshot";
import { serverStep } from "../movement/serverStep";
import { resolvePlayerMovementTuning } from "../movement/playerMovement";
import { createInputRecorder, type InputRecorder, type InputRecorderState } from "./inputRecorder";
import { createWorldReplicator, type WorldDiff } from "./worldReplication";
import type { SnapshotModule, SnapshotViewer, WorldSnapshot } from "./worldSnapshot";

export type { InputFrame };

/** Reserved command name the authoritative host intercepts on the existing `runCommand` transport to route a client's {@link InputFrame} to `session.input`, so per-tick input needs no separate wire. */
export const INPUT_COMMAND = "engine.input";

/** Config for {@link createHostedGameRunner}: the game definition, its content lookup, and an optional host identity. */
export interface HostedGameRunnerOptions<TAssetRef extends ModelAssetRef, TMultiplayer> {
  definition: GameDefinition<TAssetRef, TMultiplayer>;
  content: GameContextContent;
  /** The world's own authoritative identity (`ctx.player` server-side); real players join as members. */
  host?: LoopPlayer;
  now?: () => number;
  /**
   * Rehydrate a persisted world instead of booting a fresh one — for stateless hosts (Convex) that reconstruct
   * the runner each invocation. `onInit` still runs (so commands and systems it registers exist), then this
   * snapshot overlays the world state it seeded. Omit for a long-lived stateful host (ws) that keeps one runner.
   */
  restore?: WorldSnapshot;
  /** Persisted replication cursor; restored hosts continue above it. */
  revision?: number;
  /** Render-model lookup for collider auto-fit — pass the same lookup the shell derives from `entityModels`/`objectModels` so host and clients resolve identical hitboxes. */
  models?: GameContextModels;
  /** Process-local reconnect protection. Departed admission marks expire after 5 minutes or the oldest is evicted above 256 users; zero disables retention. Live members and staged replay ticks are never evicted. */
  inputRetention?: {
    maxDepartedUsers?: number;
    departedTtlMs?: number;
    /** Wall-clock milliseconds; injectable for deterministic hosts and tests. */
    nowMs?: () => number;
  };
}

/**
 * The GameContext-loop equivalent of the pure-reducer `createGameHost`: one authoritative `createGameContext`
 * per world, driven server-side. `onInit` runs once at construction; `onNewPlayer`/`onPlayerLeave` fire per
 * join/leave; `tick` advances `onTick` then commits a revision. Clients pull a full {@link WorldSnapshot}
 * baseline once, then per-tick {@link WorldDiff}s from their last revision. Games ship only normal GameContext
 * code — the runner adds no per-game surface.
 */
export interface HostedGameRunner {
  join(userId: string, isNew: boolean): void;
  /** Re-attach an already-joined member on a reconstructed runner — restores membership and `ctx.game.players` without re-firing `onNewPlayer`. Stateless hosts call it once per persisted member after `restore`. */
  resume(userId: string): void;
  leave(userId: string): void;
  /** Record a joined/resumed client's latest input frame; nonmember input is ignored. Stashed for {@link heldInput} and sampled onto `ctx.game.players` in `onTick`. */
  input(userId: string, frame: InputFrame): void;
  /** Counts actual retained input storage for host health checks; elapsed recorder history is excluded and staged future replay ticks remain. */
  inputStats(): { members: number; recorders: number; recordedFrames: number; latestInputs: number; wireSequences: number; pressSequences: number; departedUsers: number };
  heldInput(userId: string): InputFrame | null;
  command(userId: string, name: string, input: unknown): CommandResult<GameContext>;
  tick(dt: number): number;
  diff(sinceRevision: number): WorldDiff;
  revision(): number;
  /** The full world baseline — projected to only what `viewer` may see when the context carries a replication policy, else the whole world. */
  snapshot(viewer?: SnapshotViewer): WorldSnapshot;
  /** Complete detached authoritative state for persistence, including save-only modules. */
  state(): WorldSnapshot;
  /** Commit replication without advancing simulation or running game ticks. */
  commit(): number;
  /** True when {@link snapshot} is viewer-dependent (a replication policy projects private/AOI state); a host must then serve each viewer its own frame. */
  projectsViewers(): boolean;
  members(): readonly string[];
  context(): GameContext;
}

/** Build a {@link HostedGameRunner} — one authoritative GameContext world driven server-side from the game's own loop.
 * @internal
 */
export function createHostedGameRunner<TAssetRef extends ModelAssetRef, TMultiplayer>(
  options: HostedGameRunnerOptions<TAssetRef, TMultiplayer>,
): HostedGameRunner {
  const { definition, content, host, now, restore } = options;
  const ctx = createGameContext({
    definition,
    content,
    player: host ?? { userId: "host", isNew: true },
    ...(now === undefined ? {} : { now }),
    ...(definition.replication === undefined ? {} : { replication: definition.replication }),
    ...(options.models === undefined ? {} : { models: options.models }),
  });
  const loop = definition.loop ?? {};
  const replicator = createWorldReplicator(() => ctx.snapshot(), {
    worldVersion: () => ctx.replicationVersion(),
    initialRevision: options.revision ?? 0,
  });
  const members = new Map<string, LoopPlayer>();
  const inputs = new Map<string, InputRecorder>();
  const latestInputs = new Map<string, InputFrame>();
  const movementTuning = { ...resolvePlayerMovementTuning({ world: definition.world, physics: definition.physics }), authoritativeStep: true };
  const inputSeq = new Map<string, number>();
  const inputPressSeq = new Map<string, number>();
  const departed = new Map<string, number>();
  const maxDepartedUsers = options.inputRetention?.maxDepartedUsers ?? 256;
  const departedTtlMs = options.inputRetention?.departedTtlMs ?? 300_000;
  const inputNowMs = options.inputRetention?.nowMs ?? Date.now;
  if (!Number.isInteger(maxDepartedUsers) || maxDepartedUsers < 0 || !Number.isFinite(departedTtlMs) || departedTtlMs < 0) {
    throw new RangeError("inputRetention requires a nonnegative integer user limit and finite nonnegative TTL");
  }
  let retentionTime = -Infinity;
  const retentionNow = () => {
    const time = inputNowMs();
    if (!Number.isFinite(time)) throw new RangeError("inputRetention.nowMs must return finite milliseconds");
    return retentionTime = Math.max(retentionTime, time);
  };
  const expireDeparted = () => {
    const time = retentionNow();
    // Monotone leave times keep insertion order equal to expiry order, even if
    // the wall clock reverses. Live ingress inspects only the first tombstone.
    while (departed.size > 0) {
      const [userId, expiresAt] = departed.entries().next().value!;
      if (expiresAt > time && departed.size <= maxDepartedUsers) break;
      departed.delete(userId); inputSeq.delete(userId); inputPressSeq.delete(userId);
    }
  };
  const compactRecorder = (recorder: InputRecorder, tick: number) => {
    const continuous = recorder.frameAt(tick);
    const frames = recorder.frames().filter(entry => entry.tick > tick);
    if (continuous !== null) {
      const { presses: _consumed, ...held } = continuous;
      frames.unshift({ tick, frame: held });
    }
    recorder.restore({ frames });
  };
  let hostTick = 0;

  type SavedInput = { userId: string; seq?: number; pressSeq?: number; latest: InputFrame; recorder: InputRecorderState };
  const inputModule: SnapshotModule<SavedInput[]> = {
    key: "hostInput",
    snapshot() {
      const tick = ctx.sim.tick();
      const saved: SavedInput[] = [];
      for (const userId of members.keys()) {
        const recorder = inputs.get(userId);
        const latest = latestInputs.get(userId);
        if (recorder === undefined || latest === undefined) continue;
        const continuous = recorder.frameAt(tick);
        // Keep continuous intent and unconsumed future ticks, never elapsed history.
        // Live input coalesces onto the next tick; explicit replay may stage future ticks.
        const frames = recorder.frames().filter(entry => entry.tick > tick);
        if (continuous !== null) {
          const { presses: _consumed, ...held } = continuous;
          frames.unshift({ tick, frame: held });
        }
        const seq = inputSeq.get(userId);
        const pressSeq = inputPressSeq.get(userId);
        saved.push({ userId, latest, recorder: { frames }, ...(seq === undefined ? {} : { seq }), ...(pressSeq === undefined ? {} : { pressSeq }) });
      }
      return saved;
    },
    hydrate(saved) {
      inputs.clear(); latestInputs.clear(); inputSeq.clear(); inputPressSeq.clear(); departed.clear();
      for (const input of saved) {
        const recorder = createInputRecorder();
        recorder.restore(input.recorder);
        inputs.set(input.userId, recorder);
        latestInputs.set(input.userId, input.latest);
        if (input.seq !== undefined) inputSeq.set(input.userId, input.seq);
        if (input.pressSeq !== undefined) inputPressSeq.set(input.userId, input.pressSeq);
      }
    },
    decode(raw) {
      const frame = (value: unknown): value is InputFrame => {
        if (value === null || typeof value !== "object" || !("held" in value) || !Array.isArray(value.held) || !value.held.every(action => typeof action === "string")) return false;
        if (!("pointer" in value)) return false;
        const pointer = value.pointer;
        if (pointer !== null && (typeof pointer !== "object" || !("x" in pointer) || !("y" in pointer) || !("active" in pointer) || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y) || typeof pointer.active !== "boolean")) return false;
        if ("tick" in value && value.tick !== undefined && !Number.isFinite(value.tick)) return false;
        if ("presses" in value && value.presses !== undefined && (!Array.isArray(value.presses) || !value.presses.every(press => press !== null && typeof press === "object" && typeof press.action === "string" && Number.isFinite(press.seq)))) return false;
        if ("analog" in value && value.analog !== undefined && value.analog !== null && (typeof value.analog !== "object" || Array.isArray(value.analog) || !Object.values(value.analog).every(Number.isFinite))) return false;
        return true;
      };
      if (!Array.isArray(raw) || !raw.every(input => input !== null && typeof input === "object" && typeof input.userId === "string" &&
        (input.seq === undefined || Number.isFinite(input.seq)) && (input.pressSeq === undefined || Number.isFinite(input.pressSeq)) && frame(input.latest) &&
        input.recorder !== null && typeof input.recorder === "object" && Array.isArray(input.recorder.frames) &&
        input.recorder.frames.every((entry: { tick?: unknown; frame?: unknown }) => entry !== null && typeof entry === "object" && Number.isFinite(entry.tick) && frame(entry.frame)))) return null;
      if (new Set(raw.map(input => input.userId)).size !== raw.length) return null;
      return raw as SavedInput[];
    },
  };
  ctx.game.registerSave?.(inputModule as SnapshotModule);

  loop.onInit?.(ctx);
  syncLifecyclePhase(ctx, definition.lifecycle);
  if (restore !== undefined) ctx.restore(restore);

  return {
    join(userId, isNew) {
      expireDeparted();
      if (members.has(userId)) return;
      departed.delete(userId);
      const player: LoopPlayer = { userId, isNew };
      members.set(userId, player);
      ctx.player.possession.own(userId, userId);
      ctx.game.players?.join(userId, isNew);
      loop.onNewPlayer?.(ctx, player);
      syncLifecyclePhase(ctx, definition.lifecycle);
    },
    resume(userId) {
      expireDeparted();
      departed.delete(userId);
      members.set(userId, { userId, isNew: false });
      ctx.player.possession.own(userId, userId);
      ctx.game.players?.join(userId, false);
    },
    leave(userId) {
      const player = members.get(userId);
      if (player === undefined) return;
      members.delete(userId);
      inputs.delete(userId);
      latestInputs.delete(userId);
      // Retain only bounded, recent admission marks; departed ingress is ignored.
      if (inputSeq.has(userId) || inputPressSeq.has(userId)) {
        departed.delete(userId);
        departed.set(userId, retentionNow() + departedTtlMs);
      }
      expireDeparted();
      loop.onPlayerLeave?.(ctx, player);
      ctx.game.players?.leave(userId);
    },
    input(userId, frame) {
      expireDeparted();
      if (!members.has(userId)) return;
      const seq = (frame as InputFrame & { seq?: number }).seq;
      if ((seq !== undefined && !Number.isFinite(seq)) || (frame.tick !== undefined && !Number.isFinite(frame.tick))) return;
      if (seq !== undefined) {
        const lastSeq = inputSeq.get(userId);
        if (lastSeq !== undefined && seq <= lastSeq) return;
        inputSeq.set(userId, seq);
      }
      let recorder = inputs.get(userId);
      if (recorder === undefined) {
        recorder = createInputRecorder();
        inputs.set(userId, recorder);
      }
      let admitted = frame;
      if (frame.presses !== undefined) {
        let lastPress = inputPressSeq.get(userId) ?? -Infinity;
        const presses = [...frame.presses].sort((a, b) => a.seq - b.seq).filter(press => {
          if (!Number.isFinite(press.seq) || press.seq <= lastPress) return false;
          lastPress = press.seq;
          return true;
        });
        if (presses.length > 0) inputPressSeq.set(userId, lastPress);
        admitted = { ...frame, presses };
      }
      recorder.record(frame.tick ?? ctx.sim.tick() + 1, admitted);
      compactRecorder(recorder, ctx.sim.tick());
      latestInputs.set(userId, admitted);
    },
    inputStats() {
      expireDeparted();
      return { members: members.size, recorders: inputs.size, recordedFrames: [...inputs.values()].reduce((count, recorder) => count + recorder.frames().length, 0), latestInputs: latestInputs.size, wireSequences: inputSeq.size, pressSequences: inputPressSeq.size, departedUsers: departed.size };
    },
    heldInput(userId) {
      return latestInputs.get(userId) ?? null;
    },
    command(userId, name, input) {
      return ctx.game.commands.runAs(userId, name, input);
    },
    tick(dt) {
      expireDeparted();
      hostTick += 1;
      ctx.sim.advance(dt, (stepDt, tick, gameDt) => {
        for (const [userId, recorder] of inputs) {
          const frame = recorder.frameAt(tick);
          if (frame !== null) ctx.game.players?.setInput(userId, frame);
        }
        ctx.sim.runStages("beforeMovement", stepDt);
        for (const userId of members.keys()) {
          const frame = inputs.get(userId)?.frameAt(tick) ?? null;
          if (frame !== null && gameDt > 0) serverStep(ctx, userId, frame, gameDt, movementTuning);
        }
        ctx.sim.runStages("afterMovement", stepDt);
        loop.onTick?.(ctx, gameDt);
        advanceBehaviors(ctx, gameDt);
        ctx.sim.runStages("afterTick", stepDt);
        for (const recorder of inputs.values()) compactRecorder(recorder, tick);
      });
      syncLifecyclePhase(ctx, definition.lifecycle);
      return replicator.commit();
    },
    diff: (sinceRevision) => replicator.diff(sinceRevision),
    revision: () => replicator.revision(),
    snapshot: (viewer) => ctx.snapshot(viewer === undefined ? undefined : { ...viewer, tick: hostTick }),
    state: ctx.state,
    commit: () => replicator.commit(),
    projectsViewers: () => ctx.replicatesPerViewer(),
    members: () => Array.from(members.keys()),
    context: () => ctx,
  };
}
