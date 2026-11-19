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

export interface VisibilityConfig {
  readonly enabled?: boolean;
  readonly culling?: Partial<CullingSettings>;
  readonly streaming?: Partial<StreamingSettings>;
  readonly scene?: ObjectVisibilityOverrides;
  readonly entities?: Record<string, ObjectVisibilityOverrides>;
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
