/** Viewport dimensions in device-independent canvas pixels. */
export interface PixelPerfectViewport {
  width: number;
  height: number;
}

/** The orthographic bounds and scale derived from a pixel-perfect camera config. */
export interface PixelPerfectFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
  zoom: number;
  scale: number;
}

/**
 * Computes an orthographic frustum whose world units map to the requested pixel density.
 * Integer scaling chooses the largest whole-number density multiplier available in the viewport.
 */
export function pixelPerfectFrustum(
  viewport: PixelPerfectViewport,
  pixelsPerUnit: number,
  integerScale = false,
): PixelPerfectFrustum {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const density = Math.max(1e-6, pixelsPerUnit);
  const scale = integerScale ? Math.max(1, Math.floor(Math.min(width, height) / density)) : 1;
  const zoom = density * scale;
  return {
    left: -width / (2 * zoom),
    right: width / (2 * zoom),
    top: height / (2 * zoom),
    bottom: -height / (2 * zoom),
    zoom,
    scale,
  };
}

/** Snaps a camera position to the authored pixel grid without changing its orientation. */
export function snapPixelPerfectPosition<T extends { x: number; y: number; z: number }>(
  position: T,
  pixelsPerUnit: number,
): T {
  const density = Math.max(1e-6, pixelsPerUnit);
  return {
    ...position,
    x: Math.round(position.x * density) / density,
    y: Math.round(position.y * density) / density,
    z: Math.round(position.z * density) / density,
  };
}
