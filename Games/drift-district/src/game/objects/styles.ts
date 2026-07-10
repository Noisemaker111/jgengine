import { BARRIER_OBJECT, CHECKPOINT_ARCH_OBJECT, DISTRICT_SIGN_OBJECT, GLOW_STRIP_OBJECT } from "./catalog";

export const OBJECT_STYLES: Record<string, { color?: string; opacity?: number }> = {
  [BARRIER_OBJECT]: { color: "#e8e6f0" },
  [CHECKPOINT_ARCH_OBJECT]: { color: "#e8e6f0", opacity: 0.35 },
  [GLOW_STRIP_OBJECT.harbor!]: { color: "#29d9e0" },
  [GLOW_STRIP_OBJECT.downtown!]: { color: "#ff2d78" },
  [GLOW_STRIP_OBJECT.heights!]: { color: "#ffb347" },
  [DISTRICT_SIGN_OBJECT.harbor!]: { color: "#29d9e0" },
  [DISTRICT_SIGN_OBJECT.downtown!]: { color: "#ff2d78" },
  [DISTRICT_SIGN_OBJECT.heights!]: { color: "#ffb347" },
};
