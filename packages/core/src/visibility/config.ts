import type { MeshLodConfig } from "../lod/builtLods";
import type { CullingSettings, StreamingSettings, ObjectVisibilityOverrides } from "./settings";

/**
 * Far static cells draw one merged proxy instead of their props. Every cell of batched static props
 * switches to its proxy from `distance` metres (camera to the cell's bounds) plus half the
 * `hysteresis` band, and back below `distance` minus half of it; `cluster` is the proxy's detail in
 * metres: vertices closer than it merge.
 */
export interface HlodConfig {
  readonly distance: number;
  readonly hysteresis: number;
  readonly cluster: number;
}

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
  /** Far cells of static props draw a merged proxy. Off unless set. */
  readonly hlod?: HlodConfig;
  /**
   * Static props and scatter switch to the simplified levels the asset build wrote for their files
   * (`bun run games:provision build`), by size on screen, and big static props to a baked impostor
   * past `impostorDistance`. Off unless set; a model without built levels draws as before.
   */
  readonly meshLods?: MeshLodConfig;
}
