import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { crew, doing, type Doing } from "./crew";
import { tool } from "./hooks";
import { idea } from "./idea";
import { colony, fact } from "./spec";

const raiderIds = new Set(idea.raiders.kinds.map((raider) => raider.id));

/** Facts the HUD reads, so a screen never digs in the world itself. */
export function colonyView(ctx: GameContext) {
  const world = colony.of(ctx);
  const held = tool.read(ctx);
  const hands = [...crew(ctx).hands.keys()];
  const tally: Record<Doing, number> = { gather: 0, fight: 0, move: 0, idle: 0 };
  for (const id of hands) {
    const verb = doing(ctx, id);
    tally[verb] += 1;
  }
  return {
    resources: idea.resources.map((resource) => ({ id: resource.id, label: resource.label, value: Math.floor(world.num(fact(resource.id))) })),
    people: hands.length,
    beds: world.num(fact("beds")),
    homes: world.num(fact("homes")),
    structures: world.num(fact("structures")),
    crowns: world.num(fact("crowns")),
    raids: world.num(fact("raids")),
    raidIn: world.num(fact("raid_in")),
    raiding: world.fact(fact("raiding")) === true,
    raiders: ctx.scene.entity.list().filter((body) => raiderIds.has(body.name ?? "")).length,
    gathered: world.num(fact("gathered")),
    won: world.fact(fact("won")) === true,
    lost: world.fact(fact("lost")) === true,
    dismissed: held.dismissed,
    armed: held.armed,
    selected: held.selected,
    gathering: tally.gather,
    fighting: tally.fight,
    moving: tally.move,
    idle: tally.idle,
    building: world.orders("build").length,
    afford: idea.structures.map((structure) => Object.entries(structure.cost).every(([id, amount]) => world.num(fact(id)) >= amount)),
    mission: world.missionView(),
  };
}
