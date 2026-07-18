/**
 * `pole_line` studio: poles + sagging cables strung along an editor-drawn path — power lines, fences,
 * streetlight runs, ziplines. Pure config here (spacing/height/wire params + a resolver built from the
 * generic `placeAlongPath` and `sagCurve` primitives); the instanced pole/cable meshes live in the
 * `shell` renderer. An engine environment kind (like water/grass_field/soil) so wire runs are
 * drawable and slider-authorable in every editor session and persisted in `editor.scene.json` —
 * promoted from `examples/studios` for studio/editor parity (#1101).
 */
import { placeAlongPath } from "./pathInstances";
import { sagCurve, type Vec3 } from "./catenary";
import {
  registerSceneKind,
  type ParamSchema,
  type ParsedParams,
  type SceneKindObject,
  type SceneKindResolveContext,
} from "../scene/sceneKinds";

/**
 * The editor path kind marking a polyline as a pole/cable run.
 * @capability pole-line editor-authorable poles + sagging cables along a path
 */
export const POLE_LINE_KIND = "pole_line";

/** One placed pole: grounded base position plus facing yaw along the run. */
export interface Pole {
  id: string;
  position: Vec3;
  yaw: number;
}

/** One resolved cable span: a point string to loft into a tube, plus its radius. */
export interface Cable {
  id: string;
  points: Vec3[];
  radius: number;
}

/** The renderable payload the resolver returns and the shell renderer consumes. */
export interface ResolvedPoleLine {
  poles: Pole[];
  cables: Cable[];
  poleHeight: number;
  poleAsset: string;
}

/** The pole-line parameter schema — drives the inspector and `meta` parse via the studio seam. */
export const POLE_LINE_SCHEMA: ParamSchema = {
  fields: [
    { type: "text", key: "poleAsset", label: "pole asset", default: "", group: "poles" },
    { type: "range", key: "spacing", label: "spacing", min: 2, max: 40, step: 0.5, default: 8, unit: "m", group: "poles" },
    { type: "range", key: "poleHeight", label: "pole height", min: 1, max: 20, step: 0.25, default: 6, unit: "m", group: "poles" },
    { type: "bool", key: "snapToTerrain", label: "snap to ground", default: true, group: "poles" },
    { type: "action", key: "randomizePoles", label: "randomize poles", action: "randomize", group: "poles" },
    { type: "range", key: "wireCount", label: "wires", min: 0, max: 8, step: 1, default: 3, group: "cables" },
    { type: "range", key: "wireSpacing", label: "wire spread", min: 0, max: 3, step: 0.05, default: 0.5, unit: "m", group: "cables" },
    { type: "range", key: "cableRadius", label: "cable radius", min: 0.01, max: 0.5, step: 0.01, default: 0.05, unit: "m", group: "cables" },
    { type: "range", key: "sag", label: "sag", min: 0, max: 6, step: 0.1, default: 0.8, unit: "m", group: "cables" },
    { type: "range", key: "sagPerMeter", label: "sag / m", min: 0, max: 0.3, step: 0.005, default: 0.04, group: "cables" },
    { type: "range", key: "cableSegments", label: "cable smoothness", min: 2, max: 48, step: 1, default: 12, group: "cables" },
    { type: "seed", key: "seed", label: "seed", default: "", group: "cables" },
    { type: "action", key: "randomizeCables", label: "randomize cables", action: "randomize", group: "cables" },
  ],
  groups: [
    { id: "poles", label: "Poles" },
    { id: "cables", label: "Cables" },
  ],
};

/**
 * Resolve poles + cables from a document object's points and parsed params. Poles come from the
 * generic `placeAlongPath` sampler; between each consecutive pair, `wireCount` parallel cables are
 * strung with lateral offset and quadratic-Bézier `sag` (deeper on longer spans). Pure data.
 */
export function resolvePoleLine(object: SceneKindObject, params: ParsedParams, context?: SceneKindResolveContext): ResolvedPoleLine {
  const spacing = params["spacing"] as number;
  const poleHeight = params["poleHeight"] as number;
  const wireCount = Math.round(params["wireCount"] as number);
  const wireSpacing = params["wireSpacing"] as number;
  const cableRadius = params["cableRadius"] as number;
  const sag = params["sag"] as number;
  const sagPerMeter = params["sagPerMeter"] as number;
  const cableSegments = Math.round(params["cableSegments"] as number);
  const snap = params["snapToTerrain"] as boolean;

  const placed = placeAlongPath(object.points ?? [], {
    spacing,
    ...(snap && context?.sampleHeight !== undefined ? { sampleHeight: context.sampleHeight } : {}),
  });
  const poles: Pole[] = placed.map((instance) => ({ id: `${object.id}/pole/${instance.index}`, position: instance.position, yaw: instance.yaw }));

  const cables: Cable[] = [];
  if (wireCount > 0) {
    for (let i = 0; i + 1 < poles.length; i += 1) {
      const a = poles[i]!;
      const b = poles[i + 1]!;
      const dx = b.position[0] - a.position[0];
      const dz = b.position[2] - a.position[2];
      const span = Math.hypot(dx, dz) || 1;
      const perpX = -dz / span;
      const perpZ = dx / span;
      const drop = sag + sagPerMeter * span;
      const half = (wireCount - 1) / 2;
      for (let w = 0; w < wireCount; w += 1) {
        const offset = (w - half) * wireSpacing;
        const topA: Vec3 = [a.position[0] + perpX * offset, a.position[1] + poleHeight, a.position[2] + perpZ * offset];
        const topB: Vec3 = [b.position[0] + perpX * offset, b.position[1] + poleHeight, b.position[2] + perpZ * offset];
        cables.push({ id: `${object.id}/cable/${i}/${w}`, points: sagCurve(topA, topB, drop, cableSegments), radius: cableRadius });
      }
    }
  }
  return { poles, cables, poleHeight, poleAsset: params["poleAsset"] as string };
}

/** Registers the pole-line scene kind (schema + resolver + inspector note). Called by `registerBuiltinSceneKinds`. @internal */
export function registerPoleLineKind(): void {
  registerSceneKind<ResolvedPoleLine>({
    kind: POLE_LINE_KIND,
    target: "path",
    label: "Pole line / cables",
    pathShape: "line",
    addCategory: "Studios",
    accent: "#fbbf24",
    schema: POLE_LINE_SCHEMA,
    resolve: (object, params, context) => resolvePoleLine(object, params, context),
    note: (object, params) => {
      const resolved = resolvePoleLine(object, params);
      return `${resolved.poles.length} poles · ${resolved.cables.length} cables`;
    },
  });
}
