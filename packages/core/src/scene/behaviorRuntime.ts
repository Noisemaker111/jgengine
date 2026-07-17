import { seededRng } from "../random/rng";
import {
  advancePathFollow,
  createPathFollow,
  pathFollowSeek,
  type PathFollowConfig,
  type PathFollowState,
  type PathProgress,
  type Waypoint,
} from "../nav/pathFollow";
import type { GameContext } from "../runtime/gameContext";
import { perContext } from "../runtime/perContext";

import type { PatrolBehavior, WanderBehavior } from "./behaviors";

const DEFAULT_WANDER_SPEED = 1.5;
const WANDER_ARRIVAL = 0.6;

/** Whether a behavior instance advances and writes pose (`active`), is temporarily suspended retaining
 * state (`paused`), or is held off until re-enabled (`disabled`). */
export type BehaviorStatus = "active" | "paused" | "disabled";

/**
 * Catch-up policy applied when a paused instance resumes. `freeze` (default, deterministic) discards
 * the time spent paused; `advance` silently fast-forwards the instance by the paused duration without
 * emitting intermediate pose writes. Only patrol honors `advance`; wander treats it as `freeze`.
 */
export type BehaviorResumePolicy = "freeze" | "advance";

/** Serializable snapshot of one behavior instance — round-trips exactly through
 * {@link BehaviorControl.serialize}/{@link BehaviorControl.restore}. */
export type BehaviorSnapshot =
  | { readonly kind: "patrol"; readonly state: PathFollowState }
  | { readonly kind: "wander"; readonly origin: Waypoint; readonly target: Waypoint | null };

/** Inspection readout for editor/debug tooling, from {@link BehaviorControl.inspect}/{@link BehaviorControl.list}. */
export interface BehaviorInspection {
  id: string;
  kind: "patrol" | "wander";
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

type Nav = PatrolNav | WanderNav;

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
}

function patrolOf(entity: { behaviors: readonly { kind: string }[] }): PatrolBehavior | null {
  return (entity.behaviors.find((b) => b.kind === "patrol") as PatrolBehavior | undefined) ?? null;
}

function wanderOf(entity: { behaviors: readonly { kind: string }[] }): WanderBehavior | null {
  return (entity.behaviors.find((b) => b.kind === "wander") as WanderBehavior | undefined) ?? null;
}

const runtimeOf = perContext((ctx) => {
  const nav = new Map<string, Nav>();

  const refresh = (): void => {
    const live = new Set<string>();
    for (const entity of ctx.scene.entity.list()) {
      live.add(entity.id);
      if (nav.has(entity.id)) continue;
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
        continue;
      }
      const wander = wanderOf(entity);
      if (wander !== null) {
        nav.set(entity.id, {
          kind: "wander",
          radius: wander.radius,
          origin: entity.position,
          target: null,
          roll: seededRng(`wander:${entity.id}`),
          status: "active",
          reason: null,
          pausedElapsed: 0,
        });
      }
    }
    for (const id of nav.keys()) if (!live.has(id)) nav.delete(id);
  };

  ctx.scene.entity.subscribeMembership(refresh);
  refresh();
  return { nav };
});

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
  const nx = px + (dx / dist) * step;
  const nz = pz + (dz / dist) * step;
  ctx.scene.entity.setPose(id, {
    position: [nx, ctx.world.groundHeightAt(nx, nz), nz],
    rotationY: Math.atan2(dx, dz),
    dt,
  });
}

function posePatrol(ctx: GameContext, id: string, nav: PatrolNav, dt: number): void {
  const [x, y, z] = nav.state.position;
  ctx.scene.entity.setPose(id, {
    position: nav.groundClamp ? [x, ctx.world.groundHeightAt(x, z), z] : [x, y, z],
    rotationY: nav.state.heading,
    dt,
  });
}

/**
 * Advance every spawned entity carrying a `patrol` or `wander` {@link BehaviorDescriptor} one tick — the
 * engine reads the descriptor, keeps the per-entity nav state itself, and poses the entity, so ambient
 * traffic and idle NPC routes are register-once (attach the behavior at spawn) instead of a per-game
 * per-frame `advancePathFollow` + `setPose` loop. Instances that are paused or disabled through
 * {@link behaviorControl} retain their state and are skipped. The shell/host call this each frame; a game never does.
 *
 * @capability behavior-tick auto-advance patrol/wander behaviors on spawned entities, no per-game route loop
 */
export function advanceBehaviors(ctx: GameContext, dt: number): void {
  if (dt <= 0) return;
  const { nav } = runtimeOf(ctx);
  if (nav.size === 0) return;
  for (const [id, entry] of nav) {
    if (entry.status !== "active") {
      if (entry.status === "paused") entry.pausedElapsed += dt;
      continue;
    }
    if (entry.kind === "patrol") {
      entry.state = advancePathFollow(entry.config, entry.state, dt);
      posePatrol(ctx, id, entry, dt);
    } else {
      stepWander(ctx, id, entry, dt);
    }
  }
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
      return true;
    },
    disable: (id, reason) => setStatus(id, "disabled", reason ?? null),
    enable: (id) => {
      const entry = nav.get(id);
      if (entry === undefined || entry.status !== "disabled") return false;
      entry.status = "active";
      entry.reason = null;
      entry.pausedElapsed = 0;
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
      return { kind: "wander", origin: [...entry.origin], target: entry.target === null ? null : [...entry.target] };
    },
    restore: (id, snapshot) => {
      const entry = nav.get(id);
      if (entry === undefined || entry.kind !== snapshot.kind) return false;
      if (entry.kind === "patrol" && snapshot.kind === "patrol") {
        entry.state = { ...snapshot.state };
        return true;
      }
      if (entry.kind === "wander" && snapshot.kind === "wander") {
        entry.origin = [...snapshot.origin];
        entry.target = snapshot.target === null ? null : [...snapshot.target];
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
  };
}
