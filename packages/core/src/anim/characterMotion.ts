import type { ModelIkConfig } from "@jgengine/core/game/playableGame";

/**
 * The engine's default character motion, one switch per part. Any part left unset stays on.
 * `footIk` plants feet on slopes and steps, `glance` turns the head and eyes toward points of
 * interest, `locomotion` drives idle, walk, run and turn-in-place from the entity's velocity
 * (off, the rig holds its idle clip).
 */
export interface CharacterMotionConfig {
  footIk?: boolean;
  glance?: boolean;
  locomotion?: boolean;
}

/** {@link CharacterMotionConfig} with every part decided. */
export interface CharacterMotionParts {
  footIk: boolean;
  glance: boolean;
  locomotion: boolean;
}

/** Every part on: what a rigged entity gets when nothing switches a part off. */
export const CHARACTER_MOTION_ON: Readonly<CharacterMotionParts> = { footIk: true, glance: true, locomotion: true };

/**
 * Resolve the parts from layers, most general first (game, then model, then entity): a later layer
 * wins for each part it names, and `false` turns every part off at that layer.
 * @capability character-motion switch foot IK, glance and locomotion per game, model or entity
 */
export function resolveCharacterMotion(...layers: readonly (CharacterMotionConfig | false | undefined)[]): CharacterMotionParts {
  const motion: CharacterMotionParts = { ...CHARACTER_MOTION_ON };
  for (const layer of layers) {
    if (layer === undefined) continue;
    if (layer === false) {
      motion.footIk = false;
      motion.glance = false;
      motion.locomotion = false;
      continue;
    }
    if (layer.footIk !== undefined) motion.footIk = layer.footIk;
    if (layer.glance !== undefined) motion.glance = layer.glance;
    if (layer.locomotion !== undefined) motion.locomotion = layer.locomotion;
  }
  return motion;
}

/** A short stable key for a layer, so a view can re-render only when it changes. @internal */
export function characterMotionKey(layer: CharacterMotionConfig | false | undefined): string {
  if (layer === undefined) return "";
  if (layer === false) return "off";
  const bit = (value: boolean | undefined) => (value === undefined ? "-" : value ? "1" : "0");
  return `${bit(layer.footIk)}${bit(layer.glance)}${bit(layer.locomotion)}`;
}

/** The layer {@link characterMotionKey} wrote. @internal */
export function characterMotionFromKey(key: string): CharacterMotionConfig | false | undefined {
  if (key === "") return undefined;
  if (key === "off") return false;
  const part = (char: string | undefined) => (char === "1" ? true : char === "0" ? false : undefined);
  const config: CharacterMotionConfig = {};
  const footIk = part(key[0]);
  const glance = part(key[1]);
  const locomotion = part(key[2]);
  if (footIk !== undefined) config.footIk = footIk;
  if (glance !== undefined) config.glance = glance;
  if (locomotion !== undefined) config.locomotion = locomotion;
  return config;
}

/** What one model runs of the default character motion this frame. */
export interface CharacterMotionPlan {
  /** The foot IK rig to solve, or undefined for none. */
  footIk: "auto" | ModelIkConfig | undefined;
  glance: boolean;
  /** `"graph"` drives idle/walk/run/turn from velocity, `"idle"` holds the idle clip, `"authored"` plays the model's own `animation`, `"none"` the bind pose. */
  locomotion: "graph" | "idle" | "authored" | "none";
}

/**
 * Decide the default motion for one model. A live rigged entity whose model leaves `ik` unset gets
 * foot IK and the glance (not on the low tier, not after death); one that leaves `animation` unset
 * gets the velocity-driven locomotion graph. Each part follows its `motion` switch; `ik: "none"`
 * turns IK and glance off, and an authored `ik` or `animation` is played as authored.
 */
export function planCharacterMotion(input: {
  live: boolean;
  lowTier: boolean;
  dead: boolean;
  ik: "auto" | "none" | ModelIkConfig | undefined;
  authoredAnimation: boolean;
  motion: CharacterMotionParts;
}): CharacterMotionPlan {
  const engine = input.live && !input.lowTier && !input.dead && input.ik === undefined;
  const footIk = !input.motion.footIk ? undefined : engine ? "auto" : input.ik === "none" ? undefined : input.ik;
  const locomotion = input.authoredAnimation ? "authored" : !input.live ? "none" : input.motion.locomotion ? "graph" : "idle";
  return { footIk, glance: engine && input.motion.glance, locomotion };
}
