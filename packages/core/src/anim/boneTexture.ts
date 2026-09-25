/** A clip to bake: its name and length in seconds. */
export interface BoneTextureClipInput {
  name: string;
  duration: number;
}

/** One baked clip's rows in a {@link BoneTextureLayout}. */
export interface BoneTextureClip {
  name: string;
  /** First texture row of the clip. */
  startFrame: number;
  /** Rows baked for the clip, first and last pose included. */
  frameCount: number;
  duration: number;
}

/**
 * Where every bone matrix of every baked frame lives in a vertex-animation texture: one row per
 * frame, four RGBA texels (matrix columns) per bone. Plain data, so a baked crowd can be cached,
 * shipped or checked in a test without a renderer.
 */
export interface BoneTextureLayout {
  boneCount: number;
  fps: number;
  width: number;
  height: number;
  clips: BoneTextureClip[];
}

/** Inputs for {@link planBoneTexture}. */
export interface BoneTextureInput {
  boneCount: number;
  clips: readonly BoneTextureClipInput[];
  /** Baked samples per second. Default 30. */
  fps?: number;
  /** Largest texture side the target GPU accepts. Default 4096. */
  maxTextureSize?: number;
}

/**
 * Plans a bone-matrix texture for a rig's clips. Throws when the rig or the clip set does not fit
 * `maxTextureSize`; lower `fps` or bake fewer clips.
 *
 * @capability animation bake many clips of a rig into one bone-matrix texture for instanced crowds
 */
export function planBoneTexture(input: BoneTextureInput): BoneTextureLayout {
  const fps = input.fps ?? 30;
  const maxSize = input.maxTextureSize ?? 4096;
  if (!(fps > 0)) throw new Error(`planBoneTexture: fps must be positive, got ${fps}`);
  const width = Math.max(1, input.boneCount) * 4;
  if (width > maxSize) throw new Error(`planBoneTexture: ${input.boneCount} bones need ${width} texels per row, over the ${maxSize} limit`);
  const clips: BoneTextureClip[] = [];
  let row = 0;
  for (const clip of input.clips) {
    const duration = Math.max(0, clip.duration);
    const frameCount = Math.max(2, Math.ceil(duration * fps) + 1);
    clips.push({ name: clip.name, startFrame: row, frameCount, duration });
    row += frameCount;
  }
  if (row > maxSize) throw new Error(`planBoneTexture: ${row} frames exceed the ${maxSize}-row limit; lower fps or bake fewer clips`);
  return { boneCount: input.boneCount, fps, width, height: Math.max(1, row), clips };
}

/** Two texture rows around a playback time and the blend between them. */
export interface BoneTextureSample {
  rowA: number;
  rowB: number;
  t: number;
}

/**
 * Finds the baked rows around `time` in a clip, wrapping when `loop` and holding the last pose
 * otherwise. This is the CPU mirror of the crowd shader's lookup.
 *
 * @capability animation look up the baked frames and blend for a crowd member's playback time
 */
export function sampleBoneTexture(clip: BoneTextureClip, fps: number, time: number, loop: boolean, out?: BoneTextureSample): BoneTextureSample {
  const result = out ?? { rowA: 0, rowB: 0, t: 0 };
  const span = clip.frameCount - 1;
  const raw = time * fps;
  const frame = loop ? ((raw % span) + span) % span : Math.min(Math.max(raw, 0), span);
  const a = Math.floor(frame);
  result.rowA = clip.startFrame + a;
  result.rowB = clip.startFrame + Math.min(a + 1, span);
  result.t = frame - a;
  return result;
}
