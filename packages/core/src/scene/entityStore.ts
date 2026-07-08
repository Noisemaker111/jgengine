import { createObservableKeyedStore } from "../store/observableKeyedStore";
import type { BehaviorDescriptor } from "./behaviors";

export type EntityRole = "player" | "npc" | "prop";

export interface EntityMovement {
  walkSpeed?: number;
  frozen?: boolean;
}

export type EntityPosition = readonly [number, number, number];

export type SpawnPositionInput = EntityPosition | { x: number; y: number; z: number };

export interface SceneEntity<TMeta = undefined> {
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

export interface SpawnOptions<TMeta = undefined> {
  id?: string;
  position?: SpawnPositionInput;
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
  role?: EntityRole;
  movement?: EntityMovement;
  behaviors?: readonly BehaviorDescriptor[];
  meta?: TMeta;
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

export interface EntityStore<TMeta = undefined> {
  spawn(name: string, options?: SpawnOptions<TMeta>): string;
  despawn(id: string): boolean;
  update(
    id: string,
    patch: Partial<
      Pick<
        SceneEntity<TMeta>,
        "name" | "position" | "rotationY" | "rotationX" | "rotationZ" | "role" | "movement" | "behaviors" | "meta"
      >
    >,
  ): boolean;
  setPose(id: string, pose: EntityPose): boolean;
  get(id: string): SceneEntity<TMeta> | null;
  list(): readonly SceneEntity<TMeta>[];
  clear(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): readonly SceneEntity<TMeta>[];
}

export function createEntityStore<TMeta = undefined>(): EntityStore<TMeta> {
  const store = createObservableKeyedStore<SceneEntity<TMeta>>();
  let nextCounter = 1;

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
        throw new Error(`Scene entity id "${options.id}" is already spawned.`);
      }
      const id = options.id ?? generateId();
      store.set(id, {
        id,
        name,
        position: toEntityPosition(options.position),
        rotationY: options.rotationY ?? 0,
        rotationX: options.rotationX ?? 0,
        rotationZ: options.rotationZ ?? 0,
        velocity: [0, 0, 0],
        role: options.role ?? "prop",
        movement: options.movement ?? {},
        behaviors: options.behaviors ?? [],
        meta: options.meta as TMeta,
      });
      return id;
    },
    despawn(id) {
      const existed = store.has(id);
      store.delete(id);
      return existed;
    },
    update(id, patch) {
      const current = store.get(id);
      if (!current) return false;
      store.set(id, { ...current, ...patch });
      return true;
    },
    setPose(id, pose) {
      const current = store.get(id);
      if (!current) return false;
      const position = toEntityPosition(pose.position);
      const velocity =
        pose.dt !== undefined && pose.dt > 0
          ? ([
              (position[0] - current.position[0]) / pose.dt,
              (position[1] - current.position[1]) / pose.dt,
              (position[2] - current.position[2]) / pose.dt,
            ] as EntityPosition)
          : current.velocity;
      store.set(id, {
        ...current,
        position,
        velocity,
        rotationY: pose.rotationY ?? current.rotationY,
        rotationX: pose.rotationX ?? current.rotationX,
        rotationZ: pose.rotationZ ?? current.rotationZ,
      });
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
    },
    subscribe(listener) {
      return store.subscribe(listener);
    },
    snapshot() {
      return store.arraySnapshot();
    },
  };
}
