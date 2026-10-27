import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { gunById } from "../handroll";
import { ZONES } from "../world/zones";
import { isNpcId, NPCS, objectiveLabel, scrapQuestById, type NpcId, type ScrapObjective } from "./catalog";
import { offerFrom } from "./givers";

/** What the quest marker points at: a person, a chest, a gun on the ground, an enemy, or a place. */
export type WaypointKind = "npc" | "chest" | "loot" | "enemy" | "place";

/** The quest marker: where the tracked objective is, and the words over it. */
export interface QuestWaypoint {
  x: number;
  y: number;
  z: number;
  kind: WaypointKind;
  label: string;
}

type Point = readonly [number, number, number];

function nearest(from: Point, points: readonly Point[]): Point | null {
  let best: Point | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.hypot(point[0] - from[0], point[2] - from[2]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}

function at(point: Point, kind: WaypointKind, label: string): QuestWaypoint {
  return { x: point[0], y: point[1], z: point[2], kind, label };
}

function npcPoint(ctx: GameContext, npc: NpcId): Point | null {
  return ctx.scene.entity.get(NPCS[npc].entity)?.position ?? null;
}

/** Where an enemy type lives when none is standing: the centre of a camp that spawns it. */
function campOf(ctx: GameContext, catalogId: string, from: Point): Point | null {
  const camps = ZONES.flatMap((zone) => [
    ...zone.clusters.filter((cluster) => cluster.catalogId === catalogId).map((cluster) => cluster.center),
    ...(zone.boss?.catalogId === catalogId ? [{ x: zone.boss.x, z: zone.boss.z }] : []),
  ]);
  return nearest(from, camps.map((camp): Point => [camp.x, ctx.world.groundHeightAt(camp.x, camp.z), camp.z]));
}

function objectivePoint(ctx: GameContext, objective: ScrapObjective, from: Point): QuestWaypoint | null {
  const label = objectiveLabel(objective);
  switch (objective.kind) {
    case "kill": {
      const living = ctx.scene.entity.list().filter((entity) => entity.name === objective.target).map((entity) => entity.position);
      const point = nearest(from, living) ?? campOf(ctx, objective.target, from);
      return point === null ? null : at(point, "enemy", label);
    }
    case "chest": {
      const chest = ctx.scene.object.get(objective.target);
      return chest === null ? null : at(chest.position, "chest", label);
    }
    case "pickup": {
      const guns = ctx.scene.worldItem
        .list()
        .filter((item) => gunById(item.itemId) !== undefined)
        .flatMap((item) => {
          const entity = ctx.scene.entity.get(item.instanceId);
          return entity === null ? [] : [entity.position];
        });
      const point = nearest(from, guns);
      return point === null ? null : at(point, "loot", label);
    }
    case "reach": {
      const zone = ZONES.find((candidate) => candidate.id === objective.target);
      if (zone === undefined) return null;
      const { x, z } = zone.travelStation;
      return at([x, ctx.world.groundHeightAt(x, z), z], "place", label);
    }
    case "talk": {
      const point = npcPoint(ctx, objective.target);
      return point === null ? null : at(point, "npc", label);
    }
  }
}

/**
 * The quest marker, Borderlands-style: the tracked quest's next unfinished objective, its giver once
 * every objective is done, or, with no quest running, the nearest person with one to give.
 */
export function questWaypoint(ctx: GameContext): QuestWaypoint | null {
  const journal = ctx.game.quest;
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (journal === undefined || me === null) return null;
  const tracked = journal.list(ctx.player.userId).find((entry) => entry.status === "active");
  const quest = tracked === undefined ? undefined : scrapQuestById(tracked.questId);
  if (tracked !== undefined && quest !== undefined) {
    for (const objective of quest.objectives) {
      const progress = tracked.objectives.find((entry) => entry.id === objective.id)?.progress ?? 0;
      if (progress < objective.count) return objectivePoint(ctx, objective, me.position);
    }
    if (quest.turnIn === "radio") return null;
    const point = npcPoint(ctx, quest.turnIn);
    return point === null ? null : at(point, "npc", `Return to ${NPCS[quest.turnIn].name}`);
  }
  const givers = Object.keys(NPCS).filter(isNpcId).flatMap((npc) => {
    const offer = offerFrom(ctx, npc);
    const point = npcPoint(ctx, npc);
    return (offer.kind === "give" || offer.kind === "turnIn") && point !== null ? [{ npc, point }] : [];
  });
  const closest = nearest(me.position, givers.map((giver) => giver.point));
  const giver = givers.find((candidate) => candidate.point === closest);
  return giver === undefined ? null : at(giver.point, "npc", `Talk to ${NPCS[giver.npc].name}`);
}
