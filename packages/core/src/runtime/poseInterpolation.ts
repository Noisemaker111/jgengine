import type { EntityColumns, EntityStore } from "../scene/entityStore";

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
 * Previous-step pose buffer for render interpolation under a fixed-step loop. Reads poses straight from the
 * store's {@link EntityStore.columns} into one flat array indexed by handle, so a step over N entities
 * allocates nothing and does no id lookups. Each captured pose remembers its handle's generation: a handle
 * reused by a new entity, or a body respawned under the same id, renders live until the next step.
 *
 * @capability pose-interpolation render entity poses between fixed simulation steps without stutter
 */
export function createPoseHistory(options?: { snapDistance?: number }): PoseHistory {
  let snapDistance = options?.snapDistance ?? 8;
  let bound: EntityColumns | null = null;
  // x, y, z, rotationY per handle, and the generation each was captured at (0: none).
  let poses = new Float64Array(64);
  let capturedAt = new Uint32Array(16);
  // A restored snapshot stands in for captured poses until the next step captures real ones.
  let restored: Map<string, RenderPose> | null = null;

  function bind(columns: EntityColumns): void {
    if (bound === columns) return;
    bound = columns;
    capturedAt.fill(0);
  }

  function writeLive(columns: EntityColumns, handle: number, out: RenderPose): void {
    const position = columns.positions();
    out[0] = position[handle * 3]!;
    out[1] = position[handle * 3 + 1]!;
    out[2] = position[handle * 3 + 2]!;
    out[3] = columns.rotations()[handle * 3 + 1]!;
  }

  return {
    beginStep(entities) {
      const columns = entities.columns;
      bind(columns);
      restored = null;
      const span = columns.span();
      if (capturedAt.length < span) {
        let size = capturedAt.length;
        while (size < span) size *= 2;
        const nextPoses = new Float64Array(size * 4);
        nextPoses.set(poses);
        poses = nextPoses;
        const nextCaptured = new Uint32Array(size);
        nextCaptured.set(capturedAt);
        capturedAt = nextCaptured;
      }
      const position = columns.positions();
      const rotation = columns.rotations();
      for (let handle = 0; handle < span; handle += 1) {
        if (!columns.isLive(handle)) continue;
        const from = handle * 3;
        const to = handle * 4;
        poses[to] = position[from]!;
        poses[to + 1] = position[from + 1]!;
        poses[to + 2] = position[from + 2]!;
        poses[to + 3] = rotation[from + 1]!;
        capturedAt[handle] = columns.generationOf(handle);
      }
    },
    sample(entities, id, alpha, out) {
      const columns = entities.columns;
      const handle = columns.handleOf(id);
      if (handle < 0) return false;
      const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
      let px: number, py: number, pz: number, pr: number;
      if (restored !== null) {
        const prev = restored.get(id);
        if (prev === undefined || t >= 1) {
          writeLive(columns, handle, out);
          return true;
        }
        [px, py, pz, pr] = prev;
      } else {
        if (bound !== columns || t >= 1 || capturedAt[handle] !== columns.generationOf(handle)) {
          writeLive(columns, handle, out);
          return true;
        }
        const at = handle * 4;
        px = poses[at]!;
        py = poses[at + 1]!;
        pz = poses[at + 2]!;
        pr = poses[at + 3]!;
      }
      const position = columns.positions();
      const base = handle * 3;
      const lx = position[base]!, ly = position[base + 1]!, lz = position[base + 2]!;
      const ry = columns.rotations()[base + 1]!;
      const dx = lx - px;
      const dy = ly - py;
      const dz = lz - pz;
      if (dx * dx + dy * dy + dz * dz > snapDistance * snapDistance) {
        out[0] = lx;
        out[1] = ly;
        out[2] = lz;
        out[3] = ry;
        return true;
      }
      out[0] = px + dx * t;
      out[1] = py + dy * t;
      out[2] = pz + dz * t;
      out[3] = lerpAngle(pr, ry, t);
      return true;
    },
    snap(id) {
      restored?.delete(id);
      const handle = bound?.handleOf(id) ?? -1;
      if (handle >= 0) capturedAt[handle] = 0;
    },
    retune(next) {
      if (next.snapDistance !== undefined) snapDistance = next.snapDistance;
    },
    snapshot() {
      const copy: Record<string, RenderPose> = {};
      if (restored !== null) {
        for (const [id, pose] of restored) copy[id] = [pose[0], pose[1], pose[2], pose[3]];
        return { previous: copy };
      }
      if (bound === null) return { previous: copy };
      for (let handle = 0, span = Math.min(bound.span(), capturedAt.length); handle < span; handle += 1) {
        if (!bound.isLive(handle) || capturedAt[handle] !== bound.generationOf(handle)) continue;
        const at = handle * 4;
        copy[bound.idOf(handle)!] = [poses[at]!, poses[at + 1]!, poses[at + 2]!, poses[at + 3]!];
      }
      return { previous: copy };
    },
    restore(state) {
      capturedAt.fill(0);
      restored = new Map();
      for (const [id, pose] of Object.entries(state.previous)) restored.set(id, [pose[0], pose[1], pose[2], pose[3]]);
    },
  };
}
