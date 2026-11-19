import type { AnimClipOutput, AnimGraph } from "@jgengine/core/anim/animGraph";
import { classifyClip, type ClipRole } from "@jgengine/core/game/clipRoles";
import type { ModelAnimationConfig } from "@jgengine/core/game/playableGame";

/** @internal */

export interface ClipSourceRef {
  readonly clips?: readonly string[];
}

/** One previewable clip with its detected semantic role (null when unclassified). */
export interface ClipEntry {
  readonly name: string;
  readonly role: ClipRole | null;
}

export function clipEntriesFromRef(ref: ClipSourceRef | null | undefined): ClipEntry[] {
  const clips = ref?.clips;
  if (clips === undefined || clips.length === 0) return [];
  return clips.map((name) => ({ name, role: classifyClip(name) }));
}

/** A rigged asset resolved for viewport preview: its catalog id, label, GLB url, and clip names. */
export interface ClipPreviewSource {
  readonly assetId: string;
  readonly label: string;
  readonly url: string;
  readonly clips: readonly string[];
}

/**
 * The live clip-preview session shared across panels via the editor UI store: which asset is being
 * previewed, the playback driver, and the selected clip's measured duration (published by the
 * viewport layer once its GLB loads; 0 while unknown).
 */
export interface ClipPreviewSession {
  readonly source: ClipPreviewSource;
  readonly driver: ClipPreviewState;
  readonly duration: number;
  /** Every clip's duration, published by the viewport layer once the GLB loads. */
  readonly clipDurations?: Readonly<Record<string, number>>;
  /** When set, the viewport poses the rig from this graph output instead of playing `driver`'s clip. */
  readonly graphPose?: { readonly graph: AnimGraph; readonly clips: readonly AnimClipOutput[]; readonly rootMotion?: true } | undefined;
}

/** Playback state of the clip preview driver. `time` is seconds into the clip. */
export interface ClipPreviewState {
  /** Clip currently loaded into the preview, or null when nothing is selected. */
  clipName: string | null;
  playing: boolean;
  loop: boolean;
  /** Playback rate multiplier; clamped to a sane preview range. */
  speed: number;
  /** Playhead position in seconds. Meaningful while paused/scrubbing. */
  time: number;
}

export const MIN_PREVIEW_SPEED = 0.1;
export const MAX_PREVIEW_SPEED = 4;

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.max(MIN_PREVIEW_SPEED, Math.min(MAX_PREVIEW_SPEED, speed));
}

export function initialClipPreviewState(clipName: string | null = null): ClipPreviewState {
  return { clipName, playing: clipName !== null, loop: true, speed: 1, time: 0 };
}

export function selectPreviewClip(state: ClipPreviewState, clipName: string): ClipPreviewState {
  return { ...state, clipName, time: 0, playing: true };
}

export function setPreviewPlaying(state: ClipPreviewState, playing: boolean): ClipPreviewState {
  if (state.clipName === null) return { ...state, playing: false };
  return { ...state, playing };
}

export function togglePreviewPlaying(state: ClipPreviewState): ClipPreviewState {
  return setPreviewPlaying(state, !state.playing);
}

export function setPreviewLoop(state: ClipPreviewState, loop: boolean): ClipPreviewState {
  return { ...state, loop };
}

/** Sets the preview playback rate, clamped to [MIN_PREVIEW_SPEED, MAX_PREVIEW_SPEED]. */
export function setPreviewSpeed(state: ClipPreviewState, speed: number): ClipPreviewState {
  return { ...state, speed: clampSpeed(speed) };
}

/** Scrub to an absolute time (seconds). Pauses playback, matching the path-flythrough scrubber. */
export function scrubPreview(state: ClipPreviewState, time: number): ClipPreviewState {
  const next = Number.isFinite(time) ? Math.max(0, time) : 0;
  return { ...state, time: next, playing: false };
}

/**
 * Advances the playhead by `dt` seconds at the current speed, wrapping when looping and clamping
 * (then stopping) at `duration` otherwise. No-op while paused, clip-less, or the duration is
 * unknown (<= 0). Uses the same time += speed·dt formula the shell mixer runs, so a panel that ticks
 * this in lockstep with the freerunning viewport mixer stays in sync.
 */
export function advancePreview(state: ClipPreviewState, dt: number, duration: number): ClipPreviewState {
  if (!state.playing || state.clipName === null || duration <= 0 || !Number.isFinite(dt) || dt <= 0) {
    return state;
  }
  let next = state.time + state.speed * dt;
  if (next >= duration) {
    if (state.loop) next %= duration;
    else return { ...state, time: duration, playing: false };
  }
  return { ...state, time: next };
}

/**
 * The `ModelConfig.animation` config the preview layer feeds to `useModelAnimation`. Playing yields
 * a freerunning single-clip config (mixer owns the clock, no per-frame churn); paused yields a held
 * `paused`+`time` pose so a scrub renders the exact frame. Returns undefined with no clip (bind pose).
 */
export function previewAnimationConfig(state: ClipPreviewState): ModelAnimationConfig | undefined {
  if (state.clipName === null) return undefined;
  const base: ModelAnimationConfig = { clip: state.clipName, loop: state.loop, timeScale: state.speed };
  return state.playing ? base : { ...base, paused: true, time: state.time };
}
