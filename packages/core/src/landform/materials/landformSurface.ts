// @skill jgengine-world
/** @capability landform-materials per-cell bedrock, soil, gravel, sand, silt and scree from a landform simulation */
import { plantExp } from "../../plants/growth/plantMath";
import type { SurfaceMaterialKind } from "../../material/surfaceMaterialGenerator";
import type { LandscapeEvolution } from "../evolution/landscapeEvolution";
import { COVER, COVER_CLASSES } from "./sedimentCover";

export const LANDFORM_SURFACE_KINDS = ["rock", "gravel", "sand", "mud", "soil"] as const satisfies readonly SurfaceMaterialKind[];

export type LandformSurfaceKind = (typeof LANDFORM_SURFACE_KINDS)[number];

export interface LandformSurface {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly kinds: readonly LandformSurfaceKind[];
  readonly weights: Float32Array;
  readonly bedrock: Uint8Array;
  readonly bedrockIds: readonly string[];
  /** Loose cover thickness in metres. */
  readonly coverDepth: Float32Array;
  /** Standing water depth in metres (lakes and sea). */
  readonly waterDepth: Float32Array;
}

export interface LandformSurfaceOptions {
  /** Cover thickness in metres at which rock is 63% hidden. Default 0.2. */
  coverScale?: number;
}

/** @capability landform-materials per-cell bedrock, soil, gravel, sand, silt and scree from a landform simulation */
export function landformSurface(model: LandscapeEvolution, options: LandformSurfaceOptions = {}): LandformSurface {
  const { cols, rows, cellSize } = model.grid;
  const cells = cols * rows;
  const { cover, sediment, layer, height } = model.fields();
  const { water } = model.routing();
  const scale = options.coverScale ?? 0.2;
  const kinds = LANDFORM_SURFACE_KINDS;
  const weights = new Float32Array(cells * kinds.length);
  const coverDepth = new Float32Array(cells);
  const waterDepth = new Float32Array(cells);
  const classes = COVER_CLASSES.length;
  for (let i = 0; i < cells; i += 1) {
    const total = sediment[i] ?? 0;
    const depth = (water[i] ?? 0) - (height[i] ?? 0);
    coverDepth[i] = total;
    waterDepth[i] = depth > 0 ? depth : 0;
    const hidden = total > 0 ? 1 - plantExp(-total / scale) : 0;
    const at = i * kinds.length;
    weights[at] = 1 - hidden;
    if (total <= 0) continue;
    const share = (c: number): number => ((cover[i * classes + c] ?? 0) / total) * hidden;
    const silt = share(COVER.silt);
    weights[at + 1] = share(COVER.gravel) + share(COVER.scree) + share(COVER.till);
    weights[at + 2] = share(COVER.sand) + share(COVER.beach);
    weights[at + 3] = depth > 0 ? silt : 0;
    weights[at + 4] = share(COVER.soil) + (depth > 0 ? 0 : silt);
  }
  const ids = model.params().strata?.layers.map((rock) => rock.id) ?? ["rock"];
  return { cols, rows, cellSize, kinds, weights, bedrock: new Uint8Array(layer), bedrockIds: ids.length > 0 ? ids : ["rock"], coverDepth, waterDepth };
}
