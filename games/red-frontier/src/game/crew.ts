import { defineMoveOrder, defineTargetedOrder, type EngagementOrderState, type OrderMover, type OrderTargeting } from "@jgengine/core/orders/orderKinds";
import { createOrderQueue, createOrderRegistry, type OrderKind, type OrderQueue, type OrderVec3 } from "@jgengine/core/orders/orderQueue";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { hqMarker, nodeMarkers } from "./places";
import { colony, fact } from "./spec";

/**
 * The colonists: one order queue each over the engine's order verbs (move, fight) plus the colony's
 * own `gather` verb - walk to a node, work it, haul the load to the nearest store, go again.
 */
export interface Hand extends OrderMover, OrderTargeting {
  ctx: GameContext;
  id: string;
  dt: number;
}

interface GatherPayload {
  node: string;
}

type Leg = "out" | "work" | "home";

interface Trip {
  leg: Leg;
  carried: number;
  timer: number;
}

export const NODES = nodeMarkers(editorLayers);
const HQ = hqMarker(editorLayers).position;
const nodeWord = (id: string) => idea.nodes.find((node) => node.id === id) ?? null;
const raiderIds = new Set(idea.raiders.kinds.map((raider) => raider.id));
export const colonistKinds = idea.colonists.models.map((_, index) => `colonist${index + 1}`);
const RUNNING = { status: "running" } as const;

const ground = (ctx: GameContext, x: number, z: number): OrderVec3 => [x, ctx.world.groundHeightAt(x, z), z];

/** Every drop-off point that stands: the headquarters and the stores. */
function nearestDrop(ctx: GameContext, from: OrderVec3): OrderVec3 | null {
  const world = colony.of(ctx);
  let best: OrderVec3 | null = null;
  let bestDistance = Infinity;
  for (const instance of world.instances()) {
    const store = instance.kind === "hq" || idea.structures.find((structure) => structure.id === instance.kind)?.role === "store";
    if (!store || !instance.ready || instance.position === null) continue;
    const distance = Math.hypot(instance.position[0] - from[0], instance.position[1] - from[2]);
    if (distance < bestDistance) [best, bestDistance] = [ground(ctx, instance.position[0], instance.position[1]), distance];
  }
  return best;
}

const gatherOrder: OrderKind<Hand, GatherPayload> = {
  kind: "gather",
  validate: (payload) => (NODES.some((node) => node.id === payload.node) ? null : { reason: "gather needs a node" }),
  start(order) {
    order.state = { leg: "out", carried: 0, timer: 0 } satisfies Trip;
    return { ok: true };
  },
  update(order, hand, dt) {
    const at = hand.position();
    const node = NODES.find((entry) => entry.id === order.payload.node);
    const word = node === undefined ? null : nodeWord(node.node);
    if (at === null || node === undefined || word === null) return { status: "failed", reason: "nothing to gather" };
    const trip = order.state as Trip;
    if (trip.leg === "out") {
      if (hand.moveToward(ground(hand.ctx, node.x, node.z), { arriveRadius: 2.6 }).arrived) {
        trip.leg = "work";
        trip.timer = word.work;
      }
      return RUNNING;
    }
    if (trip.leg === "work") {
      const starving = colony.of(hand.ctx).num(fact(idea.resources[0]!.id)) <= 0;
      const before = Math.ceil(trip.timer);
      trip.timer -= dt * (starving ? 0.5 : 1);
      if (Math.ceil(trip.timer) !== before) hand.ctx.scene.entity.vfx({ preset: "hit", to: ground(hand.ctx, node.x, node.z), radius: 0.8 });
      if (trip.timer <= 0) {
        trip.carried = word.carry;
        trip.leg = "home";
      }
      return RUNNING;
    }
    const drop = nearestDrop(hand.ctx, at);
    if (drop === null) return RUNNING;
    if (hand.moveToward(drop, { arriveRadius: 4.5 }).arrived) {
      colony.of(hand.ctx).change({ [fact(word.resource)]: trip.carried, [fact("gathered")]: trip.carried });
      const label = idea.resources.find((resource) => resource.id === word.resource)?.label ?? word.resource;
      hand.ctx.scene.entity.floatText({ position: [at[0], at[1] + 2.4, at[2]], text: `+${trip.carried} ${label}`, kind: "heal", scale: 1 });
      trip.carried = 0;
      trip.leg = "out";
    }
    return RUNNING;
  },
  finish: (_order, hand) => hand.halt(),
};

const registry = createOrderRegistry<Hand>();
registry.define(defineMoveOrder<Hand>({ arriveRadius: 1 }));
registry.define(defineTargetedOrder<Hand>({ kind: "fight", range: 1.8 }));
registry.define(gatherOrder);

interface Colonist {
  queue: OrderQueue<Hand>;
  swing: number;
  /** The node to go back to once a fight is over. */
  resume: string | null;
}

export const crew = perContext((_ctx: GameContext) => ({ hands: new Map<string, Colonist>(), serial: 0 }));

function handOf(ctx: GameContext, id: string, dt: number): Hand {
  return {
    ctx,
    id,
    dt,
    position: () => ctx.scene.entity.get(id)?.position ?? null,
    moveToward(point, options) {
      const arrive = options?.arriveRadius ?? 1;
      const speed = idea.colonists.speed * (options?.speedScale ?? 1);
      const now = ctx.scene.entity.moveTowardCommit(id, [point[0], point[1], point[2]], { speed, dt, stopDistance: arrive * 0.7, face: true });
      const distance = now === null ? Infinity : Math.hypot(now[0] - point[0], now[2] - point[2]);
      return { arrived: distance <= arrive, distance };
    },
    halt: () => undefined,
    acquire(radius) {
      const found = ctx.scene.entity.inRadius(id, radius, (other) => raiderIds.has(ctx.scene.entity.get(other)?.name ?? ""));
      return found[0] ?? null;
    },
    positionOf: (target) => ctx.scene.entity.get(target)?.position ?? null,
  };
}

/** A colonist steps off at the headquarters. */
export function arrive(ctx: GameContext): string {
  const team = crew(ctx);
  team.serial += 1;
  const id = `col-${team.serial}`;
  const angle = team.serial * 2.4;
  // Just outside the headquarters' footprint, so nobody stands on its roof.
  const ring = (Math.max(...idea.hq.size) * idea.grid.cell) / 2 + 6;
  const x = HQ.x + Math.cos(angle) * ring;
  const z = HQ.z + Math.sin(angle) * ring;
  ctx.scene.entity.spawn(colonistKinds[team.serial % colonistKinds.length]!, { id, position: ground(ctx, x, z), role: "npc" });
  // A newcomer goes straight to work at the nearest node, the node kinds taken in turn.
  const want = idea.nodes[team.serial % idea.nodes.length]!.id;
  const work = NODES.filter((node) => node.node === want).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
  team.hands.set(id, { queue: createOrderQueue<Hand>(registry), swing: 0, resume: work?.id ?? null });
  return id;
}

export const isColonist = (id: string) => id.startsWith("col-");
export const isRaider = (ctx: GameContext, id: string) => raiderIds.has(ctx.scene.entity.get(id)?.name ?? "");

/** Send one colonist: gather a node, fight a raider, or walk to a point. */
export function order(ctx: GameContext, id: string, request: { gather: string } | { fight: string } | { move: OrderVec3 }): void {
  const colonist = crew(ctx).hands.get(id);
  if (colonist === undefined) return;
  if ("gather" in request) {
    colonist.resume = request.gather;
    colonist.queue.issue({ kind: "gather", payload: { node: request.gather } });
  } else if ("fight" in request) colonist.queue.issue({ kind: "fight", payload: { targetId: request.fight } });
  else {
    colonist.resume = null;
    colonist.queue.issue({ kind: "move", payload: { point: request.move } });
  }
}

/** What a colonist is doing, for the HUD: its active order's verb, or idle. */
export function doing(ctx: GameContext, id: string): string {
  return crew(ctx).hands.get(id)?.queue.active()?.kind ?? "idle";
}

/** Every frame: each colonist's orders advance; a raider close by is fought, then work resumes. */
export function tickCrew(ctx: GameContext, dt: number): void {
  for (const [id, colonist] of crew(ctx).hands) {
    if (ctx.scene.entity.get(id) === null) {
      crew(ctx).hands.delete(id);
      continue;
    }
    const hand = handOf(ctx, id, dt);
    const active = colonist.queue.active();
    if (active?.kind !== "fight") {
      const threat = hand.acquire(7);
      if (threat !== null) colonist.queue.issue({ kind: "fight", payload: { targetId: threat } });
    }
    colonist.queue.tick(hand, dt);
    colonist.swing -= dt;
    const now = colonist.queue.active();
    if (now?.kind === "fight") {
      const engaged = now.state as EngagementOrderState | undefined;
      if (engaged?.inRange === true && engaged.engaging !== null && colonist.swing <= 0) {
        colonist.swing = 1;
        ctx.scene.entity.effect({ from: id, to: engaged.engaging, effect: "damage", via: { amount: idea.colonists.damage } });
        ctx.scene.entity.vfx({ preset: "slash", from: id, radius: 1.6 });
      }
    } else if (now === null && colonist.resume !== null) {
      colonist.queue.issue({ kind: "gather", payload: { node: colonist.resume } });
    }
  }
}
