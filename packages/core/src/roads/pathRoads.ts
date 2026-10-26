import type { EditorPath } from "../editor/types";
import { road, type RoadEnvironmentDescriptor } from "../world/features";
import { GROUND_DECAL_LAYERS } from "./roads";

/**
 * Editor path kinds that pave: they default to asphalt (with the scanned carriageway), a road-grey
 * colour and gutters. Every other drawn path kind (`trail`, `route`, `promenade`, …) is unpaved
 * ground named by its `meta.surface` or its kind, with soft edges and no kerb.
 */
export const PAVED_PATH_KINDS: ReadonlySet<string> = new Set(["road", "street", "track", "avenue", "highway"]);

const UNPAVED_COLOR = "#7a6444";

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * An authored editor path as a {@link road} descriptor, so streets, race tracks and trails all draw
 * through the one road renderer. Read from the path: `width` (else `meta.width`, else 4), `color` /
 * `meta.color`, and in `meta`: `surface` (a terrain paint id, or `false` for flat colour),
 * `markings`, `sidewalk` (`true`, a width in metres, or an object like {@link road}'s), `kerb`,
 * `closed`, `cornerRadius`, `wear`, `edgeSoftness` and `surfaceDetail: false`. `null` for a path
 * with fewer than two points.
 */
export function pathRoad(path: EditorPath, options: { surfaceDetail?: boolean } = {}): RoadEnvironmentDescriptor | null {
  if (path.points.length < 2) return null;
  const meta = path.meta ?? {};
  const paved = PAVED_PATH_KINDS.has(path.kind);
  const width = path.width ?? num(meta["width"]) ?? 4;
  const color = typeof meta["color"] === "string" ? (meta["color"] as string) : path.color ?? (paved ? undefined : UNPAVED_COLOR);
  const flat = options.surfaceDetail === false || meta["surfaceDetail"] === false || meta["surface"] === false;
  const surface = flat ? false : typeof meta["surface"] === "string" ? (meta["surface"] as string) : paved ? undefined : path.kind;
  const sidewalkMeta = meta["sidewalk"];
  const kerb = num(meta["kerb"]);
  const sidewalk =
    sidewalkMeta === true
      ? { ...(kerb === undefined ? {} : { kerb }) }
      : typeof sidewalkMeta === "number" && sidewalkMeta > 0
        ? { width: sidewalkMeta, ...(kerb === undefined ? {} : { kerb }) }
        : typeof sidewalkMeta === "object" && sidewalkMeta !== null
          ? (sidewalkMeta as { width?: number; color?: string; slabs?: number | false; kerb?: number })
          : false;
  const cornerRadius = num(meta["cornerRadius"]);
  const wear = num(meta["wear"]);
  const edgeSoftness = num(meta["edgeSoftness"]);
  return road({
    path: path.points.map((point) => [point.x, point.z] as const),
    width,
    ...(color === undefined ? {} : { color }),
    markings: meta["markings"] === true,
    elevation: num(meta["elevation"]) ?? GROUND_DECAL_LAYERS.road,
    sidewalk,
    ...(surface === undefined ? {} : { surface }),
    ...(meta["closed"] === true ? { closed: true } : {}),
    ...(cornerRadius === undefined ? {} : { cornerRadius }),
    ...(wear === undefined ? {} : { wear }),
    ...(edgeSoftness === undefined ? {} : { edgeSoftness }),
  });
}
