/**
 * One shadow map for an outdoor sun: 2048 texels over a 70 m box that leads the camera, so the
 * ground the player looks at gets ~3.4 cm texels and a PCF radius wide enough to hide the
 * stair-step. A 180 m box centered on the camera wasted half its texels behind the view.
 * @internal
 */
export const SUN_SHADOW = {
  mapSize: 2048,
  halfExtent: 35,
  lead: 22,
  radius: 6,
  distance: 220,
  near: 10,
  far: 520,
  bias: -0.0004,
  normalBias: 0.02,
} as const;

/**
 * Where the sun's shadow box centers this frame: `lead` meters ahead of the camera along its
 * horizontal view, snapped to whole shadow texels so edges hold still while the camera moves.
 * Looking straight down (no horizontal view) centers on the camera.
 * @internal
 */
export function sunShadowFocus(
  camera: { x: number; z: number },
  forward: { x: number; z: number },
  out: { x: number; z: number } = { x: 0, z: 0 },
): { x: number; z: number } {
  const length = Math.hypot(forward.x, forward.z);
  const lead = length < 1e-6 ? 0 : SUN_SHADOW.lead / length;
  const texel = (SUN_SHADOW.halfExtent * 2) / SUN_SHADOW.mapSize;
  out.x = Math.round((camera.x + forward.x * lead) / texel) * texel;
  out.z = Math.round((camera.z + forward.z * lead) / texel) * texel;
  return out;
}

/**
 * The sun light's world position for a focus point: `distance` meters back along the sun
 * direction, so near/far cover the box whatever magnitude the sky's sun vector carries.
 * @internal
 */
export function sunLightPosition(
  focus: { x: number; z: number },
  sun: readonly [number, number, number],
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const length = Math.hypot(sun[0], sun[1], sun[2]);
  if (length < 1e-6) {
    out[0] = focus.x;
    out[1] = SUN_SHADOW.distance;
    out[2] = focus.z;
    return out;
  }
  const scale = SUN_SHADOW.distance / length;
  out[0] = focus.x + sun[0] * scale;
  out[1] = sun[1] * scale;
  out[2] = focus.z + sun[2] * scale;
  return out;
}
