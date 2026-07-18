/**
 * Per-frame camera orientation channel between the in-canvas probe and the DOM orientation
 * widget. Deliberately a mutable record, not React state: the probe writes every frame and the
 * widget reads on its own rAF loop, applying styles directly — zero shell rerenders.
 */
export interface CameraTelemetry {
  /** Camera-space basis (world-matrix columns): screen-projects world axes without a matrix lib. */
  rightX: number;
  rightY: number;
  rightZ: number;
  upX: number;
  upY: number;
  upZ: number;
  forwardX: number;
  forwardY: number;
  forwardZ: number;
  /** Camera yaw around +Y in radians (viewing direction). */
  azimuth: number;
  /** Camera pitch above the horizon in radians. */
  elevation: number;
  /** Monotonic write counter so readers can skip untouched frames. */
  version: number;
}

/** Creates a telemetry record seeded at rest (identity basis). */
export function createCameraTelemetry(): CameraTelemetry {
  return {
    rightX: 1,
    rightY: 0,
    rightZ: 0,
    upX: 0,
    upY: 1,
    upZ: 0,
    forwardX: 0,
    forwardY: 0,
    forwardZ: 1,
    azimuth: 0,
    elevation: 0,
    version: 0,
  };
}

const globalKey = "__jgengineEditorCameraTelemetry";

/** Shared telemetry singleton — probe and widget may mount in different React trees. */
export function getCameraTelemetry(): CameraTelemetry {
  const root = globalThis as typeof globalThis & { [globalKey]?: CameraTelemetry };
  root[globalKey] ??= createCameraTelemetry();
  return root[globalKey];
}
