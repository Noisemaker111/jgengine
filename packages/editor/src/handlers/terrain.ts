import type { EditorMarker } from "@jgengine/core/editor/index";
import {
  createTerrainSnapshot,
  editableTerrainFromSnapshot,
  type TerraformEdit,
  type TerrainMaterialLayer,
  type TerrainSurfaceRule,
} from "@jgengine/core/world/terraform";
import {
  resolveScatter,
  resolveScatterRegion,
  scatterRegionEstimate,
  scatterRegionFromPath,
  SCATTER_PATH_KIND,
  type ScatterTerrain,
} from "@jgengine/core/world/scatterRegion";

import { TERRAIN_MATERIALS } from "../uiStore";
import type { HandlerTable } from "./context";

function brushError(request: { x: number; z: number; radius?: number; strength?: number }): string | null {
  if (![request.x, request.z, request.radius ?? 8, request.strength ?? 1].every(Number.isFinite)) return "brush coordinates, radius and strength must be finite";
  if ((request.radius ?? 8) <= 0) return "brush radius must be positive";
  if ((request.strength ?? 1) < 0) return "brush strength must be nonnegative";
  return null;
}

/** Sculpt heightfield, material painting, terrain layers, and foliage/scatter verbs. */
export const terrainHandlers: Pick<
  HandlerTable,
  | "create_terrain"
  | "sculpt_terrain"
  | "terrain_summary"
  | "paint_terrain"
  | "fill_terrain"
  | "auto_paint"
  | "terrain_materials"
  | "terrain_layers"
  | "set_terrain_layers"
  | "blend_terrain"
  | "convert_scatter"
  | "add_foliage"
  | "scatter_summary"
> = {
  create_terrain: (ctx, request) => {
    const width = request.width ?? 200;
    const depth = request.depth ?? 200;
    const cx = request.centerX ?? 0;
    const cz = request.centerZ ?? 0;
    const cellSize = request.cellSize ?? 2;
    if (![width, depth, cx, cz, cellSize].every(Number.isFinite) || width <= 0 || depth <= 0 || cellSize <= 0) {
      return { ok: false, error: "terrain dimensions and cellSize must be finite and positive; center must be finite" };
    }
    if ((Math.max(1, Math.round(width / cellSize)) + 1) * (Math.max(1, Math.round(depth / cellSize)) + 1) > 1_000_000) {
      return { ok: false, error: "terrain exceeds 1,000,000 vertices — increase cellSize or reduce width/depth" };
    }
    const bounds = { minX: cx - width / 2, minZ: cz - depth / 2, maxX: cx + width / 2, maxZ: cz + depth / 2 };
    if (!Object.values(bounds).every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) {
      return { ok: false, error: "terrain bounds must have a finite, nonzero extent" };
    }
    const terrain = createTerrainSnapshot({
      bounds,
      cellSize,
    });
    ctx.session.dispatch({ type: "setTerrain", terrain });
    return { ok: true, result: { cols: terrain.cols, rows: terrain.rows, cellSize: terrain.cellSize } };
  },
  sculpt_terrain: (ctx, request) => {
    const invalid = brushError(request);
    if (invalid !== null) return { ok: false, error: invalid };
    const terrain = ctx.session.getState().document.terrain;
    if (terrain === undefined) return { ok: false, error: "no terrain — call create_terrain first" };
    if (request.mode === "ramp" && (request.toX === undefined || request.toZ === undefined)) return { ok: false, error: "ramp requires toX and toZ" };
    if ([request.target, request.toX, request.toZ, request.seed].some((value) => value !== undefined && !Number.isFinite(value))) return { ok: false, error: "sculpt target, ramp endpoint and seed must be finite" };
    const live = editableTerrainFromSnapshot(terrain);
    const edit: TerraformEdit = {
      mode: request.mode,
      center: [request.x, request.z],
      radius: request.radius ?? 8,
      strength: request.strength ?? 1,
      ...(request.target === undefined ? {} : { target: request.target }),
      ...(request.toX === undefined || request.toZ === undefined ? {} : { to: [request.toX, request.toZ] }),
      ...(request.seed === undefined ? {} : { seed: request.seed }),
      ...(request.shape === undefined ? {} : { shape: request.shape }),
    };
    const delta = live.editDelta(edit);
    if (delta.indices.length === 0) return { ok: false, error: "brush touched no vertices (check radius/position)" };
    ctx.session.dispatch({ type: "sculptTerrain", delta });
    return { ok: true, result: { changed: delta.indices.length, canUndo: ctx.session.canUndo() } };
  },
  terrain_summary: (ctx) => {
    const terrain = ctx.session.getState().document.terrain;
    if (terrain === undefined) return { ok: true, result: { terrain: null } };
    let min = Infinity;
    let max = -Infinity;
    let nonZero = 0;
    for (const value of terrain.offsets) {
      if (value < min) min = value;
      if (value > max) max = value;
      if (value !== 0) nonZero += 1;
    }
    return {
      ok: true,
      result: {
        cols: terrain.cols,
        rows: terrain.rows,
        cellSize: terrain.cellSize,
        bounds: terrain.bounds,
        minOffset: terrain.offsets.length === 0 ? 0 : min,
        maxOffset: terrain.offsets.length === 0 ? 0 : max,
        editedVertices: nonZero,
        paintedCells: terrain.surfaces.filter((surface) => surface !== null).length,
      },
    };
  },
  paint_terrain: (ctx, request) => {
    const invalid = brushError(request);
    if (invalid !== null) return { ok: false, error: invalid };
    const terrain = ctx.session.getState().document.terrain;
    if (terrain === undefined) return { ok: false, error: "no terrain — call create_terrain first" };
    const live = editableTerrainFromSnapshot(terrain);
    const delta = live.paintDelta({
      mode: "paint",
      center: [request.x, request.z],
      radius: request.radius ?? 8,
      surface: request.surface,
      ...(request.shape === undefined ? {} : { shape: request.shape }),
    });
    if (delta.indices.length === 0) return { ok: false, error: "paint touched no cells (check radius/position)" };
    ctx.session.dispatch({ type: "paintTerrain", delta });
    return { ok: true, result: { changed: delta.indices.length, canUndo: ctx.session.canUndo() } };
  },
  fill_terrain: (ctx, request) => {
    const terrain = ctx.session.getState().document.terrain;
    if (terrain === undefined) return { ok: false, error: "no terrain — call create_terrain first" };
    const live = editableTerrainFromSnapshot(terrain);
    const delta = live.fillSurfaceDelta(request.surface);
    if (delta.indices.length === 0) return { ok: true, result: { changed: 0 } };
    ctx.session.dispatch({ type: "paintTerrain", delta });
    return { ok: true, result: { changed: delta.indices.length } };
  },
  auto_paint: (ctx, request) => {
    const terrain = ctx.session.getState().document.terrain;
    if (terrain === undefined) return { ok: false, error: "no terrain — call create_terrain first" };
    const live = editableTerrainFromSnapshot(terrain);
    const rule: TerrainSurfaceRule = {
      surface: request.surface,
      ...(request.minSlope === undefined ? {} : { minSlope: request.minSlope }),
      ...(request.maxSlope === undefined ? {} : { maxSlope: request.maxSlope }),
      ...(request.minHeight === undefined ? {} : { minHeight: request.minHeight }),
      ...(request.maxHeight === undefined ? {} : { maxHeight: request.maxHeight }),
    };
    const delta = live.autoPaintDelta(rule);
    if (delta.indices.length === 0) return { ok: true, result: { changed: 0 } };
    ctx.session.dispatch({ type: "paintTerrain", delta });
    return { ok: true, result: { changed: delta.indices.length } };
  },
  terrain_materials: () => ({ ok: true, result: { materials: TERRAIN_MATERIALS } }),
  terrain_layers: (ctx) => {
    const terrain = ctx.session.getState().document.terrain;
    return { ok: true, result: { layers: terrain?.layers ?? [] } };
  },
  set_terrain_layers: (ctx, request) => {
    if (ctx.session.getState().document.terrain === undefined) {
      return { ok: false, error: "no terrain — call create_terrain first" };
    }
    if (new Set(request.layers.map((layer) => layer.id)).size !== request.layers.length || request.layers.some((layer) => layer.id.length === 0 || layer.surface.length === 0)) {
      return { ok: false, error: "terrain layers require unique nonempty ids and nonempty surfaces" };
    }
    ctx.session.dispatch({ type: "setTerrainLayers", layers: request.layers });
    return { ok: true, result: { layers: ctx.session.getState().document.terrain?.layers ?? [] } };
  },
  blend_terrain: (ctx, request) => {
    const invalid = brushError(request);
    if (invalid !== null) return { ok: false, error: invalid };
    const terrain = ctx.session.getState().document.terrain;
    if (terrain === undefined) return { ok: false, error: "no terrain — call create_terrain first" };
    const live = editableTerrainFromSnapshot(terrain);
    if ((request.strength ?? 1) > 1) return { ok: false, error: "blend strength must be between 0 and 1" };
    const addLayer = !live.layers.some((layer) => layer.surface === request.surface);
    if (addLayer) {
      let id = request.surface;
      let suffix = 1;
      while (live.layers.some((layer) => layer.id === id)) id = `${request.surface}_${suffix++}`;
      const layers: TerrainMaterialLayer[] = [...live.layers, { id, surface: request.surface }];
      live.setLayers(layers);
    }
    const delta = live.blendPaintDelta({
      mode: "paint",
      center: [request.x, request.z],
      radius: request.radius ?? 8,
      surface: request.surface,
      strength: request.strength ?? 1,
      ...(request.shape === undefined ? {} : { shape: request.shape }),
    });
    if (delta.indices.length === 0) return { ok: false, error: "blend touched no cells (check radius/position)" };
    ctx.session.dispatch(addLayer
      ? { type: "setTerrain", terrain: live.snapshot() }
      : { type: "blendTerrain", delta });
    return { ok: true, result: { changed: delta.indices.length, layers: ctx.session.getState().document.terrain?.layers ?? [] } };
  },
  convert_scatter: (ctx, request) => {
    const doc = ctx.session.getState().document;
    const path = doc.paths.find((entry) => entry.id === request.pathId);
    if (path === undefined) return { ok: false, error: `path not found: ${request.pathId}` };
    const region = scatterRegionFromPath(path);
    if (region === null) return { ok: false, error: `not a scatter region: ${request.pathId}` };
    const terrainSnapshot = doc.terrain;
    const terrain: ScatterTerrain | undefined =
      terrainSnapshot === undefined ? undefined : editableTerrainFromSnapshot(terrainSnapshot);
    const instances = resolveScatterRegion(region, terrain);
    const markers: EditorMarker[] = instances.map((instance) => ({
      id: instance.id.replace(/[^a-zA-Z0-9_]/g, "_"),
      kind: "prop",
      position: { x: instance.x, y: instance.y, z: instance.z },
      rotationY: instance.rotationY,
      meta: { item: instance.item, scale: instance.scale, fromScatter: request.pathId },
    }));
    ctx.session.dispatch({ type: "convertScatterToObjects", pathId: request.pathId, markers });
    return { ok: true, result: { created: markers.length, removedPath: request.pathId } };
  },
  add_foliage: (ctx, request) => {
    if (request.points.length < 3) return { ok: false, error: "add_foliage needs at least 3 polygon points" };
    const id = `foliage_${Date.now().toString(36)}`;
    ctx.session.dispatch({
      type: "addPath",
      path: {
        id,
        kind: SCATTER_PATH_KIND,
        points: request.points.map((point) => ({ x: point.x, y: 0, z: point.z })),
        label: "foliage",
        meta: {
          density: request.density ?? 0.15,
          ...(request.item === undefined ? {} : { item: request.item }),
          ...(request.seed === undefined ? {} : { seed: request.seed }),
          ...(request.minSpacing === undefined ? {} : { minSpacing: request.minSpacing }),
        },
      },
    });
    const path = ctx.session.getState().document.paths.find((p) => p.id === id);
    if (path === undefined) return { ok: false, error: `add_foliage failed to create region: ${id}` };
    return { ok: true, result: { id, estimate: scatterRegionEstimate(path) } };
  },
  scatter_summary: (ctx) => {
    const doc = ctx.session.getState().document;
    const regions = doc.paths.filter((path) => path.kind === SCATTER_PATH_KIND).length;
    const instances = resolveScatter(doc).length;
    return { ok: true, result: { regions, instances } };
  },
};
