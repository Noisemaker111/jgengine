import type { Blackboard, DecisionAbort, DecisionAction, DecisionGraphRuntime } from "../ai/decisionGraph";
import { createDecisionGraphRuntime } from "../ai/decisionGraph";
import { advanceInterestGate, createInterestGateState, interestPhase, type InterestGateState, type InterestSchedulerConfig } from "../ai/interestScheduler";
import { advancePursuit, armPursuit, createPursuitState, type PursuitState } from "../ai/pursuit";
import { acquireTarget } from "../ai/targetAcquisition";
import { createThreatTable, type ThreatTable, type ThreatTableState } from "../ai/threat";
import {
  advancePathFollow,
  createPathFollow,
  pathFollowSeek,
  type PathFollowConfig,
  type PathFollowState,
  type PathProgress,
  type Waypoint,
} from "../nav/pathFollow";
import { resolveWalkerStep } from "../movement/solidObstacles";
import type { GameContext } from "../runtime/gameContext";
import type { GameDefinition } from "../game/defineGame";
import { perContext } from "../runtime/perContext";
import { notifyAfter } from "../store/changeSignal";
import { visibleEntityIds } from "../runtime/worldProjection";
import type { SceneEntity } from "./entityStore";

import { behaviorDataEqual, type BehaviorDescriptor, type DecisionGraphBehavior, type PatrolBehavior, type PursueBehavior, type WanderBehavior } from "./behaviors";
import { distanceBetween } from "./spatial";

const DEFAULT_WANDER_SPEED = 1.5;
const WANDER_ARRIVAL = 0.6;
/** Below this share of its intended step a wanderer counts as blocked and re-rolls its target. */
const WANDER_BLOCKED_FRACTION = 0.25;

/** Whether a behavior instance advances and writes pose (`active`), is temporarily suspended retaining
 * state (`paused`), or is held off until re-enabled (`disabled`). */
export type BehaviorStatus = "active" | "paused" | "disabled";

/** Context supplied to a registered decision graph action. */
export interface BehaviorActionContext {
  ctx: GameContext;
  entityId: string;
  dt: number;
}

/** Callback used by a registered decision graph behavior action. */
export type BehaviorAction = DecisionAction<BehaviorActionContext>;

/** Optional hooks for a registered behavior action set. */
export interface BehaviorActionOptions {
  /** Called when an action running last think is pre-empted by another branch, to stop movement or release claims. */
  onAbort?: DecisionAbort<BehaviorActionContext>;
}

interface RegisteredActions {
  actions: Record<string, BehaviorAction>;
  options: BehaviorActionOptions;
}

const behaviorActions = new Map<string, RegisteredActions>();

/** Register the named actions used by decision graph behavior descriptors.
 * @capability behavior-actions register named callbacks for decision graph behavior descriptors
 */
export function registerBehaviorActions(id: string, actions: Record<string, BehaviorAction>, options: BehaviorActionOptions = {}): () => void {
  const entry = { actions, options };
  behaviorActions.set(id, entry);
  return () => {
    if (behaviorActions.get(id) === entry) behaviorActions.delete(id);
  };
}

/**
 * Catch-up policy applied when a paused instance resumes. `freeze` (default, deterministic) discards
 * the time spent paused; `advance` silently fast-forwards the instance by the paused duration without
 * emitting intermediate pose writes. Only patrol honors `advance`; wander/pursue treat it as `freeze`.
 */
export type BehaviorResumePolicy = "freeze" | "advance";

/** Serializable snapshot of one behavior instance — round-trips exactly through
 * {@link BehaviorControl.serialize}/{@link BehaviorControl.restore}. */
export type BehaviorSnapshot =
  | { readonly kind: "patrol"; readonly state: PathFollowState }
  | { readonly kind: "wander"; readonly origin: Waypoint; readonly target: Waypoint | null }
  | PursueBehaviorSnapshot
  | {
      readonly kind: "decisionGraph";
      readonly graph: ReturnType<DecisionGraphRuntime["snapshot"]>;
      readonly gate: InterestGateState;
      readonly blackboard?: Blackboard;
      /** Seconds accrued since the last think. */
      readonly pending?: number;
    };

/** Plain pursuit progress, including its original spawn home and scheduled elapsed time. */
export interface PursueBehaviorSnapshot {
  readonly kind: "pursue";
  readonly home: Waypoint;
  readonly targetId: string | null;
  readonly explicitTargetId: string | null;
  readonly returning: boolean;
  readonly pursuit: PursuitState;
  readonly gate: InterestGateState;
  readonly pending: number;
  readonly threat?: ThreatTableState;
}

/** Inspection readout for editor/debug tooling, from {@link BehaviorControl.inspect}/{@link BehaviorControl.list}. */
export interface BehaviorInspection {
  id: string;
  kind: "patrol" | "wander" | "decisionGraph" | "pursue";
  status: BehaviorStatus;
  reason: string | null;
}

interface Lifecycle {
  status: BehaviorStatus;
  reason: string | null;
  /** Real time elapsed while paused, for `advance` resume catch-up. */
  pausedElapsed: number;
}

interface PatrolNav extends Lifecycle {
  kind: "patrol";
  config: PathFollowConfig;
  state: PathFollowState;
  groundClamp: boolean;
}

interface WanderNav extends Lifecycle {
  kind: "wander";
  radius: number;
  origin: readonly [number, number, number];
  target: readonly [number, number, number] | null;
  roll: () => number;
}

interface DecisionGraphNav extends Lifecycle {
  kind: "decisionGraph";
  behavior: DecisionGraphBehavior;
  runtime: DecisionGraphRuntime<BehaviorActionContext>;
  gate: InterestGateState;
  cadence: InterestSchedulerConfig;
  blackboard: Blackboard;
  pending: number;
}

interface PursueNav extends Lifecycle {
  kind: "pursue";
  behavior: PursueBehavior;
  home: Waypoint;
  targetId: string | null;
  returning: boolean;
  pursuit: PursuitState;
  gate: InterestGateState;
  cadence: InterestSchedulerConfig;
  pending: number;
  threat?: ThreatTable;
  threatControl?: ThreatTable;
}

type Nav = PatrolNav | WanderNav | DecisionGraphNav | PursueNav;

// Bind unsaved policy without eagerly constructing the lazy AI runtime before boot-time restore.
const pursuitPolicies = new WeakMap<GameContext, NonNullable<GameDefinition["pursuit"]>["eligible"]>();

function thinkCadence(behavior: DecisionGraphBehavior): InterestSchedulerConfig {
  return { wakeRadius: Number.POSITIVE_INFINITY, activeInterval: Math.max(0, behavior.thinkInterval ?? 0) };
}

/**
 * Per-entity control surface for the behavior runtime — pause/resume/disable/enable an instance,
 * seek it to semantic progress, serialize/restore its state, and inspect it, all keyed by stable
 * entity id without a full-world scan. Obtain it with {@link behaviorControl}.
 */
export interface BehaviorControl {
  /** Current status of the instance, or `null` if the entity has no live behavior. */
  status(id: string): BehaviorStatus | null;
  /** Human-readable reason attached to the last pause/disable, or `null`. */
  reason(id: string): string | null;
  /** Suspend advancement and pose writes, retaining state. No-op (`false`) if not active. */
  pause(id: string, reason?: string): boolean;
  /** Resume a paused instance, applying the catch-up `policy` (default `freeze`). */
  resume(id: string, policy?: BehaviorResumePolicy): boolean;
  /** Hold the instance off (no advance, no pose) until {@link enable}. Retains state. */
  disable(id: string, reason?: string): boolean;
  /** Re-activate a disabled instance from its retained state (no catch-up). */
  enable(id: string): boolean;
  /** Jump a patrol instance to semantic {@link PathProgress}. Returns `false` for non-patrol instances. */
  seek(id: string, progress: PathProgress): boolean;
  /** Capture the instance's exact serializable state, or `null` if absent. */
  serialize(id: string): BehaviorSnapshot | null;
  /** Restore an instance from a {@link BehaviorSnapshot} of the matching kind. */
  restore(id: string, snapshot: BehaviorSnapshot): boolean;
  /** Inspect one instance, or `null` if absent. */
  inspect(id: string): BehaviorInspection | null;
  /** Inspect every live instance (bounded by spawned behavior entities). */
  list(): BehaviorInspection[];
  /** The live, persistent blackboard of a decision graph instance for perception and game systems to write facts into, or `null`. */
  blackboard(id: string): Blackboard | null;
  /** Optional pursuit threat table; explicit `setTarget` wins over taunt/threat and proximity. */
  threat(id: string): ThreatTable | null;
  /** Clear pursuit target/cooldown/threat and reset its cadence, retaining the original home. */
  reset(id: string): boolean;
}

function patrolOf(entity: { behaviors: readonly { kind: string }[] }): PatrolBehavior | null {
  return (entity.behaviors.find((b) => b.kind === "patrol") as PatrolBehavior | undefined) ?? null;
}

function wanderOf(entity: { behaviors: readonly { kind: string }[] }): WanderBehavior | null {
  return (entity.behaviors.find((b) => b.kind === "wander") as WanderBehavior | undefined) ?? null;
}

function decisionGraphOf(entity: { behaviors: readonly { kind: string }[] }): DecisionGraphBehavior | null {
  return (entity.behaviors.find((b) => b.kind === "decisionGraph") as DecisionGraphBehavior | undefined) ?? null;
}

const runtimeOf = perContext((ctx) => {
  const nav = new Map<string, Nav>();

  const descriptors = new Map<string, BehaviorDescriptor>();
  const refreshId = (id: string): void => {
    const entity = ctx.scene.entity.get(id);
    const descriptor = entity === null ? undefined : patrolOf(entity) ?? wanderOf(entity) ?? decisionGraphOf(entity)
      ?? entity.behaviors.find(behavior => behavior.kind === "pursue");
    if (entity !== null && descriptor !== undefined && nav.has(id) && behaviorDataEqual(descriptors.get(id), descriptor)) return;
    const previous = nav.get(id);
    nav.delete(id);
    descriptors.delete(id);
    try {
      if (entity === null || descriptor === undefined) return;
      descriptors.set(id, descriptor);
      const patrol = patrolOf(entity);
      if (patrol !== null) {
        const config: PathFollowConfig = { waypoints: patrol.waypoints, speed: patrol.speed, loop: patrol.loop };
        nav.set(entity.id, {
          kind: "patrol",
          config,
          state: patrol.startProgress !== undefined ? pathFollowSeek(config, patrol.startProgress) : createPathFollow(config),
          groundClamp: patrol.groundClamp ?? false,
          status: "active",
          reason: null,
          pausedElapsed: 0,
        });
        return;
      }
      const wander = wanderOf(entity);
      if (wander !== null) {
        nav.set(entity.id, {
          kind: "wander",
          radius: wander.radius,
          origin: entity.position,
          target: null,
          roll: () => ctx.rng(),
          status: "active",
          reason: null,
          pausedElapsed: 0,
        });
        return;
      }
      const decisionGraph = decisionGraphOf(entity);
      if (decisionGraph !== null) {
        const registered = behaviorActions.get(decisionGraph.actions);
        if (registered === undefined) return;
        const cadence = thinkCadence(decisionGraph);
        nav.set(entity.id, {
          kind: "decisionGraph",
          behavior: decisionGraph,
          runtime: createDecisionGraphRuntime(decisionGraph.graph, registered.actions, {
            rng: () => ctx.rng(),
            ...(registered.options.onAbort === undefined ? {} : { onAbort: registered.options.onAbort }),
          }),
          gate: createInterestGateState(cadence, ctx.rng()),
          cadence,
          blackboard: { ...(decisionGraph.blackboard ?? {}) },
          pending: 0,
          status: "active",
          reason: null,
          pausedElapsed: 0,
        });
      }
      const pursuing = entity.behaviors.find((behavior) => behavior.kind === "pursue");
      if (pursuing?.kind === "pursue" && !nav.has(entity.id)) {
        const cadence = { wakeRadius: Infinity, activeInterval: pursuing.thinkInterval ?? .1 };
        const gate = createInterestGateState(cadence, interestPhase(entity.id));
        gate.state = "active";
        nav.set(entity.id, { kind: "pursue", behavior: pursuing,
          home: [...(ctx.scene.entity.spawnPoseOf(entity.id)?.position ?? entity.position)],
          targetId: null, returning: false, pursuit: createPursuitState(),
          gate, cadence, pending: 0,
          status: "active", reason: null, pausedElapsed: 0,
          ...(pursuing.threat === undefined ? {} : { threat: createThreatTable(pursuing.threat) }) });
      }
    } finally {
      if (previous?.kind === "decisionGraph") previous.runtime.abort({ ctx, entityId: id, dt: 0 }, previous.blackboard);
    }
  };
  const refresh = (): void => {
    const live = new Set<string>();
    for (const entity of ctx.scene.entity.list()) { live.add(entity.id); refreshId(entity.id); }
    for (const id of descriptors.keys()) if (!live.has(id)) refreshId(id);
  };

  ctx.scene.entity.subscribeBehaviors(refreshId);
  refresh();
  return { nav };
});

function resetPursue(ctx: GameContext, id: string, entry: PursueNav): void {
  entry.targetId = null;
  entry.returning = false;
  entry.pursuit.attackCooldown = 0;
  entry.pending = 0;
  entry.gate = createInterestGateState(entry.cadence, interestPhase(id));
  entry.gate.state = "active";
  entry.threat?.clear();
  ctx.scene.entity.setTarget(id, null);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validPursueSnapshot(value: unknown): value is PursueBehaviorSnapshot {
  if (!object(value) || value.kind !== "pursue" || !Array.isArray(value.home) || value.home.length !== 3
    || !value.home.every(n => typeof n === "number" && Number.isFinite(n))
    || !(value.targetId === null || typeof value.targetId === "string")
    || !(value.explicitTargetId === null || typeof value.explicitTargetId === "string") || typeof value.returning !== "boolean"
    || !object(value.pursuit) || !nonnegative(value.pursuit.attackCooldown) || !nonnegative(value.pending)
    || !object(value.gate) || !(value.gate.state === "active" || value.gate.state === "dormant")
    || !nonnegative(value.gate.clock) || !nonnegative(value.gate.awakeHold)
    || !nonnegative(value.gate.phase) || value.gate.phase >= 1) return false;
  if (value.threat !== undefined) {
    if (!object(value.threat) || !Array.isArray(value.threat.entries) || !nonnegative(value.threat.forcedRemaining)
      || !(value.threat.forcedSource === null || typeof value.threat.forcedSource === "string")) return false;
    const seen = new Set<string>();
    for (const entry of value.threat.entries) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || seen.has(entry[0])
        || typeof entry[1] !== "number" || !Number.isFinite(entry[1])) return false;
      seen.add(entry[0]);
    }
  }
  return true;
}

function restorePursue(entry: PursueNav, snapshot: PursueBehaviorSnapshot): void {
  entry.home = [...snapshot.home];
  entry.targetId = snapshot.targetId;
  entry.returning = snapshot.returning;
  entry.pursuit = { ...snapshot.pursuit };
  entry.gate = { ...snapshot.gate };
  entry.pending = snapshot.pending;
  if (entry.threat !== undefined && snapshot.threat !== undefined) entry.threat.restore(snapshot.threat);
  else entry.threat?.clear();
}

function stepPursue(ctx: GameContext, id: string, entry: PursueNav, dt: number): void {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return;
  const { behavior, home } = entry;
  const homeDistance = distanceBetween(entity.position, home);
  const policy = pursuitPolicies.get(ctx);
  const eligible = (candidate: string): boolean => candidate !== id && ctx.scene.entity.get(candidate) !== null
    && ctx.scene.entity.canReceive(candidate, behavior.attack.effect, behavior.attack.amount) === null
    && (policy === undefined || policy(ctx, id, candidate) === true);
  entry.threat?.decay(dt);
  if (!entry.returning) {
    const explicit = ctx.scene.entity.getTarget(id);
    const forced = entry.threat?.forcedTarget() ?? null;
    if (explicit !== null && eligible(explicit)) entry.targetId = explicit;
    else if (forced !== null && eligible(forced)) entry.targetId = forced;
    else {
      const nearby = ctx.scene.entity.inRadius(id, behavior.aggroRadius, candidate => ctx.scene.entity.get(candidate)?.role === "player");
      if (entry.targetId !== null && !nearby.includes(entry.targetId)) nearby.push(entry.targetId);
      const held = entry.targetId;
      entry.targetId = acquireTarget({ candidates: () => nearby, distance: ctx.scene.entity.distance,
        range: (_self, candidate) => candidate === held ? Infinity : behavior.aggroRadius,
        eligible: (_self, candidate) => eligible(candidate), score: (_self, candidate) => entry.threat?.threatOf(candidate) ?? 0,
        tieBreak: (a, b) => (ctx.scene.entity.distance(id, a) ?? Infinity) - (ctx.scene.entity.distance(id, b) ?? Infinity)
          || (a < b ? -1 : a > b ? 1 : 0),
      }, id, held).targetId;
    }
  }
  const targetDistance = entry.targetId === null ? null : ctx.scene.entity.distance(id, entry.targetId);
  const action = advancePursuit(entry.pursuit, dt, targetDistance, behavior.reach,
    behavior.cooldownMode, homeDistance, behavior.leashRange);
  if (action === "leash" || (targetDistance === null && homeDistance > .1)) entry.returning = true;
  if (entry.returning) {
    entry.targetId = null;
    ctx.scene.entity.setTarget(id, null);
    ctx.scene.entity.moveTowardCommit(id, home, { speed: behavior.speed, stopDistance: 0, dt, face: true });
    const position = ctx.scene.entity.get(id)?.position;
    if (position !== undefined && distanceBetween(position, home) <= .1) resetPursue(ctx, id, entry);
  } else if (action === "pursue" && entry.targetId !== null) {
    ctx.scene.entity.moveTowardCommit(id, entry.targetId, { speed: behavior.speed, stopDistance: behavior.reach, dt, face: true });
  } else if (action === "attack" && entry.targetId !== null) {
    ctx.scene.entity.effect({ from: id, to: entry.targetId, effect: behavior.attack.effect, via: { amount: behavior.attack.amount } });
    armPursuit(entry.pursuit, behavior.attack.intervalSec);
  }
}

function stepWander(ctx: GameContext, id: string, nav: WanderNav, dt: number): void {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return;
  const [px, , pz] = entity.position;
  if (nav.target === null || Math.hypot(px - nav.target[0], pz - nav.target[2]) < WANDER_ARRIVAL) {
    const angle = nav.roll() * Math.PI * 2;
    const distance = Math.sqrt(nav.roll()) * nav.radius;
    const tx = nav.origin[0] + Math.cos(angle) * distance;
    const tz = nav.origin[2] + Math.sin(angle) * distance;
    nav.target = [tx, ctx.world.groundHeightAt(tx, tz), tz];
  }
  const speed = entity.movement.walkSpeed ?? DEFAULT_WANDER_SPEED;
  const dx = nav.target[0] - px;
  const dz = nav.target[2] - pz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return;
  const step = Math.min(dist, speed * dt);
  const desired = resolveWalkerStep(ctx, entity.position, (dx / dist) * step, (dz / dist) * step);
  const nx = px + desired.stepX;
  const nz = pz + desired.stepZ;
  // A wanderer pinned against a solid picks a fresh target next tick instead of grinding into it.
  if (Math.hypot(desired.stepX, desired.stepZ) < step * WANDER_BLOCKED_FRACTION) nav.target = null;
  ctx.scene.entity.setPose(id, {
    position: [nx, ctx.world.groundHeightAt(nx, nz), nz],
    rotationY: Math.atan2(dx, dz),
    dt,
  });
}

/**
 * Pose a patroller at its path point, with the *move* to that point slid against solids. The path state
 * still advances on its own clock — the route is authored, and rewinding it on contact would stall the
 * whole patrol behind one prop — but the entity can no longer end a tick inside geometry the player
 * cannot walk through. A route drawn through a building shows up as an NPC pressed against its wall,
 * which is the authoring bug made visible rather than hidden.
 */
function posePatrol(ctx: GameContext, id: string, nav: PatrolNav, dt: number): void {
  const [x, y, z] = nav.state.position;
  const entity = ctx.scene.entity.get(id);
  let px = x;
  let pz = z;
  if (entity !== null) {
    const step = resolveWalkerStep(ctx, entity.position, x - entity.position[0], z - entity.position[2]);
    px = entity.position[0] + step.stepX;
    pz = entity.position[2] + step.stepZ;
  }
  ctx.scene.entity.setPose(id, {
    position: nav.groundClamp ? [px, ctx.world.groundHeightAt(px, pz), pz] : [px, y, pz],
    rotationY: nav.state.heading,
    dt,
  });
}

/**
 * Advance every spawned entity carrying a patrol, wander, pursuit or decision graph behavior one tick — the
 * engine reads the descriptor, keeps the per-entity nav state itself, and poses the entity, so ambient
 * traffic and idle NPC routes are register-once (attach the behavior at spawn) instead of a per-game
 * per-frame `advancePathFollow` + `setPose` loop. Instances that are paused or disabled through
 * {@link behaviorControl} retain their state and are skipped. The shell/host call this each frame; a game never does.
 *
 * @capability behavior-tick auto-advance spawned patrol, wander, pursuit and decision graph behaviors with lifecycle control
 */
export function advanceBehaviors(ctx: GameContext, dt: number): void {
  if (dt <= 0) return;
  const { nav } = runtimeOf(ctx);
  if (nav.size === 0) return;
  let pursuitChanged = false;
  for (const [id, entry] of nav) {
    if (entry.status !== "active") {
      if (entry.status === "paused") {
        entry.pausedElapsed += dt;
        if (entry.kind === "pursue") pursuitChanged = true;
      }
      continue;
    }
    if (entry.kind === "patrol") {
      entry.state = advancePathFollow(entry.config, entry.state, dt);
      posePatrol(ctx, id, entry, dt);
    } else if (entry.kind === "wander") {
      stepWander(ctx, id, entry, dt);
    } else if (entry.kind === "pursue") {
      entry.pending += dt;
      pursuitChanged = true;
      if (!advanceInterestGate(entry.gate, entry.cadence, dt, { proximity: 0 }).active) continue;
      const elapsed = entry.pending;
      entry.pending = 0;
      stepPursue(ctx, id, entry, elapsed);
    } else {
      const entity = ctx.scene.entity.get(id);
      if (entity === null) continue;
      entry.pending += dt;
      const step = advanceInterestGate(entry.gate, entry.cadence, dt, { proximity: 0 });
      if (!step.active) continue;
      const elapsed = entry.pending;
      entry.pending = 0;
      entry.runtime.tick({ ctx, entityId: id, dt: elapsed }, entry.blackboard, elapsed);
    }
  }
  if (pursuitChanged) ctx.touch();
}

/**
 * Obtain the per-context {@link BehaviorControl} surface for suspending, resuming, seeking, serializing,
 * and inspecting behavior instances by entity id — the lifecycle contract games use to hand pose
 * ownership to possession/streaming/staggering code instead of bypassing the behavior runtime.
 *
 * @capability behavior-control pause/disable/resume/seek/inspect behavior instances per entity
 */
export function behaviorControl(ctx: GameContext): BehaviorControl {
  const { nav } = runtimeOf(ctx);
  const setStatus = (id: string, status: BehaviorStatus, reason: string | null): boolean => {
    const entry = nav.get(id);
    if (entry === undefined) return false;
    entry.status = status;
    entry.reason = reason;
    if (entry.kind === "pursue") ctx.touch();
    return true;
  };
  return {
    status: (id) => nav.get(id)?.status ?? null,
    reason: (id) => nav.get(id)?.reason ?? null,
    pause: (id, reason) => {
      const entry = nav.get(id);
      if (entry === undefined || entry.status !== "active") return false;
      entry.status = "paused";
      entry.reason = reason ?? null;
      entry.pausedElapsed = 0;
      if (entry.kind === "pursue") ctx.touch();
      return true;
    },
    resume: (id, policy = "freeze") => {
      const entry = nav.get(id);
      if (entry === undefined || entry.status !== "paused") return false;
      if (policy === "advance" && entry.kind === "patrol" && entry.pausedElapsed > 0) {
        entry.state = advancePathFollow(entry.config, entry.state, entry.pausedElapsed);
        // Emit a single final pose at the caught-up position (no intermediate writes).
        posePatrol(ctx, id, entry, entry.pausedElapsed);
      }
      entry.status = "active";
      entry.reason = null;
      entry.pausedElapsed = 0;
      if (entry.kind === "pursue") ctx.touch();
      return true;
    },
    disable: (id, reason) => setStatus(id, "disabled", reason ?? null),
    enable: (id) => {
      const entry = nav.get(id);
      if (entry === undefined || entry.status !== "disabled") return false;
      entry.status = "active";
      entry.reason = null;
      entry.pausedElapsed = 0;
      if (entry.kind === "pursue") ctx.touch();
      return true;
    },
    seek: (id, progress) => {
      const entry = nav.get(id);
      if (entry === undefined || entry.kind !== "patrol") return false;
      entry.state = pathFollowSeek(entry.config, progress);
      return true;
    },
    serialize: (id) => {
      const entry = nav.get(id);
      if (entry === undefined) return null;
      if (entry.kind === "patrol") return { kind: "patrol", state: { ...entry.state } };
      if (entry.kind === "wander") return { kind: "wander", origin: [...entry.origin], target: entry.target === null ? null : [...entry.target] };
      if (entry.kind === "pursue") return { kind: "pursue", home: [...entry.home], targetId: entry.targetId,
        explicitTargetId: ctx.scene.entity.getTarget(id),
        returning: entry.returning, pursuit: { ...entry.pursuit }, gate: { ...entry.gate }, pending: entry.pending,
        ...(entry.threat === undefined ? {} : { threat: entry.threat.snapshot() }) };
      return { kind: "decisionGraph", graph: entry.runtime.snapshot(), gate: { ...entry.gate }, blackboard: { ...entry.blackboard }, pending: entry.pending };
    },
    restore: (id, snapshot) => {
      const entry = nav.get(id);
      if (entry === undefined || entry.kind !== snapshot.kind) return false;
      if (entry.kind === "patrol" && snapshot.kind === "patrol") {
        entry.state = { ...snapshot.state };
        return true;
      }
      if (entry.kind === "decisionGraph" && snapshot.kind === "decisionGraph") {
        entry.runtime.restore(snapshot.graph);
        entry.gate = { ...snapshot.gate };
        entry.blackboard = { ...(snapshot.blackboard ?? entry.behavior.blackboard ?? {}) };
        entry.pending = snapshot.pending ?? 0;
        return true;
      }
      if (entry.kind === "wander" && snapshot.kind === "wander") {
        entry.origin = [...snapshot.origin];
        entry.target = snapshot.target === null ? null : [...snapshot.target];
        return true;
      }
      if (entry.kind === "pursue" && snapshot.kind === "pursue") {
        if (!validPursueSnapshot(snapshot)) return false;
        restorePursue(entry, snapshot);
        ctx.scene.entity.setTarget(id, snapshot.explicitTargetId);
        ctx.touch();
        return true;
      }
      return false;
    },
    inspect: (id) => {
      const entry = nav.get(id);
      if (entry === undefined) return null;
      return { id, kind: entry.kind, status: entry.status, reason: entry.reason };
    },
    list: () => {
      const out: BehaviorInspection[] = [];
      for (const [id, entry] of nav) out.push({ id, kind: entry.kind, status: entry.status, reason: entry.reason });
      return out;
    },
    blackboard: (id) => {
      const entry = nav.get(id);
      return entry?.kind === "decisionGraph" ? entry.blackboard : null;
    },
    threat: (id) => {
      const entry = nav.get(id);
      if (entry?.kind !== "pursue" || entry.threat === undefined) return null;
      return entry.threatControl ??= notifyAfter(entry.threat, ["add", "set", "taunt", "remove", "clear", "restore", "decay"], ctx.touch);
    },
    reset: (id) => {
      const entry = nav.get(id);
      if (entry?.kind !== "pursue") return false;
      resetPursue(ctx, id, entry);
      ctx.touch();
      return true;
    },
  };
}

interface PursueSaveRecord {
  id: string;
  snapshot: PursueBehaviorSnapshot;
  status: BehaviorStatus;
  reason: string | null;
  pausedElapsed: number;
}

/** @internal Register persistence before boot-time restore without constructing an AI runtime. */
export function installPursuitPersistence(ctx: GameContext, aoiRadius?: number,
  eligible?: NonNullable<GameDefinition["pursuit"]>["eligible"]): void {
  if (eligible !== undefined) pursuitPolicies.set(ctx, eligible);
  ctx.game.registerReplicate?.({
    key: "pursuitBehaviors",
    snapshot() {
      const control = behaviorControl(ctx);
      const instances: PursueSaveRecord[] = [];
      for (const [id, entry] of runtimeOf(ctx).nav) {
        if (entry.kind !== "pursue") continue;
        instances.push({ id, snapshot: control.serialize(id) as PursueBehaviorSnapshot,
          status: entry.status, reason: entry.reason, pausedElapsed: entry.pausedElapsed });
      }
      return { version: 1, instances };
    },
    decode(raw: unknown) {
      if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.instances)) return null;
      const seen = new Set<string>();
      for (const value of raw.instances) {
        if (!object(value) || typeof value.id !== "string" || seen.has(value.id)
          || !validPursueSnapshot(value.snapshot) || !(value.status === "active" || value.status === "paused" || value.status === "disabled")
          || !(value.reason === null || typeof value.reason === "string") || !nonnegative(value.pausedElapsed)
          || !ctx.scene.entity.get(value.id)?.behaviors.some(behavior => behavior.kind === "pursue")) return null;
        seen.add(value.id);
      }
      return structuredClone(raw) as { version: number; instances: PursueSaveRecord[] };
    },
    hydrate(data: { version: number; instances: PursueSaveRecord[] }) {
      const runtime = runtimeOf(ctx);
      for (const record of data.instances) {
        const entry = runtime.nav.get(record.id);
        if (entry?.kind !== "pursue") continue;
        restorePursue(entry, record.snapshot);
        entry.status = record.status;
        entry.reason = record.reason;
        entry.pausedElapsed = record.pausedElapsed;
      }
      for (const record of data.instances) ctx.scene.entity.setTarget(record.id, record.snapshot.explicitTargetId);
      ctx.touch();
    },
    ...(aoiRadius === undefined ? {} : {
      project(data: { version: number; instances: PursueSaveRecord[] }, viewer: import("../runtime/worldSnapshot").SnapshotViewer,
        world: import("../runtime/worldSnapshot").WorldSnapshot) {
        const visible = visibleEntityIds((world.entities ?? []) as readonly SceneEntity[], viewer, aoiRadius);
        return { ...data, instances: data.instances.filter(record => visible.has(record.id)) };
      },
    }),
  });
}
