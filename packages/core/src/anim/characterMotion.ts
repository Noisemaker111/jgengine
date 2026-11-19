import type { ModelIkConfig } from "@jgengine/core/game/playableGame";

export interface CharacterMotionConfig {
  footIk?: boolean;
  glance?: boolean;
  locomotion?: boolean;
}

export interface CharacterMotionParts {
  footIk: boolean;
  glance: boolean;
  locomotion: boolean;
}

export const CHARACTER_MOTION_ON: Readonly<CharacterMotionParts> = { footIk: true, glance: true, locomotion: true };

/** @capability character-motion switch foot IK, glance and locomotion per game, model or entity */
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

/** @internal */
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

export interface CharacterMotionPlan {
  footIk: "auto" | ModelIkConfig | undefined;
  glance: boolean;
  locomotion: "graph" | "idle" | "authored" | "none";
}

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
