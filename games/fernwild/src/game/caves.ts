import { caveLayout, type CaveLayout } from "@jgengine/core/cave/caveLayout";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { editorLayers } from "../editorLayers";
import { itemLabel } from "./data/items";
import { give, grantXp } from "./survivor";

/** The layer the caves' rock occupies in the world's collision. */
const SOLIDS_LAYER = "fernwild:caves";
/** How near the artifact's pedestal E reaches, metres. */
const TAKE_REACH = 3;
/** ARK's artifacts come back about half an hour after they are taken. */
const ARTIFACT_RESPAWN = 1800;
/** XP for bringing one out. */
const ARTIFACT_XP = 200;

/** One of the Island's caves: where it runs, what it guards, and when its artifact is back. */
export interface IslandCave {
  id: string;
  label: string;
  artifact: string;
  /** ARK's hard caves: deeper, more dwellers. */
  hard: boolean;
  layout: CaveLayout;
}

/**
 * The caves are `cave` paths in editor.scene.json, mouth to chamber, each with the artifact its chamber
 * holds; the creatures inside are ordinary spawn zones in the chamber.
 */
export function islandCaves(ground: (x: number, z: number) => number): IslandCave[] {
  return editorLayers.paths
    .filter((path) => path.kind === "cave")
    .map((path) => {
      const meta = (path.meta ?? {}) as { artifact?: string; height?: number; chamber?: number; cover?: number; hard?: boolean };
      return {
        id: path.id,
        label: path.label ?? path.id,
        artifact: meta.artifact ?? "",
        hard: meta.hard === true,
        layout: caveLayout(
          {
            path: path.points.map((point) => [point.x, point.z] as const),
            width: path.width ?? 7,
            height: meta.height ?? 6,
            chamber: meta.chamber ?? 12,
            cover: meta.cover ?? 6,
            seed: [...path.id].reduce((sum, char) => sum + char.charCodeAt(0), 0),
          },
          ground,
        ),
      };
    });
}

interface CaveState {
  caves: IslandCave[];
  /** Cave id → game time its artifact is back on the pedestal. */
  takenUntil: Map<string, number>;
}

const caveStateOf = perContext((ctx: GameContext): CaveState => {
  const caves = islandCaves(ctx.world.groundHeightAt);
  ctx.world.solids.set(SOLIDS_LAYER, caves.flatMap((cave) => cave.layout.solids));
  return { caves, takenUntil: new Map() };
});

/** The caves of this world, laid out (and their rock made solid) on first use. */
export function cavesOf(ctx: GameContext): readonly IslandCave[] {
  return caveStateOf(ctx).caves;
}

/** Whether `cave`'s artifact sits on its pedestal right now. */
export function artifactHere(ctx: GameContext, cave: IslandCave): boolean {
  return (caveStateOf(ctx).takenUntil.get(cave.id) ?? -Infinity) <= ctx.time.now();
}

/** The cave the survivor stands in, and how far in (metres from the mouth); null outside every cave. */
export function caveAt(ctx: GameContext, x: number, z: number): { cave: IslandCave; depth: number } | null {
  for (const cave of cavesOf(ctx)) {
    const depth = cave.layout.depth(x, z);
    if (depth !== null) return { cave, depth };
  }
  return null;
}

function pedestalNear(ctx: GameContext): IslandCave | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return null;
  for (const cave of cavesOf(ctx)) {
    const [x, z] = cave.layout.chamber.center;
    if (Math.hypot(me.position[0] - x, me.position[2] - z) < TAKE_REACH && artifactHere(ctx, cave)) return cave;
  }
  return null;
}

/** E at a chamber's pedestal: take its artifact. */
export function takeArtifact(ctx: GameContext): void {
  const cave = pedestalNear(ctx);
  if (cave === null || give(ctx, cave.artifact, 1) === 0) return;
  caveStateOf(ctx).takenUntil.set(cave.id, ctx.time.now() + ARTIFACT_RESPAWN);
  grantXp(ctx, ARTIFACT_XP);
  ctx.game.notices.push({ text: `${itemLabel(cave.artifact)} taken from the ${cave.label}`, tone: "success" });
}

export function cavePrompts(ctx: GameContext): PositionedPrompt[] {
  const cave = pedestalNear(ctx);
  if (cave === null) return [];
  const [x, z] = cave.layout.chamber.center;
  return [{ id: `artifact:${cave.id}`, position: { x, z }, priority: 3, prompt: proximityPrompt({ radius: TAKE_REACH + 1, display: keybind("interact", `Take ${itemLabel(cave.artifact)}`), invoke: command("takeArtifact") }) }];
}

/** What the world draws and the HUD reads: each cave, whether its artifact is in place, and the cave the survivor is in. */
export function cavesView(ctx: GameContext) {
  const me = ctx.scene.entity.get(ctx.player.userId);
  const here = me === null ? null : caveAt(ctx, me.position[0], me.position[2]);
  return {
    caves: cavesOf(ctx).map((cave) => ({ id: cave.id, label: cave.label, hard: cave.hard, layout: cave.layout, artifact: artifactHere(ctx, cave) ? cave.artifact : null })),
    inside: here === null ? null : { id: here.cave.id, label: here.cave.label, depth: here.depth },
  };
}

export interface CavesSave {
  takenUntil: Record<string, number>;
}

export function cavesSave(ctx: GameContext) {
  return {
    key: "fernwild.caves",
    snapshot: (): CavesSave => ({ takenUntil: Object.fromEntries(caveStateOf(ctx).takenUntil) }),
    hydrate: (data: CavesSave) => {
      caveStateOf(ctx).takenUntil = new Map(Object.entries(data.takenUntil ?? {}));
    },
  };
}

/** Every artifact back on its pedestal. */
export function resetCaves(ctx: GameContext): void {
  caveStateOf(ctx).takenUntil.clear();
}
