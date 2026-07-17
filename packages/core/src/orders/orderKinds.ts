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

/** Result of one movement step, from the game's motion adapter. */
export interface OrderMoveResult {
  /** The mover reached the point within its arrive radius this step. */
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
  /** Current position, or `null` if the entity is gone (despawned) -- the kind then fails cleanly. */
  position(): OrderVec3 | null;
  /** Step toward `point` this tick and report arrival/remaining distance. */
  moveToward(point: OrderVec3, options?: { speedScale?: number; arriveRadius?: number }): OrderMoveResult;
  /** Stop moving (release throttle / clear steering) — used by stop/hold and on cancel. */
  halt(): void;
}

/**
 * Narrow targeting adapter for engagement verbs. `acquire` returns the id of a
 * hostile within `radius` (nearest, or whatever policy the game injects), and
 * `positionOf` locates a known target. Actual damage/effects stay game-side.
 */
export interface OrderTargeting {
  /** Acquire a hostile within `radius`, or `null` if none. */
  acquire(radius: number): string | null;
  /** Current position of a target id, or `null` if it is gone. */
  positionOf(targetId: string): OrderVec3 | null;
}

/** Payload for a move order: go to a point and complete on arrival. */
export interface MoveOrderPayload {
  point: OrderVec3;
  /** Distance that counts as arrived; falls back to the factory default. */
  arriveRadius?: number;
  /** Per-order speed multiplier passed to the mover. */
  speedScale?: number;
}

/** Payload for stop/hold orders — no data; the verb is the intent. */
export type EmptyOrderPayload = Record<string, never>;

/** Payload for an attack-move: advance toward `point`, engaging hostiles encountered en route. */
export interface AttackMoveOrderPayload {
  point: OrderVec3;
  /** Radius scanned for hostiles each tick; falls back to the factory default. */
  aggroRadius?: number;
  /** Distance at which an acquired target is "in range" to attack; falls back to the factory default. */
  attackRange?: number;
  /** Arrive radius for the destination when no hostile is engaged. */
  arriveRadius?: number;
  speedScale?: number;
}

/** Live intent an attack-move/targeted order writes into `Order.state`; the game reads it to run the actual attack. Serializable. */
export interface EngagementOrderState {
  /** Target currently pursued/engaged, or `null` while travelling. */
  engaging: string | null;
  /** The engaged target is within attack range this tick — the swing/cast window. */
  inRange: boolean;
}

/** Payload for a targeted action: pursue one target until in range, holding within a leash. */
export interface TargetedOrderPayload {
  targetId: string;
  /** Distance at which the target is "in range"; falls back to the factory default. */
  range?: number;
  speedScale?: number;
}

/** Serializable patrol progress. */
export interface PatrolOrderState {
  /** Index of the waypoint currently being approached. */
  index: number;
}

/** Payload for a patrol: walk a waypoint route, optionally looping forever. */
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

/** Move + engagement config carrying the default radii the payload may override. */
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

/**
 * The plain "go here" verb: step toward a point each tick, complete on arrival,
 * fail if the entity despawns. The completion predicate is arrival within
 * `arriveRadius`.
 *
 * @capability move-order go-to-point order that completes on arrival, composed over a motion adapter
 */
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

/**
 * Stop: halt immediately and complete the same tick — the interrupt that clears
 * a unit's intent to standstill.
 *
 * @capability stop-order halt-and-complete order that brings a unit to an immediate standstill
 */
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

/**
 * Patrol: walk a waypoint route, advancing the serialized `index` as each point
 * is reached. Loops forever by default, or completes at the last waypoint when
 * `loop` is `false`.
 *
 * @capability patrol-order waypoint-route order that cycles a path, looping or completing at the end
 */
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
