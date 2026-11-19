// @skill jgengine-world
/**
 * The reusable order verbs every commandable game re-derives -- move, stop,
 * hold, attack-move, targeted action, patrol -- built as ordinary
 * `OrderKind`s over two narrow world adapters, not baked into the queue (#912).
 * Each factory takes a configurable `kind` string, so a game re-skins a verb
 * ("harvest", "board") without the engine ever knowing the name. Movement,
 * target acquisition, pursuit/leash, and completion predicates compose here;
 * effect execution stays game-side, driven off the intent each kind writes into
 * `order.state`.
 */

import type { OrderKind, OrderProgress, OrderVec3 } from "./orderQueue";

export interface OrderMoveResult {
  arrived: boolean;
  /** Remaining distance to the point after the step. */
  distance: number;
}

/**
 * Narrow motion adapter an order kind drives. The game implements it over its
 * own controller/motor (`scene.moveToward`, a nav follower, physics) for one
 * entity; the kind never touches the scene directly.
 */
export interface OrderMover {
  position(): OrderVec3 | null;
  moveToward(point: OrderVec3, options?: { speedScale?: number | undefined; arriveRadius?: number }): OrderMoveResult;
  /** Stop moving (release throttle / clear steering) — used by stop/hold and on cancel. */
  halt(): void;
}

export interface OrderTargeting {
  acquire(radius: number): string | null;
  positionOf(targetId: string): OrderVec3 | null;
}

export interface MoveOrderPayload {
  point: OrderVec3;
  arriveRadius?: number;
  speedScale?: number;
}

export type EmptyOrderPayload = Record<string, never>;

export interface AttackMoveOrderPayload {
  point: OrderVec3;
  aggroRadius?: number;
  attackRange?: number;
  arriveRadius?: number;
  speedScale?: number;
}

export interface EngagementOrderState {
  engaging: string | null;
  inRange: boolean;
}

export interface TargetedOrderPayload {
  targetId: string;
  range?: number;
  speedScale?: number;
}

export interface PatrolOrderState {
  index: number;
}

export interface PatrolOrderPayload {
  waypoints: OrderVec3[];
  /** Loop back to the first waypoint after the last; otherwise complete at the end. Default `true`. */
  loop?: boolean;
  arriveRadius?: number;
  speedScale?: number;
}

/** Shared factory config: override the verb key so a game can register the composition under its own name. */
export interface OrderKindConfig {
  /** Registry key / `Order.kind`; defaults to the natural verb name. */
  kind?: string;
}

export interface EngagementKindConfig extends OrderKindConfig {
  arriveRadius?: number;
  aggroRadius?: number;
  attackRange?: number;
  range?: number;
}

const RUNNING: OrderProgress = { status: "running" };
const COMPLETED: OrderProgress = { status: "completed" };
const DEFAULT_ARRIVE = 0.6;

function gone(): OrderProgress {
  return { status: "failed", reason: "mover has no position (despawned)" };
}

/** @capability move-order go-to-point order that completes on arrival, composed over a motion adapter */
export function defineMoveOrder<TCtx extends OrderMover>(config: OrderKindConfig & { arriveRadius?: number } = {}): OrderKind<TCtx, MoveOrderPayload> {
  const arriveDefault = config.arriveRadius ?? DEFAULT_ARRIVE;
  return {
    kind: config.kind ?? "move",
    validate: (payload) => (Array.isArray(payload.point) ? null : { reason: "move order requires a point." }),
    start: () => ({ ok: true }),
    update(order, ctx) {
      if (ctx.position() === null) return gone();
      const arriveRadius = order.payload.arriveRadius ?? arriveDefault;
      const result = ctx.moveToward(order.payload.point, { arriveRadius, speedScale: order.payload.speedScale });
      return result.arrived ? COMPLETED : RUNNING;
    },
    finish: (_order, ctx) => ctx.halt(),
  };
}

/** @capability stop-order halt-and-complete order that brings a unit to an immediate standstill */
export function defineStopOrder<TCtx extends OrderMover>(config: OrderKindConfig = {}): OrderKind<TCtx, EmptyOrderPayload> {
  return {
    kind: config.kind ?? "stop",
    start(_order, ctx) {
      ctx.halt();
      return { ok: true };
    },
    update: () => COMPLETED,
  };
}

/**
 * Hold position: stand ground indefinitely (never completes on its own) until
 * preempted or canceled — the "guard here" verb.
 *
 * @capability hold-order stand-ground order that holds position until preempted or canceled
 */
export function defineHoldOrder<TCtx extends OrderMover>(config: OrderKindConfig = {}): OrderKind<TCtx, EmptyOrderPayload> {
  return {
    kind: config.kind ?? "hold",
    start(_order, ctx) {
      ctx.halt();
      return { ok: true };
    },
    update(_order, ctx) {
      return ctx.position() === null ? gone() : RUNNING;
    },
  };
}

/**
 * Attack-move: advance toward a destination but break off to engage any hostile
 * acquired within `aggroRadius`, pursuing it to `attackRange` and writing the
 * engagement intent into `order.state` for the game to act on. Completes on
 * reaching the destination with nothing to engage.
 *
 * @capability attack-move-order advance-and-engage order that pursues hostiles en route and completes at its destination
 */
export function defineAttackMoveOrder<TCtx extends OrderMover & OrderTargeting>(
  config: EngagementKindConfig = {},
): OrderKind<TCtx, AttackMoveOrderPayload> {
  const arriveDefault = config.arriveRadius ?? DEFAULT_ARRIVE;
  const aggroDefault = config.aggroRadius ?? 6;
  const attackDefault = config.attackRange ?? 1.5;
  return {
    kind: config.kind ?? "attack-move",
    validate: (payload) => (Array.isArray(payload.point) ? null : { reason: "attack-move order requires a point." }),
    start(order) {
      order.state = { engaging: null, inRange: false } satisfies EngagementOrderState;
      return { ok: true };
    },
    update(order, ctx) {
      const position = ctx.position();
      if (position === null) return gone();
      const state = order.state as EngagementOrderState;
      const attackRange = order.payload.attackRange ?? attackDefault;

      // Keep the current target if it is still alive, else re-acquire.
      let targetPos = state.engaging !== null ? ctx.positionOf(state.engaging) : null;
      if (targetPos === null) {
        const acquired = ctx.acquire(order.payload.aggroRadius ?? aggroDefault);
        state.engaging = acquired;
        targetPos = acquired !== null ? ctx.positionOf(acquired) : null;
      }

      if (state.engaging !== null && targetPos !== null) {
        const result = ctx.moveToward(targetPos, { arriveRadius: attackRange, speedScale: order.payload.speedScale });
        state.inRange = result.arrived;
        return RUNNING;
      }

      state.engaging = null;
      state.inRange = false;
      const result = ctx.moveToward(order.payload.point, {
        arriveRadius: order.payload.arriveRadius ?? arriveDefault,
        speedScale: order.payload.speedScale,
      });
      return result.arrived ? COMPLETED : RUNNING;
    },
    finish: (_order, ctx) => ctx.halt(),
  };
}

/**
 * Targeted action: pursue one specific target until within `range`, writing the
 * engagement intent into `order.state`. Completes when the target is gone
 * (despawned/dead), so the game's effect loop runs while `inRange` is true.
 *
 * @capability targeted-order pursue-a-target order with leash/standoff that ends when the target is gone
 */
export function defineTargetedOrder<TCtx extends OrderMover & OrderTargeting>(
  config: EngagementKindConfig = {},
): OrderKind<TCtx, TargetedOrderPayload> {
  const rangeDefault = config.range ?? 1.5;
  return {
    kind: config.kind ?? "targeted",
    validate: (payload) => (typeof payload.targetId === "string" && payload.targetId !== "" ? null : { reason: "targeted order requires a targetId." }),
    start(order) {
      order.state = { engaging: order.payload.targetId, inRange: false } satisfies EngagementOrderState;
      return { ok: true };
    },
    update(order, ctx) {
      if (ctx.position() === null) return gone();
      const state = order.state as EngagementOrderState;
      const targetPos = ctx.positionOf(order.payload.targetId);
      if (targetPos === null) return COMPLETED; // target gone -> objective resolved
      const range = order.payload.range ?? rangeDefault;
      const result = ctx.moveToward(targetPos, { arriveRadius: range, speedScale: order.payload.speedScale });
      state.inRange = result.arrived;
      return RUNNING;
    },
    finish: (_order, ctx) => ctx.halt(),
  };
}

/** @capability patrol-order waypoint-route order that cycles a path, looping or completing at the end */
export function definePatrolOrder<TCtx extends OrderMover>(config: OrderKindConfig & { arriveRadius?: number } = {}): OrderKind<TCtx, PatrolOrderPayload> {
  const arriveDefault = config.arriveRadius ?? DEFAULT_ARRIVE;
  return {
    kind: config.kind ?? "patrol",
    validate: (payload) =>
      Array.isArray(payload.waypoints) && payload.waypoints.length > 0 ? null : { reason: "patrol order requires at least one waypoint." },
    start(order) {
      order.state = { index: 0 } satisfies PatrolOrderState;
      return { ok: true };
    },
    update(order, ctx) {
      if (ctx.position() === null) return gone();
      const state = order.state as PatrolOrderState;
      const waypoints = order.payload.waypoints;
      const loop = order.payload.loop ?? true;
      const target = waypoints[state.index];
      if (target === undefined) return COMPLETED;
      const result = ctx.moveToward(target, {
        arriveRadius: order.payload.arriveRadius ?? arriveDefault,
        speedScale: order.payload.speedScale,
      });
      if (!result.arrived) return RUNNING;
      const next = state.index + 1;
      if (next >= waypoints.length) {
        if (!loop) return COMPLETED;
        state.index = 0;
      } else {
        state.index = next;
      }
      return RUNNING;
    },
    finish: (_order, ctx) => ctx.halt(),
  };
}
