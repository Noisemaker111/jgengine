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

/** Below this ground speed a crowd character idles; a walk until the run speed. */
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

/** Whether a model can leave its own rig for the GPU crowd path: a rigged, clip-played, plain model. */
export function crowdEligible(model: ModelConfig | undefined): model is ModelConfig {
  if (model === undefined || model.lod === false) return false;
  if (model.ik !== undefined || model.attachments !== undefined || model.parts !== undefined) return false;
  return model.animation !== undefined && model.animation !== "none";
}

/**
 * The clips a crowd batch bakes for a model: its resolved idle, walk and run, in that order. Empty
 * when the rig's clip names do not resolve to locomotion roles, which leaves the character on its own
 * rig instead of drawing a frozen crowd copy.
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

/** The baked clip a crowd member at `speed` plays; clips are `[idle, walk, run]` as {@link crowdClipsOf} orders them. */
export function crowdClipForSpeed(clips: readonly string[], speed: number): string | undefined {
  if (clips.length === 0) return undefined;
  if (speed >= RUN_CLIP_SPEED) return clips[2] ?? clips[1] ?? clips[0];
  if (speed >= WALK_CLIP_SPEED) return clips[1] ?? clips[0];
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
 */
export class CharacterCrowdRegistry {
  private readonly members = new Map<string, { kind: string; member: CrowdMember }>();

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
  }
}

