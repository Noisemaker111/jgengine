import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createCellContent, sceneEntityCells, sceneObjectCells, type CellContent, type CellEntityRecord, type CellObjectRecord, type FrozenEntity } from "@jgengine/core/visibility/cellContent";
import { bindWorldStreaming, createWorldStreaming, type WorldStreaming } from "@jgengine/core/visibility/worldStreaming";
import type { StreamFocus } from "@jgengine/core/visibility/worldStreamer";

import { AUTHORED_VEHICLE_SPAWNS, PLAYER_SPAWN, WORLD_D, WORLD_W } from "./districts";

/** A streamed cell is one far-proxy cell, so a parked block stands as exactly one proxy. */
const CELL = 128;
/**
 * Blocks load within 220 m of the player and stay to 280 m; past that a block is its far proxy.
 * Every block within 900 m (the whole isle) is warmed once after boot so its proxy exists before the
 * player first looks at it. One block loads and one unloads per tick, 48 props placed per tick.
 */
const STREAMING = { loadRadius: 220, keepRadius: 280, warmRadius: 900, loadsPerUpdate: 1, unloadsPerUpdate: 1 } as const;
const RESTORES_PER_STEP = 48;

/** The fixed-post cast and the parked story cars: frozen and hidden while their block is away. Traffic and residents run their own distance rules. */
const FROZEN_CAST = new Set<string>([
  "npc_marco",
  "npc_inez",
  "enforcer_boss",
  ...Array.from({ length: 5 }, (_, i) => `ganger_${i}`),
  ...AUTHORED_VEHICLE_SPAWNS.map((spawn) => spawn.id),
]);

interface HarborStreaming {
  streaming: WorldStreaming;
  objects: CellContent<CellObjectRecord>;
  cast: CellContent<CellEntityRecord, FrozenEntity>;
  release: () => void;
}

const streamingOf = perContext((): { value: HarborStreaming | null } => ({ value: null }));

function focus(ctx: GameContext): StreamFocus {
  const player = ctx.scene.entity.get(ctx.player.userId);
  const [x, , z] = player?.position ?? PLAYER_SPAWN;
  return { x, z };
}

/**
 * Stream the city by 128 m blocks once it is laid: props and their bodies past the keep radius leave
 * the scene (saved, same ids) and the fixed cast there freezes, both coming back a few per tick as
 * the player nears. The renderer draws each away block as its far proxy.
 */
export function setupStreaming(ctx: GameContext): void {
  disposeStreaming(ctx);
  const objects = createCellContent({ rule: "despawn", adapter: sceneObjectCells(ctx.scene.object), restoresPerStep: RESTORES_PER_STEP });
  const cast = createCellContent({
    rule: "freeze",
    adapter: sceneEntityCells(ctx.scene.entity, {
      keep: (entity) => !FROZEN_CAST.has(entity.id) || ctx.player.possession.active(ctx.player.userId) === entity.id,
    }),
  });
  const streaming = createWorldStreaming({
    ...STREAMING,
    area: { min: [-WORLD_W / 2, -WORLD_D / 2], max: [WORLD_W / 2, WORLD_D / 2] },
    cellSize: CELL,
    content: [objects, cast],
  });
  const release = ctx.scene.object.retain(() => objects.parkedRecords().map((record) => record.object));
  streaming.start(focus(ctx));
  bindWorldStreaming(ctx, streaming);
  streamingOf(ctx).value = { streaming, objects, cast, release };
}

export function tickStreaming(ctx: GameContext): void {
  streamingOf(ctx).value?.streaming.tick(focus(ctx));
}

/** Bring every block back before the city is re-laid, then stream the new layout. */
export function relayStreamed(ctx: GameContext, relay: () => void): void {
  const live = streamingOf(ctx).value;
  if (live === null) {
    relay();
    return;
  }
  live.streaming.stop();
  relay();
  live.streaming.start(focus(ctx));
}

/**
 * A restored world snapshot holds every prop (parked ones ride in it through `retain`) and the cast
 * as it was saved, frozen ones included: thaw the cast, forget this boot's parking and stream again
 * from where the player now stands.
 */
export function restartStreaming(ctx: GameContext): void {
  const live = streamingOf(ctx).value;
  if (live === null) return;
  // The snapshot is the authority on props: this boot's parked copies go first, so a prop the save
  // no longer has (one a car flattened) is not placed back by the stop below.
  live.objects.reset();
  live.streaming.stop();
  for (const id of FROZEN_CAST) {
    const entity = ctx.scene.entity.get(id);
    if (entity !== null && entity.movement.frozen === true) ctx.scene.entity.update(id, { movement: { ...entity.movement, frozen: false }, hidden: false });
  }
  live.cast.reset();
  live.streaming.start(focus(ctx));
}

export function disposeStreaming(ctx: GameContext): void {
  const live = streamingOf(ctx).value;
  if (live === null) return;
  live.release();
  bindWorldStreaming(ctx, null);
  streamingOf(ctx).value = null;
}
