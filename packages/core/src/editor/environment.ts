import type { SkyEnvironmentConfig, WorldBounds } from "../world/features";
import type { AvoidZone } from "../world/geometry";
import { clearanceZonesFrom, DEFAULT_CLEARANCE_KINDS, type ClearanceOptions } from "../world/scatterRegion";
import type { TerraformSnapshot } from "../world/terraform";
import { editorDocumentBounds } from "./document";
import type { EditorAutoExposure, EditorColorGrading, EditorDocument, EditorEnvironment, EditorLightProbe } from "./types";
import { bakeIrradianceVolume, type IrradianceBakeSettings, type IrradianceVolume } from "../render/lightProbes";
import type { LutCube } from "../render/postProcessing";
import type { LightingConfig, PointLightingConfig, SpotLightingConfig } from "../game/playableGame";

/**
 * World-authoring convergence (#1018, epic #1006 Phase 4): derive the **coordinate/placement**
 * content of an `environment()` world from the scene document, so a game with an authored document
 * needs no coordinate arrays in `world.ts` — the remaining `world.ts` surface is engine tuning
 * (noise, materials, sky preset, physics). Terrain footprint follows the authored objects, ground
 * clearings come from authored spawns/POIs (`clearanceZonesFrom`), and the sculpt snapshot is the
 * document's own terrain overlay. Pure and serializable; consumers pass the result straight to
 * `environment({ terrain: terrain({ bounds }), clearings, sculpt })`.
 */

/** Options controlling how {@link environmentContentFromDocument} sizes and clears the world. */
export interface EnvironmentContentOptions extends ClearanceOptions {
  /** Padding (m) added around the authored objects' extent when sizing the terrain. Default 24. */
  padding?: number;
  /** Minimum terrain footprint so a sparse document still yields a walkable world. Default 64×64. */
  minBounds?: WorldBounds;
}

/** The coordinate/placement content of a world, derived from its scene document. */
export interface EnvironmentContent {
  /** Terrain footprint (origin-centered) sized to cover every authored object plus padding. */
  bounds: WorldBounds;
  /** Ground-flatten discs under authored spawns/plots/POIs — feed `environment({ clearings })`. */
  clearings: AvoidZone[];
  /** The document's authored sculpt snapshot, when it has one — feed `environment({ sculpt })`. */
  sculpt?: TerraformSnapshot;
  /**
   * Scene-document sky/fog/lighting (#1110), when authored. Feed into `environment({ sky: sky(sky) })`
   * so the lighting workspace owns the look without hardcoding coordinates in world.ts.
   */
  sky?: SkyEnvironmentConfig;
}

/**
 * Maps the scene document's serializable environment bag onto the runtime sky config consumed by
 * `sky()` / `environment({ sky })`. Returns `undefined` when the document has no environment field
 * so callers can fall back to a world.ts default without inventing values.
 * @capability editor-environment project document lighting onto the runtime sky descriptor
 */
export function skyFromDocument(doc: EditorDocument): SkyEnvironmentConfig | undefined {
  const env = doc.environment;
  if (env === undefined) return undefined;
  return skyConfigFromEnvironment(env);
}

/**
 * Projects a validated {@link EditorEnvironment} bag onto {@link SkyEnvironmentConfig}.
 *
 * @internal
 */
export function skyConfigFromEnvironment(env: EditorEnvironment): SkyEnvironmentConfig {
  return {
    ...(env.preset === undefined ? {} : { preset: env.preset }),
    ...(env.timeOfDay === undefined ? {} : { timeOfDay: env.timeOfDay }),
    ...(env.horizonColor === undefined ? {} : { horizonColor: env.horizonColor }),
    ...(env.zenithColor === undefined ? {} : { zenithColor: env.zenithColor }),
    ...(env.sunIntensity === undefined ? {} : { sunIntensity: env.sunIntensity }),
    ...(env.ambientIntensity === undefined ? {} : { ambientIntensity: env.ambientIntensity }),
    ...(env.sunAzimuth === undefined && env.sunElevation === undefined
      ? {}
      : {
          sun: {
            ...(env.sunAzimuth === undefined ? {} : { azimuth: env.sunAzimuth }),
            ...(env.sunElevation === undefined ? {} : { elevation: env.sunElevation }),
          },
        }),
    ...(env.fog === undefined ? {} : { fog: { ...env.fog } }),
  };
}

/**
 * The baked irradiance volumes a scene document authored, flattened for the renderer.
 * @capability light-probes read the scene document's baked irradiance volumes at runtime
 */
export function lightProbesFromDocument(doc: EditorDocument): readonly IrradianceVolume[] {
  return doc.environment?.probes ?? [];
}

const GRADING_LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];
/** Cube sizes outside this bake either alias (2) or stop being a small authored file (16+). */
const MIN_LUT_SIZE = 2;
const MAX_LUT_SIZE = 16;
const DEFAULT_LUT_SIZE = 8;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Parses `#rgb`/`#rrggbb` into 0..1 display RGB; `undefined` when the swatch is not a colour. */
function displayRgb(hex: string): [number, number, number] | undefined {
  const body = hex.startsWith("#") ? hex.slice(1) : hex;
  const expanded = body.length === 3 ? body.split("").map((digit) => digit + digit).join("") : body;
  if (expanded.length !== 6 || !/^[0-9a-f]{6}$/i.test(expanded)) return undefined;
  const value = Number.parseInt(expanded, 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

function luma(rgb: readonly [number, number, number]): number {
  return rgb[0] * GRADING_LUMA[0] + rgb[1] * GRADING_LUMA[1] + rgb[2] * GRADING_LUMA[2];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** True when the authored grade would leave every colour unchanged, so no LUT is worth baking. */
function gradingIsIdentity(grading: EditorColorGrading): boolean {
  const saturation = grading.saturation ?? 1;
  const contrast = grading.contrast ?? 1;
  const tint = grading.tint ?? 0.45;
  const bands = grading.shadows !== undefined || grading.midtones !== undefined || grading.highlights !== undefined;
  return saturation === 1 && contrast === 1 && (!bands || tint <= 0);
}

/**
 * Bakes an authored grade into a display-space LUT cube. Contrast and saturation work around
 * luma, then each band pulls its share of the frame toward the authored swatch, scaled to the
 * pixel's own brightness so a swatch tints a band instead of painting over it. Pure and
 * deterministic, so the editor's preview and the runtime produce the same bytes.
 * @capability color-grading bake an authored grade into a display-space LUT cube
 */
export function lutCubeFromGrading(grading: EditorColorGrading): LutCube {
  const size = Math.round(Math.min(MAX_LUT_SIZE, Math.max(MIN_LUT_SIZE, grading.size ?? DEFAULT_LUT_SIZE)));
  const saturation = grading.saturation ?? 1;
  const contrast = grading.contrast ?? 1;
  const tint = clamp01(grading.tint ?? 0.45);
  const bands = [
    { color: grading.shadows === undefined ? undefined : displayRgb(grading.shadows), weight: (l: number) => 1 - smoothstep(0, 0.5, l) },
    // Band weights partition the frame: shadows fade out by mid-grey, highlights fade in from it, and
    // midtones are whatever is left (`s1 - s2`, which the naive `1 - wS - wH` double-counts).
    { color: grading.midtones === undefined ? undefined : displayRgb(grading.midtones), weight: (l: number) => smoothstep(0, 0.5, l) - smoothstep(0.5, 1, l) },
    { color: grading.highlights === undefined ? undefined : displayRgb(grading.highlights), weight: (l: number) => smoothstep(0.5, 1, l) },
  ].filter((band): band is { color: [number, number, number]; weight: (l: number) => number } => band.color !== undefined);
  const data = new Uint8Array(size * size * size * 3);
  const levels = size - 1;
  for (let blue = 0; blue < size; blue += 1) {
    for (let green = 0; green < size; green += 1) {
      for (let red = 0; red < size; red += 1) {
        const input: [number, number, number] = [red / levels, green / levels, blue / levels];
        const bandLuma = luma(input);
        const curved = input.map((channel) => clamp01((channel - 0.5) * contrast + 0.5)) as [number, number, number];
        const curvedLuma = luma(curved);
        let color = curved.map((channel) => curvedLuma + (channel - curvedLuma) * saturation) as [number, number, number];
        for (const band of bands) {
          const weight = clamp01(band.weight(bandLuma));
          if (weight <= 0) continue;
          // The swatch at the pixel's brightness: a #2a3a52 shadow tint darkens and cools, it does
          // not raise every shadow to mid-blue.
          const swatchLuma = Math.max(luma(band.color), 1e-3);
          const target = band.color.map((channel) => clamp01((channel * bandLuma) / swatchLuma));
          const amount = tint * weight;
          color = color.map((channel, index) => channel + (target[index]! - channel) * amount) as [number, number, number];
        }
        const offset = (blue * size * size + green * size + red) * 3;
        data[offset] = Math.round(clamp01(color[0]) * 255);
        data[offset + 1] = Math.round(clamp01(color[1]) * 255);
        data[offset + 2] = Math.round(clamp01(color[2]) * 255);
      }
    }
  }
  return { size, data };
}

/** The renderer-facing result of a document's authored grade. */
export interface DocumentColorGrade {
  /** Display-space LUT baked from the authored bands, saturation and contrast. */
  lut?: LutCube;
  /** Authored clamped auto-exposure range, when the document set one. */
  autoExposure?: EditorAutoExposure;
}

/**
 * The colour grade a scene document authored, baked for the renderer. `undefined` when the document
 * authored no grade at all, so an ungraded game keeps its own post chain untouched. The shell folds
 * this into the post config the same way {@link lightProbesFromDocument} feeds the irradiance
 * volumes, so a game's grade is authored data rather than a pass wired in its config.
 * @capability color-grading read the scene document's authored grade at runtime
 */
export function colorGradeFromDocument(doc: EditorDocument): DocumentColorGrade | undefined {
  const grading = doc.environment?.grading;
  if (grading === undefined) return undefined;
  const lut = gradingIsIdentity(grading) ? undefined : lutCubeFromGrading(grading);
  if (lut === undefined && grading.autoExposure === undefined) return undefined;
  return {
    ...(lut === undefined ? {} : { lut }),
    ...(grading.autoExposure === undefined ? {} : { autoExposure: grading.autoExposure }),
  };
}

/**
 * The lamps a bake should include: authored light markers plus the environment's point lights.
 * @capability light-probes fold the document's authored lamps into a probe bake
 */
export function authoredLightsFromDocument(doc: EditorDocument): readonly { position: readonly [number, number, number]; color?: string; intensity?: number; distance?: number }[] {
  const lamps: { position: readonly [number, number, number]; color?: string; intensity?: number; distance?: number }[] = [];
  for (const marker of doc.markers) {
    if (marker.kind !== "light" || marker.position === undefined) continue;
    const meta = marker.meta ?? {};
    lamps.push({
      position: [marker.position.x, marker.position.y, marker.position.z],
      ...(typeof meta.color === "string" ? { color: meta.color } : {}),
      ...(typeof meta.intensity === "number" ? { intensity: meta.intensity } : {}),
      ...(typeof meta.range === "number" ? { distance: meta.range } : {}),
    });
  }
  for (const light of doc.environment?.pointLights ?? []) {
    lamps.push({
      position: light.position,
      ...(light.color === undefined ? {} : { color: light.color }),
      ...(light.intensity === undefined ? {} : { intensity: light.intensity }),
      ...(light.distance === undefined ? {} : { distance: light.distance }),
    });
  }
  return lamps;
}

/**
 * Bakes one authored irradiance volume from its own settings and the document's lamps: sky where
 * the region is open, an authored ceiling/floor fill where it is enclosed, and the authored lamps
 * on top. Pure and deterministic, so the editor's Bake button and a script produce the same samples.
 * @capability light-probes bake a scene document's irradiance volume from its authored lamps
 */
export function bakeLightProbe(probe: EditorLightProbe, doc: EditorDocument): EditorLightProbe {
  const bake = probe.bake ?? { skyVisibility: 0 };
  const lamps = bakedLampsFor(probe, doc);
  return {
    ...probe,
    samples: bakeIrradianceVolume({
      id: probe.id,
      center: probe.center,
      size: probe.size,
      resolution: probe.resolution,
      settings: { ...bake, lights: lamps },
    }).samples,
  };
}

/** Lamps folded into a probe: its own bake lights when authored, else the document's lamps. */
function bakedLampsFor(probe: EditorLightProbe, doc: EditorDocument): NonNullable<IrradianceBakeSettings["lights"]> {
  if (probe.bake?.lights !== undefined && probe.bake.lights.length > 0) return probe.bake.lights;
  return authoredLightsFromDocument(doc);
}

/** Converts authored `light` markers into the runtime lighting contract. */
export function lightingFromDocument(doc: EditorDocument): LightingConfig | undefined {
  const points: PointLightingConfig[] = [];
  const spots: SpotLightingConfig[] = [];
  for (const marker of doc.markers) {
    if (marker.kind !== "light" || marker.position === undefined) continue;
    const meta = marker.meta ?? {};
    const base = { position: [marker.position.x, marker.position.y, marker.position.z] as [number, number, number], color: typeof meta.color === "string" ? meta.color : "#ffd6a0", intensity: typeof meta.intensity === "number" ? meta.intensity : 2, distance: typeof meta.range === "number" ? meta.range : 12, castShadow: meta.castShadow === true };
    if (meta.type === "spot") spots.push({ ...base, angle: typeof meta.angle === "number" ? meta.angle : Math.PI / 6 });
    else points.push(base);
  }
  return points.length === 0 && spots.length === 0 ? undefined : { point: points, spot: spots };
}

/**
 * The origin-centered terrain footprint that covers every authored object in a document, padded and
 * floored to `minBounds`. An empty document yields exactly `minBounds`. Because `environment()`
 * terrain is centered on the origin, the footprint is sized symmetrically to the farthest object on
 * each axis, so no authored object falls off the ground.
 * @capability world-convergence size terrain to the authored document instead of a hardcoded bounds
 */
export function terrainBoundsFromDocument(doc: EditorDocument, options: EnvironmentContentOptions = {}): WorldBounds {
  const padding = options.padding ?? 24;
  const min = options.minBounds ?? { w: 64, d: 64 };
  const bounds = editorDocumentBounds(doc);
  if (bounds === null) return { w: min.w, d: min.d };
  const halfX = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
  const halfZ = Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
  return {
    w: Math.max(min.w, halfX * 2 + padding * 2),
    d: Math.max(min.d, halfZ * 2 + padding * 2),
  };
}

const LAKEBED_CELL = 1.5;
/** Meters the bed drops below the water box's bottom face at full depth. */
const LAKEBED_UNDERCUT = 1.2;
/** Meters from the shoreline over which the bed ramps to full depth. */
const LAKEBED_SHORE_RAMP = 4;
/** Wavelength (m) of the seeded shore-ramp modulation that keeps the waterline organic. */
const LAKEBED_SHORE_NOISE_SCALE = 5.5;

/** Deterministic 2D value noise in [0,1] — the shoreline wobble must be stable across runs. */
function lakebedShoreNoise(x: number, z: number): number {
  const lattice = (ix: number, iz: number): number => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iz);
  const b = lattice(ix + 1, iz);
  const c = lattice(ix, iz + 1);
  const d = lattice(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * Derives a terrain-depression sculpt snapshot from the document's authored `water` volumes: each
 * water box carves a lake bed that ramps from the shoreline down to below the box's bottom face, so
 * an editor-authored pond/lake sits *in* the ground instead of floating as a sheet on top of it (and
 * ground-sampled vegetation sinks below the surface rather than growing through it). Returns
 * `undefined` when the document has no water volumes.
 * @capability world-convergence carve lake beds under authored water volumes
 */
export function lakebedFromWaterVolumes(doc: EditorDocument): TerraformSnapshot | undefined {
  const waters = doc.volumes.filter(
    (volume) => volume.kind === "water" && volume.halfExtents !== undefined,
  );
  if (waters.length === 0) return undefined;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const water of waters) {
    const he = water.halfExtents!;
    minX = Math.min(minX, water.center.x - he.x - LAKEBED_SHORE_RAMP);
    minZ = Math.min(minZ, water.center.z - he.z - LAKEBED_SHORE_RAMP);
    maxX = Math.max(maxX, water.center.x + he.x + LAKEBED_SHORE_RAMP);
    maxZ = Math.max(maxZ, water.center.z + he.z + LAKEBED_SHORE_RAMP);
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / LAKEBED_CELL));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / LAKEBED_CELL));
  const vertsX = cols + 1;
  const vertsZ = rows + 1;
  const offsets: number[] = new Array(vertsX * vertsZ).fill(0);
  for (let iz = 0; iz < vertsZ; iz += 1) {
    for (let ix = 0; ix < vertsX; ix += 1) {
      const x = minX + (ix / cols) * (maxX - minX);
      const z = minZ + (iz / rows) * (maxZ - minZ);
      let offset = 0;
      for (const water of waters) {
        const he = water.halfExtents!;
        // Rounded-rectangle signed distance on XZ (negative inside): the carve — and with it the
        // waterline — rounds the box corners instead of stamping a sharp rectangle in the ground.
        const rr = Math.min(he.x, he.z) * 0.3;
        const ax = Math.abs(x - water.center.x) - he.x + rr;
        const az = Math.abs(z - water.center.z) - he.z + rr;
        const raw = Math.hypot(Math.max(ax, 0), Math.max(az, 0)) + Math.min(Math.max(ax, az), 0) - rr;
        if (raw >= 0) continue;
        // Seeded wobble wanders the shoreline up to ±0.8 m, ramped in from the box edge so the
        // carve never escapes the authored footprint.
        const wobble = (lakebedShoreNoise(x / LAKEBED_SHORE_NOISE_SCALE, z / LAKEBED_SHORE_NOISE_SCALE) - 0.5) * 1.6;
        const dist = raw + wobble * Math.min(1, -raw / 1.5);
        if (dist >= 0) continue;
        const depth = he.y * 2 + LAKEBED_UNDERCUT;
        const t = Math.min(1, -dist / LAKEBED_SHORE_RAMP);
        // Smoothstep the shore ramp so the bed curves like a basin, not a funnel.
        const w = t * t * (3 - 2 * t);
        offset = Math.min(offset, -depth * w);
      }
      offsets[iz * vertsX + ix] = offset;
    }
  }
  return {
    bounds: { minX, minZ, maxX, maxZ },
    cellSize: LAKEBED_CELL,
    cols,
    rows,
    offsets,
    surfaces: new Array(cols * rows).fill(null),
  };
}

/**
 * Derives the coordinate/placement content of an `environment()` world from its scene document:
 * terrain footprint (via {@link terrainBoundsFromDocument}), ground clearings under authored
 * spawns/POIs (via `clearanceZonesFrom`), and the document's sculpt snapshot. This is the seam that
 * lets a game author its world footprint and flatten regions in the editor instead of hardcoding
 * them — the `world.ts` that consumes it carries only engine tuning.
 * @capability world-convergence derive environment coordinate content from the scene document
 */
export function environmentContentFromDocument(
  doc: EditorDocument,
  options: EnvironmentContentOptions = {},
): EnvironmentContent {
  const clearanceOptions: ClearanceOptions = {
    kinds: options.kinds ?? DEFAULT_CLEARANCE_KINDS,
    ...(options.ids === undefined ? {} : { ids: options.ids }),
    ...(options.defaultClearance === undefined ? {} : { defaultClearance: options.defaultClearance }),
    ...(options.feather === undefined ? {} : { feather: options.feather }),
  };
  // The authored sculpt snapshot wins outright when the document carries one (the author owns the
  // ground); otherwise water volumes derive their own lake-bed depression.
  const sculpt = doc.terrain ?? lakebedFromWaterVolumes(doc);
  const sky = skyFromDocument(doc);
  return {
    bounds: terrainBoundsFromDocument(doc, options),
    clearings: clearanceZonesFrom(doc, clearanceOptions),
    ...(sculpt === undefined ? {} : { sculpt }),
    ...(sky === undefined ? {} : { sky }),
  };
}
