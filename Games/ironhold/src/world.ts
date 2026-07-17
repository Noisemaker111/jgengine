import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, grass, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

// The two keeps sit at the north/south ends; a dirt war-road runs between them.
const SOUTH_KEEP: [number, number] = [0, 36];
const NORTH_KEEP: [number, number] = [0, -36];
const ROAD: [number, number][] = [SOUTH_KEEP, [0, 12], [0, -12], NORTH_KEEP];

/**
 * The Ironhold vale — a rolling grass battlefield between two fortified keeps, ringed by highland
 * rock at the flanks and cut by a trampled dirt war-road. Relief comes from layered noise; the
 * "textured" ground is the procedural rock/grass detail shader (no image assets) plus painted
 * material zones for the road, the base plazas, and the mossy outcrops — the same trick tower-guard
 * uses. Base pads are flattened so buildings and units read cleanly.
 */
export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: 104, d: 104 },
    height: 2.6,
    frequency: 0.045,
    octaves: 4,
    seed: "ironhold-vale",
    segments: 120,
    material: "highland",
    colors: { low: "#4c6a31", high: "#728b40", waterline: "#3d5a4a" },
    materialRegions: [
      // Trampled dirt under the war-road.
      { shape: "polyline", points: ROAD, width: 7, falloff: 3, colors: { low: "#7c6238", high: "#8f7044" } },
      // Base plazas — worn earth around each keep.
      { shape: "circle", center: SOUTH_KEEP, radius: 13, falloff: 5, colors: { low: "#6d5a38", high: "#7f6c44" } },
      { shape: "circle", center: NORTH_KEEP, radius: 13, falloff: 5, colors: { low: "#5c4a38", high: "#6f5a42" } },
      // Mossy highland outcrops at the flanks (gold seams sit here).
      { shape: "circle", center: [-32, 0], radius: 12, falloff: 6, colors: { low: "#57663f", high: "#7d8a54" } },
      { shape: "circle", center: [32, 0], radius: 12, falloff: 6, colors: { low: "#57663f", high: "#7d8a54" } },
    ],
    // Push sand/snow off-world so the detail shader reads as pure grass → rock relief.
    detail: {
      rockColor: "#6b6157",
      sandColor: "#8a7a5a",
      rockSlopeStart: 0.58,
      snowHeight: 400,
      waterLevel: -80,
      detailScale: 3,
      macroScale: 26,
      roughness: 0.95,
      strength: 0.45,
    },
    // Grade the road bed and flatten the two base pads so structures sit level.
    pathProfiles: [{ points: ROAD, width: 6, height: { kind: "sample" }, shoulder: 2 }],
    flatten: [
      { center: SOUTH_KEEP, radius: 12, falloff: 5 },
      { center: NORTH_KEEP, radius: 12, falloff: 5 },
    ],
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#d3e2f0",
    zenithColor: "#7fb0e0",
    sunIntensity: 1.15,
    ambientIntensity: 0.55,
    hazeStrength: 0.4,
    sunGlowStrength: 0.5,
    fog: { color: "#c6d9e8", near: 78, far: 168 },
  }),
  vegetation: grass({
    area: { w: 96, d: 96 },
    density: 1.4,
    bladeHeight: [0.18, 0.55],
    windStrength: 0.5,
    colors: ["#3f7d2d", "#5aa83c", "#6b8f3a"],
    seed: "ironhold-grass",
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
