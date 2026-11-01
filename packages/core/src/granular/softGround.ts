// @skill jgengine-world
/**
 * Ground that gives under wheels and feet: a {@link GranularTerrain} driven by contacts. A wheel rolling from where it
 * last pressed sinks by Bekker's rigid-wheel law for the soil under it and shoves the soil into a berm, a foot presses a
 * plate, and the rut walls slump back toward the material's angle of repose as the flow steps. Sinkage, berm and
 * slumping all come from the material's published parameters ({@link GranularMaterial}); the vehicle is only read.
 *
 * Two dials, each `0` off, `1` as the material measures, past `1` more, finite, bounded by the loose depth and
 * monotone over the sane range `0..4`:
 * - `sinkage`: scales the contact load the soil carries, so ruts and footprints deepen with it.
 * - `recovery`: scales how fast the rut walls slump back (simulated time per real second).
 *
 * @capability soft-ground wheels and feet rut granular soil by the material's published sinkage, with sinkage and recovery dials
 */
import type { EditableTerrain, TerraformDelta } from "../terrain/terraform";
import type { GranularPressReport, GranularStepReport } from "./granularLayer";
import type { GranularMaterial } from "./granularMaterial";
import { createGranularTerrain, type GranularTerrain, type GranularTerrainOptions } from "./granularTerrain";

/** Options for {@link createSoftGround}. */
export interface SoftGroundOptions {
  /** The soil: materials, loose depth and material per point. */
  soil: GranularTerrainOptions;
  /** Contact-load dial. Default 1. */
  sinkage?: number;
  /** Slumping-rate dial. Default 1. */
  recovery?: number;
}

/** One wheel's contact this tick: where it is, the load it carries and its size. */
export interface SoftGroundWheel {
  x: number;
  z: number;
  /** Load on the wheel, N. */
  load: number;
  /** Tyre width, m. */
  width: number;
  /** Wheel diameter, m. */
  diameter: number;
}

/** Soft ground bound to a terrain. */
export interface SoftGround {
  readonly ground: GranularTerrain;
  /** Roll wheel `key` (a vehicle id plus a wheel index) from where it last pressed to this contact. */
  wheel(key: string, contact: SoftGroundWheel): GranularPressReport;
  /** The wheel left the ground: its next contact starts a new rut. */
  lift(key: string): void;
  /** A foot or pad pressing `load` N over a disc of `radius` m. */
  foot(x: number, z: number, radius: number, load: number): GranularPressReport;
  /** Advance the slumping and write what moved into the terrain. */
  step(dt: number): GranularStepReport & { delta: TerraformDelta };
  /** How far the surface sits below where it started, m (negative on a berm). */
  rutDepthAt(x: number, z: number): number;
  /** Retune the dials during play. */
  retune(dials: Pick<SoftGroundOptions, "sinkage" | "recovery">): void;
}

const NO_PRESS: GranularPressReport = { sinkage: 0, cells: 0, displaced: 0 };

function dial(value: number | undefined, label: string): number {
  if (value === undefined) return 1;
  if (!Number.isFinite(value) || value < 0) throw new Error(`soft ground ${label} must be finite and >= 0 (got ${value})`);
  return value;
}

/**
 * Lay soft ground over a terrain's vertex grid.
 * @capability soft-ground wheels and feet rut granular soil by the material's published sinkage, with sinkage and recovery dials
 */
export function createSoftGround(terrain: EditableTerrain, options: SoftGroundOptions): SoftGround {
  const ground = createGranularTerrain(terrain, options.soil);
  let sinkage = dial(options.sinkage, "sinkage");
  let recovery = dial(options.recovery, "recovery");
  const bounds = terrain.gridBounds;
  const cols = terrain.cols + 1;
  const rows = terrain.rows + 1;
  const sx = (bounds.maxX - bounds.minX) / terrain.cols;
  const sz = (bounds.maxZ - bounds.minZ) / terrain.rows;
  const start = new Float64Array(cols * rows);
  for (let i = 0; i < start.length; i += 1) start[i] = ground.layer.surface(i);
  const last = new Map<string, { x: number; z: number }>();

  const cellAt = (x: number, z: number): number => {
    const gx = Math.min(cols - 1, Math.max(0, Math.round((x - bounds.minX) / sx)));
    const gz = Math.min(rows - 1, Math.max(0, Math.round((z - bounds.minZ) / sz)));
    return gz * cols + gx;
  };

  return {
    ground,
    wheel(key, contact) {
      const from = last.get(key) ?? { x: contact.x, z: contact.z };
      last.set(key, { x: contact.x, z: contact.z });
      if (sinkage === 0 || contact.load <= 0) return NO_PRESS;
      return ground.roll(from.x, from.z, contact.x, contact.z, contact.width, contact.diameter, contact.load * sinkage);
    },
    lift(key) {
      last.delete(key);
    },
    foot(x, z, radius, load) {
      if (sinkage === 0 || load <= 0) return NO_PRESS;
      return ground.press(x, z, radius, load * sinkage);
    },
    step(dt) {
      if (recovery === 0) return { substeps: 0, simulated: 0, awake: ground.layer.awakeCount(), moved: 0, delta: ground.sync() };
      return ground.step(dt * recovery);
    },
    rutDepthAt(x, z) {
      const cell = cellAt(x, z);
      return (start[cell] ?? 0) - ground.layer.surface(cell);
    },
    retune(dials) {
      if (dials.sinkage !== undefined) sinkage = dial(dials.sinkage, "sinkage");
      if (dials.recovery !== undefined) recovery = dial(dials.recovery, "recovery");
    },
  };
}

/** A painted terrain surface that is soft: the material it is made of and how deep it lies over firm ground, m. */
export interface SoftSurfaceClass {
  material: GranularMaterial;
  looseDepthM: number;
}

/**
 * The soil for {@link createSoftGround} from the terrain's paint: each surface id listed is that material that deep,
 * and every other surface stays hard ground, as it is with no soft ground at all.
 * @capability soft-ground wheels and feet rut granular soil by the material's published sinkage, with sinkage and recovery dials
 */
export function softSurfaceSoil(terrain: Pick<EditableTerrain, "surfaceAt">, classes: Readonly<Record<string, SoftSurfaceClass>>): GranularTerrainOptions {
  const ids = Object.keys(classes);
  const materials = ids.map((id) => classes[id]?.material).filter((material): material is GranularMaterial => material !== undefined);
  return {
    materials,
    looseDepth: (x, z) => {
      const id = terrain.surfaceAt(x, z);
      return id === null ? 0 : classes[id]?.looseDepthM ?? 0;
    },
    materialAt: (x, z) => Math.max(0, ids.indexOf(terrain.surfaceAt(x, z) ?? "")),
  };
}
