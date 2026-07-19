import { generateStreets, type StreetNetworkRules, type Street } from "@jgengine/core/world/streetGenerator";
import type { EditorDocument, EditorPath, EditorVec3, EditorVolume } from "@jgengine/core/editor/index";

import type { HandlerTable } from "./context";

/**
 * Bake the pure `generateStreets` generator (`@jgengine/core/world/streetGenerator`) into the scene
 * document as authorable `road`/`route` paths (#1185). The generator answers to sliders and returns
 * volume-local through-streets; this verb transforms those into world-frame {@link EditorPath}s and
 * inserts them as one undoable edit with stable, seed-derived ids so a re-run replaces its own prior
 * output instead of duplicating.
 *
 * Product invariant (CLAUDE.md): generator output is BAKED into `editor.scene.json`, never consumed at
 * runtime — so the baked paths become ordinary authored content the designer can move, restyle, delete,
 * or hand-edit afterwards.
 */

/** Requested topology family — selects the default slider preset the generator grows from. */
type RequestedMode = "net" | "circuit";

/** Fully-defaulted slider preset for an open street net (resolves to `net` in `streetNetworkMode`). */
const NET_DEFAULTS: Omit<StreetNetworkRules, "seed"> = {
  gridness: 0.9,
  loopiness: 0.2,
  connectivity: 0.35,
  branching: 0.3,
  deadEnds: 0.5,
  segmentLength: 48,
  aspect: 1,
  winding: 0.2,
  minCurveRadius: 30,
  minTurnAngle: 0,
  maxTurnAngle: 120,
  width: 7,
  boulevards: 0.3,
};

/** Fully-defaulted slider preset for a closed race circuit (resolves to `circuit` in `streetNetworkMode`). */
const CIRCUIT_DEFAULTS: Omit<StreetNetworkRules, "seed"> = {
  gridness: 0.1,
  loopiness: 1,
  connectivity: 0,
  branching: 0,
  deadEnds: 0,
  segmentLength: 60,
  aspect: 1,
  winding: 0.5,
  minCurveRadius: 24,
  minTurnAngle: 0,
  maxTurnAngle: 70,
  width: 12,
  boulevards: 0,
};

/** The numeric slider keys a caller may overlay onto the mode preset via `params`. */
const RULE_KEYS: readonly (keyof Omit<StreetNetworkRules, "seed">)[] = [
  "gridness",
  "loopiness",
  "connectivity",
  "branching",
  "deadEnds",
  "segmentLength",
  "aspect",
  "winding",
  "minCurveRadius",
  "minTurnAngle",
  "maxTurnAngle",
  "width",
  "boulevards",
];

/** The tag every baked path carries in `meta.generator`, so a re-run can find and replace its own output. */
const GENERATOR_TAG = "streetGenerator";

/** Stable id prefix for a seed's baked paths — the idempotency key for replace-on-re-run. */
function genPrefix(seed: string): string {
  return `gen-${seed}-`;
}

/** True when a path was baked by this generator for `seed` (matches id prefix OR the meta tag). */
function isGeneratedForSeed(path: EditorPath, seed: string): boolean {
  if (path.id.startsWith(genPrefix(seed))) return true;
  const meta = path.meta;
  return meta !== undefined && meta.generator === GENERATOR_TAG && meta.seed === seed;
}

/** Half-extents (hx, hz) and world origin a volume fills, so the generator grows inside its footprint. */
function volumeFootprint(volume: EditorVolume): { hx: number; hz: number; origin: EditorVec3 } {
  if (volume.shape === "box" && volume.halfExtents !== undefined) {
    return { hx: Math.max(1, volume.halfExtents.x), hz: Math.max(1, volume.halfExtents.z), origin: volume.center };
  }
  // sphere / cylinder (or a box missing halfExtents): a radius is symmetric in x/z.
  const r = Math.max(1, volume.radius ?? 0);
  return { hx: r, hz: r, origin: volume.center };
}

/** Document, selection, camera, mode, asset placement, and status verbs. */
export const streetsHandlers: Pick<HandlerTable, "generate_streets"> = {
  generate_streets: (ctx, request) => {
    const doc = ctx.session.getState().document;
    const seed = request.seed ?? "path";
    const requestedMode: RequestedMode = request.mode === "circuit" ? "circuit" : "net";

    // Resolve the footprint + world origin from a named volume or from explicit bounds.
    let hx: number;
    let hz: number;
    let origin: EditorVec3;
    if (request.volumeId !== undefined) {
      const volume = doc.volumes.find((v) => v.id === request.volumeId);
      if (volume === undefined) return { ok: false, error: `volume not found: ${request.volumeId}` };
      ({ hx, hz, origin } = volumeFootprint(volume));
    } else {
      const center = request.center ?? { x: 0, y: 0, z: 0 };
      if (request.halfX === undefined || request.halfZ === undefined) {
        return { ok: false, error: "generate_streets requires volumeId, or center + halfX + halfZ" };
      }
      hx = Math.max(1, request.halfX);
      hz = Math.max(1, request.halfZ);
      origin = center;
    }

    // Build rules: mode preset, overlaid with any numeric slider overrides from `params`.
    const preset = requestedMode === "circuit" ? CIRCUIT_DEFAULTS : NET_DEFAULTS;
    const rules: StreetNetworkRules = { seed, ...preset };
    const params = request.params;
    if (params !== undefined) {
      for (const key of RULE_KEYS) {
        const value = params[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          rules[key] = value;
        }
      }
    }

    const network = generateStreets(rules, hx, hz);
    // The generator resolves the ACTUAL topology from the rules; use it for the default path kind so a
    // circuit bakes `route`s and a net bakes `road`s even when the caller's sliders cross the boundary.
    const kind = request.kind ?? (network.mode === "circuit" ? "route" : "road");
    const baseY = origin.y;

    const toWorld = (street: Street): EditorVec3[] =>
      street.points.map(([lx, lz]) => ({ x: origin.x + lx, y: baseY, z: origin.z + lz }));

    // Through-streets → one path each (a circuit's ring is a single closed loop street: first ≈ last).
    const newPaths: EditorPath[] = [];
    network.streets.forEach((street, index) => {
      const points = toWorld(street);
      if (points.length < 2) return;
      newPaths.push({
        id: `${genPrefix(seed)}${index}`,
        kind,
        points,
        width: street.width,
        label: `${kind} ${index}`,
        meta: {
          generator: GENERATOR_TAG,
          seed,
          mode: network.mode,
          level: street.level,
          loop: street.loop,
        },
      });
    });

    // Idempotent replace: drop this seed's prior baked paths, keep everything else, append the fresh set —
    // all as ONE undoable structural edit via replaceDocument.
    const kept = doc.paths.filter((p) => !isGeneratedForSeed(p, seed));
    const nextDoc: EditorDocument = { ...doc, paths: [...kept, ...newPaths] };
    const { applied } = ctx.dispatchGuarded({ type: "replaceDocument", document: nextDoc });
    if (!applied) return { ok: false, error: "generate_streets: document replace had no effect" };
    // replaceDocument clears selection; re-select the freshly baked paths for the caller.
    ctx.session.dispatch({ type: "select", ids: newPaths.map((p) => p.id) });

    return {
      ok: true,
      result: {
        seed,
        requestedMode,
        mode: network.mode,
        kind,
        pathCount: newPaths.length,
        removed: doc.paths.length - kept.length,
        ids: newPaths.map((p) => p.id),
        footprint: { hx, hz, origin },
      },
    };
  },
};
