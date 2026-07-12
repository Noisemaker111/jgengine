import { createObservableKeyedStore } from "../store/observableKeyedStore";
import type { BehaviorDescriptor } from "./behaviors";

export type EntityRole = "player" | "npc" | "prop";

export interface EntityMovement {
  walkSpeed?: number;
  frozen?: boolean;
}

export type EntityPosition = readonly [number, number, number];

export type SpawnPositionInput = EntityPosition | { x: number; y: number; z: number };

export interface SceneEntity<TMeta = unknown> {
  id: string;
  name: string;
  position: EntityPosition;
  rotationY: number;
  rotationX: number;
  rotationZ: number;
  /** World units per second, derived from consecutive setPose calls that carry `dt`. Zero until the entity moves under a dt. */
  velocity: EntityPosition;
  role: EntityRole;
  movement: EntityMovement;
  behaviors: readonly BehaviorDescriptor[];
  /** Game-defined per-instance data set at `spawn`/`update` and carried to `renderEntity`/queries — narrow with a cast or type guard on read (#286.1); never encode state in the id/name string. */
  meta: TMeta;
}

/** Ground speed (horizontal magnitude of velocity) in world units per second. Scale to km/h or mph in game code. */
export function groundSpeed(entity: SceneEntity<unknown>): number {
  return Math.hypot(entity.velocity[0], entity.velocity[2]);
}

const DEFAULT_FROZEN_MOVE_THRESHOLD = 1e-6;

export function movedWhileFrozen(entity: SceneEntity<unknown>, threshold = DEFAULT_FROZEN_MOVE_THRESHOLD): boolean {
  if (entity.movement.frozen !== true) return false;
  const speed = Math.hypot(entity.velocity[0], entity.velocity[1], entity.velocity[2]);
  return speed > threshold;
}

export interface SpawnOptions<TMeta = unknown> {
  id?: string;
  position?: SpawnPositionInput;
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
  role?: EntityRole;
  movement?: EntityMovement;
  behaviors?: readonly BehaviorDescriptor[];
  meta?: TMeta;
  /** When `id` is already spawned: `"throw"` (default), `"replace"` (fresh spawn over it — remount-safe world setup, #284.10), or `"keep"` (leave it untouched and return the id). */
  onExisting?: "throw" | "replace" | "keep";
}

function toEntityPosition(position: SpawnPositionInput | undefined): EntityPosition {
  if (position === undefined) return [0, 0, 0];
  if ("x" in position) return [position.x, position.y, position.z];
  return position;
}

export interface EntityPose {
  position: SpawnPositionInput;
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
  /** Seconds since the previous pose; when > 0 the store derives `velocity` from the position delta. Omit for teleports (velocity unchanged). */
  dt?: number;
}

export interface SpawnPose {
  position: EntityPosition;
  rotationY: number;
}

export interface PoseConstraintFrame {
  entityId: string;
  current: EntityPosition;
  next: EntityPosition;
  dt?: number;
}

/** Return a replacement position to constrain the step, or nothing to accept it. */
export type PoseConstraint = (frame: PoseConstraintFrame) => readonly [number, number, number] | undefined | void;

export type EntityUpdatePatch<TMeta = unknown> = Partial<
  Pick<SceneEntity<TMeta>, "name" | "rotationY" | "rotationX" | "rotationZ" | "role" | "movement" | "behaviors" | "meta">
> & {
  /** Accepts the same friendly shapes as `spawn`/`setPose` (#286.13). Raw patch semantics — velocity is not derived; use `setPose` with `dt` for that. */
  position?: SpawnPositionInput;
};

/**
 * Per-entity scratch and cooldown timers, auto-cleared on despawn (#533.8) — the home for AI state
 * (next-shot-at, alert level) that would otherwise be smuggled through the serializable `meta` or a
 * hand-pruned module-level map. Keys share one namespace per entity: `arm`/`ready`/`remaining` store a
 * deadline under a key, `get`/`set` store arbitrary scratch.
 */
export interface EntityBlackboard {
  /** Read a scratch value; `undefined` if unset or the entity has despawned. */
  get<T>(id: string, key: string): T | undefined;
  /** Write a scratch value; does not notify subscribers, and clears when the entity despawns. */
  set(id: string, key: string, value: unknown): void;
  has(id: string, key: string): boolean;
  delete(id: string, key: string): void;
  /** Drop all scratch and timers for one entity. */
  clear(id: string): void;
  /** Arm a cooldown for `key` that stays busy until absolute time `untilMs`. */
  arm(id: string, key: string, untilMs: number): void;
  /** True when no cooldown is armed for `key`, or its deadline has passed. */
  ready(id: string, key: string, nowMs: number): boolean;
  /** Milliseconds until the armed cooldown elapses; 0 when ready. */
  remaining(id: string, key: string, nowMs: number): number;
}

export interface EntityStore<TMeta = unknown> {
  spawn(name: string, options?: SpawnOptions<TMeta>): string;
  despawn(id: string): boolean;
  update(id: string, patch: EntityUpdatePatch<TMeta>): boolean;
  setPose(id: string, pose: EntityPose): boolean;
  /** Register a constraint applied inside every `setPose` for this entity — the self-driven sibling of the shell's `beforeCommit` (#282.9): nav clamps, corridor walls, arena bounds without wrapping every call site. `null` clears; despawn clears automatically. */
  setPoseConstraint(id: string, constraint: PoseConstraint | null): void;
  get(id: string): SceneEntity<TMeta> | null;
  list(): readonly SceneEntity<TMeta>[];
  clear(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): readonly SceneEntity<TMeta>[];
  /**
   * Apply a `snapshot()` (e.g. from an authoritative host) to this store — the counterpart of `snapshot()`
   * for host→client world mirroring: spawns entities present in the snapshot but not here, overwrites
   * existing ones field-for-field (including velocity), and despawns any local entity absent from it.
   */
  hydrate(entities: readonly SceneEntity<TMeta>[]): void;
  spawnPoseOf(id: string): SpawnPose | null;
  resetToSpawn(id: string): boolean;
  blackboard: EntityBlackboard;
}

export function createEntityStore<TMeta = unknown>(): EntityStore<TMeta> {
  const store = createObservableKeyedStore<SceneEntity<TMeta>>();
  const spawnPoses = new Map<string, SpawnPose>();
  const constraints = new Map<string, PoseConstraint>();
  const blackboards = new Map<string, Map<string, unknown>>();
  let nextCounter = 1;

  const blackboard: EntityBlackboard = {
    get: <T>(id: string, key: string): T | undefined => blackboards.get(id)?.get(key) as T | undefined,
    set(id, key, value) {
      const board = blackboards.get(id) ?? new Map<string, unknown>();
      board.set(key, value);
      blackboards.set(id, board);
    },
    has: (id, key) => blackboards.get(id)?.has(key) ?? false,
    delete(id, key) {
      blackboards.get(id)?.delete(key);
    },
    clear(id) {
      blackboards.delete(id);
    },
    arm(id, key, untilMs) {
      this.set(id, key, untilMs);
    },
    ready(id, key, nowMs) {
      const until = blackboards.get(id)?.get(key);
      return typeof until !== "number" || nowMs >= until;
    },
    remaining(id, key, nowMs) {
      const until = blackboards.get(id)?.get(key);
      return typeof until === "number" ? Math.max(0, until - nowMs) : 0;
    },
  };

  function generateId(): string {
    let id = `entity-${nextCounter}`;
    while (store.has(id)) {
      nextCounter += 1;
      id = `entity-${nextCounter}`;
    }
    nextCounter += 1;
    return id;
  }

  return {
    spawn(name, options = {}) {
      if (options.id !== undefined && store.has(options.id)) {
        const onExisting = options.onExisting ?? "throw";
        if (onExisting === "keep") return options.id;
        if (onExisting === "throw") throw new Error(`Scene entity id "${options.id}" is already spawned.`);
        blackboards.delete(options.id);
      }
      const id = options.id ?? generateId();
      const position = toEntityPosition(options.position);
      const rotationY = options.rotationY ?? 0;
      store.set(id, {
        id,
        name,
        position,
        rotationY,
        rotationX: options.rotationX ?? 0,
        rotationZ: options.rotationZ ?? 0,
        velocity: [0, 0, 0],
        role: options.role ?? "prop",
        movement: options.movement ?? {},
        behaviors: options.behaviors ?? [],
        meta: options.meta as TMeta,
      });
      spawnPoses.set(id, { position, rotationY });
      return id;
    },
    despawn(id) {
      const existed = store.has(id);
      store.delete(id);
      spawnPoses.delete(id);
      constraints.delete(id);
      blackboards.delete(id);
      return existed;
    },
    update(id, patch) {
      const current = store.get(id);
      if (!current) return false;
      if (patch.position !== undefined) current.position = toEntityPosition(patch.position);
      if (patch.name !== undefined) current.name = patch.name;
      if (patch.rotationY !== undefined) current.rotationY = patch.rotationY;
      if (patch.rotationX !== undefined) current.rotationX = patch.rotationX;
      if (patch.rotationZ !== undefined) current.rotationZ = patch.rotationZ;
      if (patch.role !== undefined) current.role = patch.role;
      if (patch.movement !== undefined) current.movement = patch.movement;
      if (patch.behaviors !== undefined) current.behaviors = patch.behaviors;
      if (patch.meta !== undefined) current.meta = patch.meta;
      store.set(id, current);
      return true;
    },
    setPoseConstraint(id, constraint) {
      if (constraint === null) constraints.delete(id);
      else constraints.set(id, constraint);
    },
    setPose(id, pose) {
      const current = store.get(id);
      if (!current) return false;
      let position = toEntityPosition(pose.position);
      const constraint = constraints.get(id);
      if (constraint !== undefined) {
        const frame: PoseConstraintFrame = {
          entityId: id,
          current: current.position,
          next: position,
          ...(pose.dt === undefined ? {} : { dt: pose.dt }),
        };
        const replacement = constraint(frame);
        if (replacement !== undefined) position = toEntityPosition(replacement);
      }
      const velocity =
        pose.dt !== undefined && pose.dt > 0
          ? ([
              (position[0] - current.position[0]) / pose.dt,
              (position[1] - current.position[1]) / pose.dt,
              (position[2] - current.position[2]) / pose.dt,
            ] as EntityPosition)
          : current.velocity;
      current.position = position;
      current.velocity = velocity;
      if (pose.rotationY !== undefined) current.rotationY = pose.rotationY;
      if (pose.rotationX !== undefined) current.rotationX = pose.rotationX;
      if (pose.rotationZ !== undefined) current.rotationZ = pose.rotationZ;
      store.set(id, current);
      return true;
    },
    get(id) {
      return store.get(id) ?? null;
    },
    list() {
      return store.arraySnapshot();
    },
    clear() {
      for (const entity of store.arraySnapshot()) {
        store.delete(entity.id);
      }
      constraints.clear();
      blackboards.clear();
    },
    subscribe(listener) {
      return store.subscribe(listener);
    },
    snapshot() {
      return store.arraySnapshot();
    },
    hydrate(entities) {
      const incoming = new Set(entities.map((entity) => entity.id));
      for (const current of store.arraySnapshot()) {
        if (!incoming.has(current.id)) {
          store.delete(current.id);
          spawnPoses.delete(current.id);
          constraints.delete(current.id);
          blackboards.delete(current.id);
        }
      }
      for (const entity of entities) {
        store.set(entity.id, {
          id: entity.id,
          name: entity.name,
          position: entity.position,
          rotationY: entity.rotationY,
          rotationX: entity.rotationX,
          rotationZ: entity.rotationZ,
          velocity: entity.velocity,
          role: entity.role,
          movement: entity.movement,
          behaviors: entity.behaviors,
          meta: entity.meta,
        });
        if (!spawnPoses.has(entity.id)) {
          spawnPoses.set(entity.id, { position: entity.position, rotationY: entity.rotationY });
        }
      }
    },
    spawnPoseOf(id) {
      return spawnPoses.get(id) ?? null;
    },
    resetToSpawn(id) {
      const pose = spawnPoses.get(id);
      const current = store.get(id);
      if (pose === undefined || current === undefined) return false;
      current.position = pose.position;
      current.rotationY = pose.rotationY;
      current.velocity = [0, 0, 0];
      store.set(id, current);
      return true;
    },
    blackboard,
  };
}
