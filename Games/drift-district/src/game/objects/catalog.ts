import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";

export const BARRIER_OBJECT = "prop_barrier";
export const CHECKPOINT_ARCH_OBJECT = "prop_checkpoint_arch";
export const GLOW_STRIP_OBJECT: Record<string, string> = {
  harbor: "prop_glow_harbor",
  downtown: "prop_glow_downtown",
  heights: "prop_glow_heights",
};
export const DISTRICT_SIGN_OBJECT: Record<string, string> = {
  harbor: "prop_sign_harbor",
  downtown: "prop_sign_downtown",
  heights: "prop_sign_heights",
};

export const OBJECT_CATALOG: Record<string, GameContextObjectEntry> = {
  [BARRIER_OBJECT]: {},
  [CHECKPOINT_ARCH_OBJECT]: {},
  [GLOW_STRIP_OBJECT.harbor!]: {},
  [GLOW_STRIP_OBJECT.downtown!]: {},
  [GLOW_STRIP_OBJECT.heights!]: {},
  [DISTRICT_SIGN_OBJECT.harbor!]: {},
  [DISTRICT_SIGN_OBJECT.downtown!]: {},
  [DISTRICT_SIGN_OBJECT.heights!]: {},
};
