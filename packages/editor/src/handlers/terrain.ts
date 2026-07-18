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
    const terrain = createTerrainSnapshot({
      bounds: { minX: cx - width / 2, minZ: cz - depth / 2, maxX: cx + width / 2, maxZ: cz + depth / 2 },
      cellSize: request.cellSize ?? 2,
    });
    ctx.session.dispatch({ type: "setTerrain", terrain });
    return { ok: true, result: { cols: terrain.cols, rows: terrain.rows, cellSize: terrain.cellSize } };
  },
  sculpt_terrain: (ctx, request) => {
    const terrain = ctx.session.getState().document.terrain;
    if (terrain === undefined) return { ok: false, error: "no terrain — call create_terrain first" };
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
    ctx.session.dispatch({ type: "setTerrainLayers", layers: request.layers });
    return { ok: true, result: { layers: ctx.session.getState().document.terrain?.layers ?? [] } };
  },
  blend_terrain: (ctx, request) => {
    const terrain = ctx.session.getState().document.terrain;
    if (terrain === undefined) return { ok: false, error: "no terrain — call create_terrain first" };
    // Auto-add the surface as a layer if the stack does not carry it yet.
    const layers = terrain.layers ?? [];
    if (!layers.some((layer) => layer.surface === request.surface)) {
      const next: TerrainMaterialLayer[] = [...layers, { id: request.surface, surface: request.surface }];
      ctx.session.dispatch({ type: "setTerrainLayers", layers: next });
    }
    const snapshot = ctx.session.getState().document.terrain;
    if (snapshot === undefined) return { ok: false, error: "no terrain — call create_terrain first" };
    const live = editableTerrainFromSnapshot(snapshot);
    const delta = live.blendPaintDelta({
      mode: "paint",
      center: [request.x, request.z],
      radius: request.radius ?? 8,
      surface: request.surface,
      strength: request.strength ?? 1,
      ...(request.shape === undefined ? {} : { shape: request.shape }),
    });
    if (delta.indices.length === 0) return { ok: false, error: "blend touched no cells (check radius/position)" };
    ctx.session.dispatch({ type: "blendTerrain", delta });
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
