import type { CommandResult } from "../commands/commandRegistry";
import type { GameDefinition, LoopPlayer } from "../game/defineGame";
import type { PointerAxisState } from "../input/pointerAxis";
import type { ModelAssetRef } from "../scene/assetCatalog";
import { createGameContext, type GameContext, type GameContextContent } from "./gameContext";
import { createWorldReplicator, type WorldDiff } from "./worldReplication";
import type { WorldSnapshot } from "./worldSnapshot";

/** One client's input for a tick — the semantic held-action set plus pointer state, mirroring `ctx.input`. */
export interface InputFrame {
  held: readonly string[];
  pointer: PointerAxisState | null;
}

/** Config for {@link createHostedGameRunner}: the game definition, its content lookup, and an optional host identity. */
export interface HostedGameRunnerOptions<TAssetRef extends ModelAssetRef, TMultiplayer> {
  definition: GameDefinition<TAssetRef, TMultiplayer>;
  content: GameContextContent;
  /** The world's own authoritative identity (`ctx.player` server-side); real players join as members. */
  host?: LoopPlayer;
  now?: () => number;
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
  leave(userId: string): void;
  /** Stash a client's latest input frame. Exposed via {@link heldInput} for the movement seam; not yet applied to the shared `ctx.input`. */
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
  const { definition, content, host, now } = options;
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

  return {
    join(userId, isNew) {
      const player: LoopPlayer = { userId, isNew };
      members.set(userId, player);
      loop.onNewPlayer?.(ctx, player);
    },
    leave(userId) {
      const player = members.get(userId);
      if (player === undefined) return;
      members.delete(userId);
      inputs.delete(userId);
      loop.onPlayerLeave?.(ctx, player);
    },
    input(userId, frame) {
      inputs.set(userId, frame);
    },
    heldInput(userId) {
      return inputs.get(userId) ?? null;
    },
    command(_userId, name, input) {
      return ctx.game.commands.run(name, input);
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
