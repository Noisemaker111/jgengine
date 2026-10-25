import { assignFormationSlots, boxFormation, facingYaw, placeFormation, type Vec2 } from "@jgengine/core/movement/formation";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { crew, isColonist, isRaider, NODES, order } from "./crew";
import { tool } from "./hooks";
import { idea } from "./idea";
import { cellFor, colonyGrid, planMarkers } from "./places";
import { colony, fact } from "./spec";

interface OrderInput {
  selection?: readonly string[];
  point?: readonly number[];
}

const grid = colonyGrid(editorLayers);
const deny = (ctx: GameContext, text: string): void => {
  ctx.game.notices.push({ text, tone: "deny" });
};

/** Pick up a structure to place (its number key or its button); the same key puts it down again. */
export function arm(ctx: GameContext, id: string): void {
  ctx.scene.entity.selection.clear();
  tool.update(ctx, (state) => ({ ...state, armed: state.armed === id ? null : id, selected: 0 }));
}

function placeAt(ctx: GameContext, id: string, x: number, z: number): void {
  const structure = idea.structures.find((entry) => entry.id === id)!;
  const cell = cellFor(grid, x, z, structure.size);
  if (cell === null) return deny(ctx, "Build inside the colony grounds");
  const world = colony.of(ctx);
  const refused = world.canPlace(id, { cell });
  if (refused !== null) return deny(ctx, refused.message);
  world.place(id, { cell });
  ctx.game.notices.push({ text: `${structure.label} going up`, tone: "info" });
}

/** The nearest live thing to a point within `reach`, among `ids`. */
function nearestTo(ctx: GameContext, ids: Iterable<string>, x: number, z: number, reach: number): string | null {
  let best: string | null = null;
  let bestDistance = reach;
  for (const id of ids) {
    const at = ctx.scene.entity.get(id)?.position;
    if (at === undefined) continue;
    const distance = Math.hypot(at[0] - x, at[2] - z);
    if (distance <= bestDistance) [best, bestDistance] = [id, distance];
  }
  return best;
}

/** Walk the selection to a point in a loose block, each to its nearest slot. */
function moveGroup(ctx: GameContext, ids: readonly string[], x: number, z: number): void {
  const members: Vec2[] = ids.map((id) => {
    const at = ctx.scene.entity.get(id)?.position ?? [x, 0, z];
    return [at[0], at[2]] as const;
  });
  const centre: Vec2 = [members.reduce((sum, at) => sum + at[0], 0) / members.length, members.reduce((sum, at) => sum + at[1], 0) / members.length];
  const slots = placeFormation([x, z], facingYaw(centre, [x, z]), ids.length, boxFormation({ spacing: 1.8 }));
  const assigned = assignFormationSlots(members, slots);
  ids.forEach((id, index) => {
    const slot = slots[assigned[index] ?? index] ?? [x, z];
    order(ctx, id, { move: [slot[0], ctx.world.groundHeightAt(slot[0], slot[1]), slot[1]] });
  });
}

/**
 * Right click: with a structure in hand, place it; with colonists selected, send them - to gather a
 * node, to fight a raider, or to walk there in a block.
 */
function command(ctx: GameContext, input: OrderInput): void {
  const point = Array.isArray(input.point) && input.point.length === 3 ? input.point : null;
  if (point === null) return;
  const [x, , z] = point as [number, number, number];
  const held = tool.read(ctx);
  const ids = (input.selection ?? []).filter((id) => isColonist(id) && crew(ctx).hands.has(id));
  if (ids.length === 0) {
    if (held.armed !== null) placeAt(ctx, held.armed, x, z);
    return;
  }
  const raider = nearestTo(ctx, ctx.scene.entity.list().filter((body) => isRaider(ctx, body.id)).map((body) => body.id), x, z, 3.5);
  if (raider !== null) {
    for (const id of ids) order(ctx, id, { fight: raider });
    return;
  }
  const node = nearestTo(ctx, NODES.map((entry) => entry.id), x, z, 5);
  if (node !== null) {
    for (const id of ids) order(ctx, id, { gather: node });
    const word = idea.nodes.find((entry) => entry.id === NODES.find((marker) => marker.id === node)?.node);
    ctx.game.notices.push({ text: `${ids.length} ${ids.length === 1 ? idea.colonists.one.toLowerCase() : idea.colonists.label.toLowerCase()} to the ${word?.label.toLowerCase() ?? "node"}`, tone: "info" });
    return;
  }
  moveGroup(ctx, ids, x, z);
}

/** The pointer and every key: place, order, select everyone, set the idle to work. */
export const buildSystem = defineSystem({
  id: "colony.build",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.commands.define<OrderInput>("colony.order", {
      apply(state, input) {
        command(state, input);
        return state;
      },
    });
    idea.structures.forEach((structure, index) => {
      ctx.game.commands.define(`build${index + 1}`, {
        apply(state) {
          arm(state, structure.id);
          return state;
        },
      });
    });
    ctx.game.commands.define("selectAll", {
      apply(state) {
        state.scene.entity.selection.replace(crew(state).hands.keys());
        return state;
      },
    });
    // G: every selected colonist (or every idle one) goes to the nearest node.
    ctx.game.commands.define("gather", {
      apply(state) {
        const team = crew(state);
        const picked = state.scene.entity.selection.list().filter((id) => team.hands.has(id));
        const ids = picked.length > 0 ? picked : [...team.hands.keys()].filter((id) => team.hands.get(id)?.queue.active() === null);
        for (const id of ids) {
          const at = state.scene.entity.get(id)?.position;
          const node = at === undefined ? null : nearestTo(state, NODES.map((entry) => entry.id), at[0], at[2], 500);
          if (node !== null) order(state, id, { gather: node });
        }
        if (ids.length > 0) state.game.notices.push({ text: `${ids.length} sent to gather`, tone: "info" });
        return state;
      },
    });
    // A colony a few minutes in, from the scene's `plan` markers: what a capture state or a clip starts from.
    ctx.game.commands.define("stage", {
      apply(state) {
        const world = colony.of(state);
        for (const plan of planMarkers(editorLayers)) {
          const structure = idea.structures.find((entry) => entry.id === plan.structure);
          const cell = structure === undefined ? null : cellFor(grid, plan.x, plan.z, structure.size);
          if (cell !== null && world.canPlace(plan.structure, { cell }, { free: true }) === null) world.place(plan.structure, { cell }, { free: true });
        }
        // The first raid is moments out, so a clip from here sees the fight.
        world.set(fact("raid_in"), 8);
        state.game.commands.run("gather", {});
        return state;
      },
    });
    ctx.game.commands.define("dismiss", {
      apply(state) {
        tool.update(state, (held) => ({ ...held, dismissed: true }));
        return state;
      },
    });
  },
});
