import type { CullingSettings, StreamingSettings, ObjectVisibilityOverrides } from "./settings";

/**
 * Per-game visibility configuration, surfaced on `PlayableGame.visibility`. Everything is
 * optional: an existing game that sets nothing gets the conservative engine defaults
 * automatically. This is the scene-level and per-kind override seam (requirement: per-object,
 * per-layer, per-scene, and global controls).
 */
export interface VisibilityConfig {
  /** Master switch for render culling in the shell. Default true. */
  readonly enabled?: boolean;
  /** Overrides for the global culling defaults (margins, distances, hysteresis, occlusion flag). */
  readonly culling?: Partial<CullingSettings>;
  /** Overrides for the asset-streaming defaults. */
  readonly streaming?: Partial<StreamingSettings>;
  /** Scene-wide overrides applied to every object. */
  readonly scene?: ObjectVisibilityOverrides;
  /** Overrides keyed by entity kind name. */
  readonly entities?: Record<string, ObjectVisibilityOverrides>;
  /** Overrides keyed by placed-object catalog id. */
  readonly objects?: Record<string, ObjectVisibilityOverrides>;
}
