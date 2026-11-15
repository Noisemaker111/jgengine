import { mixHex } from "@jgengine/core/render/color";

/** Soft-edge width a {@link LightingZone} blends across when it sets none, in metres. */
export const DEFAULT_LIGHTING_ZONE_FADE = 24;

/**
 * A world-space rectangle that re-lights the scene while the camera is inside it: a dark showroom,
 * a sodium-lit loading dock, a cold-blue freezer aisle inside one lit building. Each value scales or
 * recolours the game's authored `rendering.lighting` rig, so the base rig stays the one source and
 * a zone only says how its stretch of the world differs. The camera crossing the edge blends from
 * the base look to the zone's across `fade` metres outside the rectangle.
 */
export interface LightingZone {
  /** Rectangle the zone covers: `w` by `d` metres centred on `position` (default the origin). */
  area: { w: number; d: number; position?: readonly [number, number] };
  /** Blend width outside the rectangle, in metres; default {@link DEFAULT_LIGHTING_ZONE_FADE}. */
  fade?: number;
  /** The key light (the first `directional`): `intensity` multiplies its authored intensity, `color` replaces its colour. */
  key?: { intensity?: number; color?: string };
  /** The fill (`ambient` and `hemisphere`): `intensity` multiplies both, `color` replaces the ambient and hemisphere sky colours, `groundColor` the hemisphere ground colour. */
  fill?: { intensity?: number; color?: string; groundColor?: string };
  /** Multiplier on the image-based environment light's intensity. Default 1. */
  environment?: number;
  /** Multiplier on the tone-mapping exposure (the post chain's authored exposure). Default 1. */
  exposure?: number;
}

/** The rig's authored colours a zone blends away from. */
export interface LightingZoneBase {
  keyColor: string;
  ambientColor: string;
  skyColor: string;
  groundColor: string;
}

/** The rig scaled and recoloured for one camera position. Multipliers are 1 and colours the base outside every zone. */
export interface LightingZoneSample {
  key: number;
  keyColor: string;
  fill: number;
  ambientColor: string;
  skyColor: string;
  groundColor: string;
  environment: number;
  exposure: number;
}

/** How strongly `zone` applies at `(x, z)`: 1 inside, easing to 0 across its fade. */
export function lightingZoneWeight(zone: LightingZone, x: number, z: number): number {
  const [cx, cz] = zone.area.position ?? [0, 0];
  const dx = Math.max(Math.abs(x - cx) - zone.area.w / 2, 0);
  const dz = Math.max(Math.abs(z - cz) - zone.area.d / 2, 0);
  const fade = Math.max(1e-3, zone.fade ?? DEFAULT_LIGHTING_ZONE_FADE);
  const t = Math.min(1, Math.hypot(dx, dz) / fade);
  return 1 - t * t * (3 - 2 * t);
}

const lerp = (from: number, to: number, t: number) => (t >= 1 ? to : from + (to - from) * t);

/**
 * Resolves the zones at `(x, z)` over the base rig. Zones apply in list order, each blending the
 * running result toward its own values by its weight, so a later zone wins where two overlap.
 */
export function sampleLightingZones(zones: readonly LightingZone[], x: number, z: number, base: LightingZoneBase): LightingZoneSample {
  const out: LightingZoneSample = {
    key: 1,
    keyColor: base.keyColor,
    fill: 1,
    ambientColor: base.ambientColor,
    skyColor: base.skyColor,
    groundColor: base.groundColor,
    environment: 1,
    exposure: 1,
  };
  for (const zone of zones) {
    const w = lightingZoneWeight(zone, x, z);
    if (w <= 0) continue;
    if (zone.key?.intensity !== undefined) out.key = lerp(out.key, zone.key.intensity, w);
    if (zone.key?.color !== undefined) out.keyColor = mixHex(out.keyColor, zone.key.color, w);
    if (zone.fill?.intensity !== undefined) out.fill = lerp(out.fill, zone.fill.intensity, w);
    if (zone.fill?.color !== undefined) {
      out.ambientColor = mixHex(out.ambientColor, zone.fill.color, w);
      out.skyColor = mixHex(out.skyColor, zone.fill.color, w);
    }
    if (zone.fill?.groundColor !== undefined) out.groundColor = mixHex(out.groundColor, zone.fill.groundColor, w);
    if (zone.environment !== undefined) out.environment = lerp(out.environment, zone.environment, w);
    if (zone.exposure !== undefined) out.exposure = lerp(out.exposure, zone.exposure, w);
  }
  return out;
}
