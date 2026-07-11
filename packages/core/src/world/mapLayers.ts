export type MapXZ = readonly [number, number];

export type MapLayerTone = "danger" | "warning" | "info" | "safe" | "neutral";

export interface MapRoute {
  id: string;
  /** World-XZ polyline. */
  points: readonly MapXZ[];
  tone?: MapLayerTone;
  /** Dashed rendering — a planned/forecast route rather than a live one. */
  forecast?: boolean;
  /** Line width in map pixels; default `2`. */
  width?: number;
  /** Close the polyline back to its first point (patrol loops). */
  closed?: boolean;
}

export type MapZoneShape =
  | { kind: "circle"; center: MapXZ; radius: number }
  | { kind: "rect"; center: MapXZ; w: number; d: number; rotate?: number }
  | { kind: "polygon"; points: readonly MapXZ[] };

export interface MapZone {
  id: string;
  shape: MapZoneShape;
  tone?: MapLayerTone;
  /** Fill opacity in `[0, 1]`; default `0.25`. */
  opacity?: number;
  /** Dashed outline + no fill — the previewed future state (storm's next ring, incoming hazard band). */
  forecast?: boolean;
  label?: string;
}

export interface MapCellStates {
  id: string;
  /** World-space center of cell (0, 0). */
  origin: MapXZ;
  cellSize: number;
  /** Sparse cell statuses — pair with `world/cellStates`' `cellsIn`/`counts` output. */
  cells: readonly { col: number; row: number; tone: MapLayerTone; opacity?: number }[];
}

/**
 * Renderer-free overlay data for map surfaces (#285.1-2): zones with live + forecast states,
 * route polylines, and per-cell status heatmaps. `@jgengine/react/map`'s `Minimap`/`WorldMap`
 * take these straight in; `pointInMapZone` answers gameplay queries against the same data,
 * so the HUD and the rules can never disagree about where the storm is.
 */
export function pointInMapZone(zone: MapZoneShape, x: number, z: number): boolean {
  if (zone.kind === "circle") {
    return Math.hypot(x - zone.center[0], z - zone.center[1]) <= zone.radius;
  }
  if (zone.kind === "rect") {
    let dx = x - zone.center[0];
    let dz = z - zone.center[1];
    if (zone.rotate !== undefined && zone.rotate !== 0) {
      const cos = Math.cos(-zone.rotate);
      const sin = Math.sin(-zone.rotate);
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      dx = rx;
      dz = rz;
    }
    return Math.abs(dx) <= zone.w / 2 && Math.abs(dz) <= zone.d / 2;
  }
  const points = zone.points;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i]!;
    const [xj, zj] = points[j]!;
    const crosses = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export const MAP_LAYER_TONE_COLORS: Record<MapLayerTone, string> = {
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#38bdf8",
  safe: "#4ade80",
  neutral: "#a1a1aa",
};

export function mapLayerColor(tone: MapLayerTone | undefined): string {
  return MAP_LAYER_TONE_COLORS[tone ?? "neutral"];
}
