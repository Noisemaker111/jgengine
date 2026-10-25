import {
  buildRoadRibbon,
  GROUND_DECAL_LAYERS,
  type RoadPoint,
  type RoadRibbon,
} from "@jgengine/core/world/roads";

/** Painted width of the range band, in world units — a crisp outline, not a filled disc over the route. */
export const RANGE_RING_WIDTH = 0.45;

/** Longest centreline step along the circle before the band is draped; keeps the ring hugging relief. */
const RING_STEP = 1.2;

/**
 * A tower's firing radius as a thread of ground-draped ribbon on the engine's emissive decal layer
 * (`GROUND_DECAL_LAYERS.glow`), the same pure ribbon geometry the authored raider road uses.
 *
 * Two things follow from reusing the decal layer instead of a flat halo at a hand-picked height:
 * the band follows sculpted highland rather than cutting into a rise, and it draws as an outline
 * above the road, so the raider route stays readable underneath it (the old filled annulus washed a
 * translucent disc across the road wherever the two crossed).
 */
export function rangeRingBand(options: {
  /** Ring centre in world XZ. */
  center: RoadPoint;
  /** Firing radius in world units; the band is centred on this circle. */
  radius: number;
  /** Terrain height under a world XZ point. */
  sampleHeight: (x: number, z: number) => number;
  /** Band width; defaults to {@link RANGE_RING_WIDTH}. */
  width?: number;
}): RoadRibbon {
  const width = options.width ?? RANGE_RING_WIDTH;
  const radius = Math.max(options.radius, width);
  const segments = Math.max(32, Math.ceil((2 * Math.PI * radius) / RING_STEP));
  const [cx, cz] = options.center;
  const circle: RoadPoint[] = [];
  for (let step = 0; step <= segments; step += 1) {
    const angle = (step / segments) * Math.PI * 2;
    circle.push([cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius]);
  }
  return buildRoadRibbon(circle, width, options.sampleHeight, {
    elevation: GROUND_DECAL_LAYERS.glow,
    maxSegmentLength: RING_STEP,
  });
}
