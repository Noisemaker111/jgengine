/** A declarative source for image-based scene lighting. */
export type EnvironmentSource =
  /** Procedural two-color sky probe, preserving the engine default. */
  | { kind: "gradient"; sky: string; ground: string; sun?: string; intensity?: number }
  /** Equirectangular HDR or EXR environment map loaded from `url`. */
  | { kind: "hdri"; url: string; rotation?: number; intensity?: number }
  /** Six faces of a cube environment map, in three.js cube-loader order. */
  | { kind: "cube"; urls: [string, string, string, string, string, string]; intensity?: number };
