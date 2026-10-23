import type * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveAnimationConfig } from "@jgengine/core/game/clipRoles";

/** One character the GPU crowd path is drawing instead of its own rig. @internal */
export interface CrowdMember {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  /** Ground speed in metres per second, which picks the crowd's idle/walk/run clip. */
  speed: number;
}

/** Where a batch's merged geometry sits, so picking hits what the batch draws. @internal */
export interface CrowdBatchGeometry {
  geometry: THREE.BufferGeometry;
  /** Placement the batch draws its members with, relative to each member's world pose. */
  position: readonly [number, number, number];
  scale: number;
}

/** Speed at or above which a crowd member walks, and one at which it runs. @internal */
export interface CrowdSpeedBands {
  walk: number;
  run: number;
}

/** Below this ground speed a crowd character idles when its model declares no walk speed. */
const WALK_CLIP_SPEED = 0.25;
const RUN_CLIP_SPEED = 2.6;

/**
 * The identity a character model shares with every other model the GPU crowd can draw: rig url,
 * height normalization and material tint. Two entity kinds with the same key can share one instanced
 * draw; a different tint or height needs its own.
 */
export function crowdKindOf(model: ModelConfig): string {
  return `${model.url}\u0000${model.targetHeight ?? 0}\u0000${model.scale ?? 1}\u0000${JSON.stringify(model.material ?? null)}`;
}

/**
 * Whether a model can leave its own rig for the GPU crowd path: one whose drawn result a batch can
 * reproduce. A rigged, clip-played, plain model qualifies, and so does a model with no animation at
 * all (a static crowd character) — it has no playback to lose. A model that needs per-entity
 * materials, wind, hidden nodes, IK, attachments or a part composition keeps its own rig.
 */
export function crowdEligible(model: ModelConfig | undefined): model is ModelConfig {
  if (model === undefined || model.lod === false) return false;
  if (model.ik !== undefined || model.attachments !== undefined || model.parts !== undefined) return false;
  if (model.partMotion !== undefined) return false;
  if (model.wind !== undefined && model.wind !== false) return false;
  if (model.surfaceDetail === false) return false;
  if ((model.materialAssignments?.length ?? 0) > 0) return false;
  if (model.hiddenNodes !== undefined && !(Array.isArray(model.hiddenNodes) && model.hiddenNodes.length === 0)) return false;
  return true;
}

/**
 * The clips a crowd batch bakes for a model: its resolved idle, walk and run, in that order. Empty
 * when the model plays no clips at all (a static character) or when the rig's clip names do not
 * resolve to locomotion roles, which leaves the character on its own rig instead of drawing a frozen
 * crowd copy.
 */
export function crowdClipsOf(model: ModelConfig, clipNames: readonly string[]): string[] {
  const animation = resolveAnimationConfig(model.animation, clipNames);
  const states = animation?.states;
  const clips: string[] = [];
  for (const name of [states?.idle, states?.walk, states?.run]) {
    if (typeof name === "string" && name.length > 0 && clipNames.includes(name) && !clips.includes(name)) clips.push(name);
  }
  return clips;
}

/**
 * The ground speeds the model's own locomotion graph switches clips at, so a batched character walks
 * and idles at the same speed its own rig would. A model that declares none keeps the engine's
 * defaults.
 */
export function crowdSpeedBandsOf(model: ModelConfig, clipNames: readonly string[]): CrowdSpeedBands {
  const states = resolveAnimationConfig(model.animation, clipNames)?.states;
  const band = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
  const walk = band(states?.walkSpeed, WALK_CLIP_SPEED);
  return { walk, run: Math.max(band(states?.runSpeed, RUN_CLIP_SPEED), walk) };
}

/**
 * The baked clip a crowd member at `speed` plays; clips are `[idle, walk, run]` as {@link crowdClipsOf}
 * orders them. `bands` is the model's own walk/run speed.
 */
export function crowdClipForSpeed(clips: readonly string[], speed: number, bands?: CrowdSpeedBands): string | undefined {
  if (clips.length === 0) return undefined;
  const walk = bands?.walk ?? WALK_CLIP_SPEED;
  const run = bands?.run ?? RUN_CLIP_SPEED;
  if (speed >= run) return clips[2] ?? clips[1] ?? clips[0];
  if (speed >= walk) return clips[1] ?? clips[0];
  return clips[0];
}

/** Kind keys whose crowd batch has a baked rig and can draw; a character stays on its own rig until then. @internal */
const readyKinds = new Set<string>();

/** Mark a crowd batch drawable, so markers may hand it characters. @internal */
export function setCrowdKindReady(kind: string, ready: boolean): void {
  if (ready) readyKinds.add(kind);
  else readyKinds.delete(kind);
}

/** Whether a character kind has a crowd batch that can draw it. @internal */
export function crowdKindReady(kind: string): boolean {
  return readyKinds.has(kind);
}

/**
 * The characters the crowd layer is currently drawing, written by their entity markers each frame.
 * It holds poses rather than React state: 71 pedestrians writing matrices must not re-render the
 * world, and the crowd batch reads the same entries back to fill its instance buffers.
 *
 * A marker asks {@link claim} for a slot; the batch declares how many it can draw, so a full batch
 * leaves the rest of its kind on their own rigs. The registry keeps drawn ids in claim order, which
 * is the instance order the batch writes, so a character leaving compacts the rest instead of
 * leaving a stale matrix behind.
 */
export class CharacterCrowdRegistry {
  private readonly members = new Map<string, { kind: string; member: CrowdMember }>();
  private readonly capacities = new Map<string, number>();
  private readonly geometries = new Map<string, CrowdBatchGeometry>();

  /** Declare how many characters one kind's batch can draw; `undefined` clears the batch. */
  setCapacity(kind: string, capacity: number | undefined): void {
    if (capacity === undefined) this.capacities.delete(kind);
    else this.capacities.set(kind, Math.max(0, Math.floor(capacity)));
  }

  /** How many characters one kind's batch can draw; zero until its batch mounts. */
  capacity(kind: string): number {
    return this.capacities.get(kind) ?? 0;
  }

  /** Record the geometry and placement a batch draws its kind with, for picking. */
  setGeometry(kind: string, geometry: CrowdBatchGeometry | undefined): void {
    if (geometry === undefined) this.geometries.delete(kind);
    else this.geometries.set(kind, geometry);
  }

  /** The drawn geometry of one kind, once its batch is ready. */
  geometry(kind: string): CrowdBatchGeometry | undefined {
    return this.geometries.get(kind);
  }

  /**
   * Hand a character to the batch. Returns false when the batch is full, and the caller then keeps
   * that character on its own rig. An existing member always updates.
   */
  claim(id: string, kind: string, member: CrowdMember): boolean {
    const existing = this.members.get(id);
    if (existing !== undefined && existing.kind === kind) {
      Object.assign(existing.member, member);
      return true;
    }
    if (existing === undefined && this.count(kind) >= this.capacity(kind)) return false;
    if (existing !== undefined) this.members.delete(id);
    this.members.set(id, { kind, member: { ...member } });
    return true;
  }

  /** Record the pose an entity is showing as a crowd instance this frame. */
  set(id: string, kind: string, member: CrowdMember): void {
    const existing = this.members.get(id);
    if (existing !== undefined && existing.kind === kind) {
      Object.assign(existing.member, member);
      return;
    }
    this.members.set(id, { kind, member: { ...member } });
  }

  /** The entity went back to its own rig, or unmounted. */
  delete(id: string): void {
    this.members.delete(id);
  }

  /** The kind this character is batched as, or `undefined` when it draws its own rig. */
  kindOf(id: string): string | undefined {
    return this.members.get(id)?.kind;
  }

  /** How many characters this kind is drawing; zero means the batch can skip its work. */
  count(kind: string): number {
    let count = 0;
    for (const entry of this.members.values()) if (entry.kind === kind) count += 1;
    return count;
  }

  /** Visit every character of one kind, in insertion order. */
  forEach(kind: string, visit: (id: string, member: CrowdMember) => void): void {
    for (const [id, entry] of this.members) if (entry.kind === kind) visit(id, entry.member);
  }

  /** Drop every entry; called when the crowd layer unmounts. */
  clear(): void {
    this.members.clear();
    this.geometries.clear();
  }
}
