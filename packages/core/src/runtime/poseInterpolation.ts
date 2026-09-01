import type { EntityStore } from "../scene/entityStore";

/** A render pose sampled between two simulation steps: `[x, y, z, rotationY]`. */
export type RenderPose = [x: number, y: number, z: number, rotationY: number];

/** Serializable previous-step poses keyed by entity id. */
export interface PoseHistoryState {
  previous: Record<string, RenderPose>;
}

/** Previous-step pose buffer: capture at each fixed step, sample between steps for rendering. */
export interface PoseHistory {
  /** Capture every entity's current pose as the "previous" step. Call once at the start of each fixed step. */
  beginStep(entities: EntityStore): void;
  /**
   * Write the pose `alpha` of the way from the previous step to the live pose into `out`. Returns `false` (and
   * leaves `out` untouched) when the entity is unknown; an entity with no history or one that jumped farther
   * than `snapDistance` gets its live pose.
   */
  sample(entities: EntityStore, id: string, alpha: number, out: RenderPose): boolean;
  /** Forget an entity's previous pose so its next frame renders live (respawn, teleport). */
  snap(id: string): void;
  retune(options: { snapDistance?: number }): void;
  snapshot(): PoseHistoryState;
  restore(state: PoseHistoryState): void;
}

const TWO_PI = Math.PI * 2;

/** Shortest-arc interpolation between two yaw angles. */
export function lerpAngle(from: number, to: number, t: number): number {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  else if (delta < -Math.PI) delta += TWO_PI;
  return from + delta * t;
}

/**
 * Previous-step pose buffer for render interpolation under a fixed-step loop. Reuses one 4-slot array per
 * entity so a step over N entities allocates only for entities seen for the first time.
 *
 * @capability pose-interpolation render entity poses between fixed simulation steps without stutter
 */
export function createPoseHistory(options?: { snapDistance?: number }): PoseHistory {
  let snapDistance = options?.snapDistance ?? 8;
  const previous = new Map<string, RenderPose>();
  const seen = new Set<string>();

  return {
    beginStep(entities) {
      seen.clear();
      for (const entity of entities.list()) {
        seen.add(entity.id);
        let slot = previous.get(entity.id);
        if (slot === undefined) {
          slot = [0, 0, 0, 0];
          previous.set(entity.id, slot);
        }
        slot[0] = entity.position[0];
        slot[1] = entity.position[1];
        slot[2] = entity.position[2];
        slot[3] = entity.rotationY;
      }
      if (previous.size !== seen.size) {
        for (const id of previous.keys()) {
          if (!seen.has(id)) previous.delete(id);
        }
      }
    },
    sample(entities, id, alpha, out) {
      const live = entities.get(id);
      if (live === null) return false;
      const prev = previous.get(id);
      const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
      if (prev === undefined || t >= 1) {
        out[0] = live.position[0];
        out[1] = live.position[1];
        out[2] = live.position[2];
        out[3] = live.rotationY;
        return true;
      }
      const dx = live.position[0] - prev[0];
      const dy = live.position[1] - prev[1];
      const dz = live.position[2] - prev[2];
      if (dx * dx + dy * dy + dz * dz > snapDistance * snapDistance) {
        out[0] = live.position[0];
        out[1] = live.position[1];
        out[2] = live.position[2];
        out[3] = live.rotationY;
        return true;
      }
      out[0] = prev[0] + dx * t;
      out[1] = prev[1] + dy * t;
      out[2] = prev[2] + dz * t;
      out[3] = lerpAngle(prev[3], live.rotationY, t);
      return true;
    },
    snap(id) {
      previous.delete(id);
    },
    retune(next) {
      if (next.snapDistance !== undefined) snapDistance = next.snapDistance;
    },
    snapshot() {
      const copy: Record<string, RenderPose> = {};
      for (const [id, pose] of previous) copy[id] = [pose[0], pose[1], pose[2], pose[3]];
      return { previous: copy };
    },
    restore(state) {
      previous.clear();
      for (const [id, pose] of Object.entries(state.previous)) previous.set(id, [pose[0], pose[1], pose[2], pose[3]]);
    },
  };
}
