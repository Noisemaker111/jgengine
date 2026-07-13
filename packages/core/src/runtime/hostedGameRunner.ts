import type { CommandResult } from "../commands/commandRegistry";
import type { GameDefinition, LoopPlayer } from "../game/defineGame";
import type { ModelAssetRef } from "../scene/assetCatalog";
import { createGameContext, type GameContext, type GameContextContent } from "./gameContext";
import { type InputFrame } from "./inputSnapshot";
import { createWorldReplicator, type WorldDiff } from "./worldReplication";
import type { WorldSnapshot } from "./worldSnapshot";

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
  /** Record a client's latest input frame — stashed for {@link heldInput} and mirrored onto `ctx.game.players` so the movement seam reads each player's intent in `onTick`. */
  input(userId: string, frame: InputFrame): void;
  heldInput(userId: string): InputFrame | null;
  command(userId: string, name: string, input: unknown): CommandResult<GameContext>;
  tick(dt: number): number;
  diff(sinceRevision: number): WorldDiff;
  revision(): number;
  snapshot(): WorldSnapshot;
  members(): readonly string[];
  context(): GameContext;
}

/** Build a {@link HostedGameRunner} — one authoritative GameContext world driven server-side from the game's own loop. */
export function createHostedGameRunner<TAssetRef extends ModelAssetRef, TMultiplayer>(
  options: HostedGameRunnerOptions<TAssetRef, TMultiplayer>,
): HostedGameRunner {
  const { definition, content, host, now, restore } = options;
  const ctx = createGameContext({
    definition,
    content,
    player: host ?? { userId: "host", isNew: true },
    ...(now === undefined ? {} : { now }),
  });
  const loop = definition.loop ?? {};
  const replicator = createWorldReplicator(() => ctx.snapshot());
  const members = new Map<string, LoopPlayer>();
  const inputs = new Map<string, InputFrame>();

  loop.onInit?.(ctx);
  if (restore !== undefined) ctx.hydrate(restore);

  return {
    join(userId, isNew) {
      const player: LoopPlayer = { userId, isNew };
      members.set(userId, player);
      ctx.game.players?.join(userId, isNew);
      loop.onNewPlayer?.(ctx, player);
    },
    resume(userId) {
      members.set(userId, { userId, isNew: false });
      ctx.game.players?.join(userId, false);
    },
    leave(userId) {
      const player = members.get(userId);
      if (player === undefined) return;
      members.delete(userId);
      inputs.delete(userId);
      loop.onPlayerLeave?.(ctx, player);
      ctx.game.players?.leave(userId);
    },
    input(userId, frame) {
      inputs.set(userId, frame);
      ctx.game.players?.setInput(userId, frame);
    },
    heldInput(userId) {
      return inputs.get(userId) ?? null;
    },
    command(userId, name, input) {
      return ctx.game.commands.runAs(userId, name, input);
    },
    tick(dt) {
      loop.onTick?.(ctx, dt);
      return replicator.commit();
    },
    diff: (sinceRevision) => replicator.diff(sinceRevision),
    revision: () => replicator.revision(),
    snapshot: () => ctx.snapshot(),
    members: () => Array.from(members.keys()),
    context: () => ctx,
  };
}
