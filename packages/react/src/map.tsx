import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { FogCells, FogField } from "@jgengine/core/world/fog";
import {
  DEFAULT_MARKER_KINDS,
  markerKindStyle,
  type MapMarker,
  type MarkerKindStyle,
  type MarkerSet,
} from "@jgengine/core/world/markers";
import {
  bearingToCardinal,
  clampToMinimapEdge,
  compassBearing,
  headingToBearing,
  projectToMinimap,
  relativeBearing,
  unprojectFromMinimap,
  type Cardinal,
  type MinimapView,
  type WorldXZ,
} from "@jgengine/core/world/minimap";
import {
  mapLayerColor,
  type MapCellStates,
  type MapRoute,
  type MapZone,
} from "@jgengine/core/world/mapLayers";
import { createFogDataUrl } from "./fogOverlay";

type ProjectFn = (x: number, z: number) => { x: number; y: number };

interface LayerScale {
  x: (worldUnits: number) => number;
  y: (worldUnits: number) => number;
}

function routeNodes(routes: readonly MapRoute[] | undefined, project: ProjectFn, keyPrefix: string): ReactNode[] {
  if (routes === undefined) return [];
  return routes.map((route) => {
    const points = route.closed === true && route.points.length > 1 ? [...route.points, route.points[0]!] : route.points;
    const path = points.map(([x, z]) => {
      const at = project(x, z);
      return `${at.x},${at.y}`;
    });
    return (
      <polyline
        key={`${keyPrefix}-route-${route.id}`}
        data-map-route={route.id}
        points={path.join(" ")}
        fill="none"
        stroke={mapLayerColor(route.tone)}
        strokeWidth={route.width ?? 2}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
        {...(route.forecast === true ? { strokeDasharray: "6 4" } : {})}
      />
    );
  });
}

function zoneNodes(
  zones: readonly MapZone[] | undefined,
  project: ProjectFn,
  scale: LayerScale,
  keyPrefix: string,
): ReactNode[] {
  if (zones === undefined) return [];
  return zones.map((zone) => {
    const color = mapLayerColor(zone.tone);
    const forecast = zone.forecast === true;
    const fill = forecast ? "none" : color;
    const fillOpacity = forecast ? 0 : zone.opacity ?? 0.25;
    const stroke = { stroke: color, strokeWidth: 1.5, ...(forecast ? { strokeDasharray: "6 4" } : {}) };
    const shape = zone.shape;
    let node: ReactNode = null;
    let labelAt: { x: number; y: number } | null = null;
    if (shape.kind === "circle") {
      const at = project(shape.center[0], shape.center[1]);
      labelAt = at;
      node = (
        <ellipse cx={at.x} cy={at.y} rx={scale.x(shape.radius)} ry={scale.y(shape.radius)} fill={fill} fillOpacity={fillOpacity} {...stroke} />
      );
    } else {
      const corners =
        shape.kind === "rect"
          ? rectCorners(shape).map(([x, z]) => project(x, z))
          : shape.points.map(([x, z]) => project(x, z));
      labelAt = corners[0] ?? null;
      node = (
        <polygon
          points={corners.map((at) => `${at.x},${at.y}`).join(" ")}
          fill={fill}
          fillOpacity={fillOpacity}
          {...stroke}
        />
      );
    }
    return (
      <g key={`${keyPrefix}-zone-${zone.id}`} data-map-zone={zone.id} opacity={0.9}>
        {node}
        {zone.label !== undefined && labelAt !== null ? (
          <text x={labelAt.x} y={labelAt.y - 4} textAnchor="middle" fontSize={9} fill={color} style={{ fontWeight: 700 }}>
            {zone.label}
          </text>
        ) : null}
      </g>
    );
  });
}

function rectCorners(shape: { center: readonly [number, number]; w: number; d: number; rotate?: number }): readonly [number, number][] {
  const halfW = shape.w / 2;
  const halfD = shape.d / 2;
  const rotate = shape.rotate ?? 0;
  const cos = Math.cos(rotate);
  const sin = Math.sin(rotate);
  return ([[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]] as const).map(([dx, dz]) => [
    shape.center[0] + dx * cos - dz * sin,
    shape.center[1] + dx * sin + dz * cos,
  ]);
}

function cellStateNodes(
  layers: readonly MapCellStates[] | undefined,
  project: ProjectFn,
  scale: LayerScale,
  keyPrefix: string,
): ReactNode[] {
  if (layers === undefined) return [];
  const nodes: ReactNode[] = [];
  for (const layer of layers) {
    const w = scale.x(layer.cellSize);
    const h = scale.y(layer.cellSize);
    for (const cell of layer.cells) {
      const at = project(layer.origin[0] + cell.col * layer.cellSize, layer.origin[1] + cell.row * layer.cellSize);
      nodes.push(
        <rect
          key={`${keyPrefix}-${layer.id}-${cell.col}-${cell.row}`}
          x={at.x - w / 2}
          y={at.y - h / 2}
          width={w}
          height={h}
          fill={mapLayerColor(cell.tone)}
          opacity={cell.opacity ?? 0.35}
        />,
      );
    }
  }
  return nodes;
}

export function useMarkers(markers: MarkerSet): readonly MapMarker[] {
  return useSyncExternalStore(markers.subscribe, markers.snapshot, markers.snapshot);
}

export function useFog(fog: FogField): ReturnType<FogField["cells"]> {
  return useSyncExternalStore(fog.subscribe, fog.cells, fog.cells);
}

export interface MinimapProps {
  markers: MarkerSet;
  center: WorldXZ;
  worldRadius: number;
  fog?: FogField;
  size?: number;
  /** Facing yaw (`rotationY`, forward = `(sin yaw, cos yaw)`) of the tracked entity — pass it raw, never pre-converted to a bearing. */
  facingYaw?: number;
  rotate?: boolean;
  kindStyles?: Record<string, MarkerKindStyle>;
  background?: string;
  /** World bounds the `background` image spans, so it pans correctly under a player-centered map. */
  mapBounds?: MapBounds;
  /** Route/corridor polylines drawn under the markers (#285.2); `forecast` routes dash. */
  routes?: readonly MapRoute[];
  /** Zone/hazard overlays with live fills and dashed forecast outlines (#285.1). */
  zones?: readonly MapZone[];
  /** Per-cell status heatmaps (#285.1) — pair with `world/cellStates`. */
  cellStates?: readonly MapCellStates[];
  /** Click-to-pin seam (#285.6): receives the clicked world XZ via `unprojectFromMinimap`. */
  onWorldClick?: (world: WorldXZ) => void;
  className?: string;
  title?: string;
  children?: ReactNode;
}

export interface MapBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * Framed circular minimap: optional baked terrain background, reveal-on-event
 * fog overlay, categorized marker icons, and a facing arrow. Reads a core
 * `MarkerSet` / `FogField`; supply your own `kindStyles` palette to reskin.
 *
 * @capability minimap framed circular minimap with terrain bake, fog, markers, and facing arrow
 */
export function Minimap({
  markers,
  center,
  worldRadius,
  fog,
  size = 176,
  facingYaw = 0,
  rotate = false,
  kindStyles = DEFAULT_MARKER_KINDS,
  background,
  mapBounds,
  routes,
  zones,
  cellStates,
  onWorldClick,
  className,
  title = "Map",
  children,
}: MinimapProps): ReactNode {
  const markerList = useMarkers(markers);
  const fogCells = useSyncExternalStore(
    fog?.subscribe ?? NO_SUBSCRIBE,
    fog?.cells ?? NULL_CELLS,
    fog?.cells ?? NULL_CELLS,
  );
  const bearing = headingToBearing(facingYaw);
  const view = {
    center,
    worldRadius,
    size,
    ...(rotate ? { rotate: bearing } : {}),
  };
  const half = size / 2;
  const clipId = `mm-clip-${size}`;
  const sorted = [...markerList].sort(
    (a, b) => markerKindStyle(a.kind, kindStyles).priority - markerKindStyle(b.kind, kindStyles).priority,
  );

  const fogImage = useMemo(() => {
    if (fogCells === null) return null;
    const cellPx = (fogCells.cellSize / worldRadius) * half;
    return createFogDataUrl(fogCells, { width: size, height: size }, (col, row) => {
      const worldX = fogCells.minX + (col + 0.5) * fogCells.cellSize;
      const worldZ = fogCells.minZ + (row + 0.5) * fogCells.cellSize;
      const projected = projectToMinimap([worldX, worldZ], view);
      if (projected.distance > worldRadius + fogCells.cellSize) return null;
      return {
        x: projected.x - cellPx / 2 - 0.5,
        y: projected.y - cellPx / 2 - 0.5,
        width: cellPx + 1,
        height: cellPx + 1,
      };
    });
  }, [fogCells, center[0], center[1], worldRadius, size, rotate, bearing]);

  return (
    <div
      className={className}
      data-minimap
      style={{
        width: size,
        borderRadius: 14,
        padding: 8,
        background: "linear-gradient(160deg, rgba(24,28,36,0.94), rgba(12,15,20,0.94))",
        border: "1px solid rgba(148,163,184,0.28)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "rgba(203,213,225,0.75)",
        }}
      >
        <span>{title}</span>
        <span style={{ color: "rgba(148,163,184,0.6)" }}>
          {bearingToCardinal(bearing)}
        </span>
      </div>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        data-minimap-canvas
        {...(onWorldClick === undefined
          ? {}
          : {
              onClick: (event: { currentTarget: { getBoundingClientRect(): DOMRect }; clientX: number; clientY: number }) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const px = ((event.clientX - rect.left) / rect.width) * size;
                const py = ((event.clientY - rect.top) / rect.height) * size;
                onWorldClick(unprojectFromMinimap({ x: px, y: py }, view));
              },
              style: { cursor: "crosshair" as const },
            })}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx={half} cy={half} r={half - 1} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <circle cx={half} cy={half} r={half - 1} fill="#1c2733" />
          {background !== undefined
            ? (() => {
                if (mapBounds === undefined) {
                  return (
                    <image
                      href={background}
                      x={0}
                      y={0}
                      width={size}
                      height={size}
                      preserveAspectRatio="xMidYMid slice"
                      opacity={0.9}
                    />
                  );
                }
                const pxPerWorld = half / worldRadius;
                return (
                  <image
                    href={background}
                    x={half + (mapBounds.minX - center[0]) * pxPerWorld}
                    y={half + (mapBounds.minZ - center[1]) * pxPerWorld}
                    width={(mapBounds.maxX - mapBounds.minX) * pxPerWorld}
                    height={(mapBounds.maxZ - mapBounds.minZ) * pxPerWorld}
                    preserveAspectRatio="none"
                    opacity={0.92}
                  />
                );
              })()
            : null}
          {fogImage !== null ? (
            <image href={fogImage} x={0} y={0} width={size} height={size} preserveAspectRatio="none" />
          ) : null}
          {(() => {
            const projectXZ: ProjectFn = (x, z) => projectToMinimap([x, z], view);
            const pxPerWorld = worldRadius === 0 ? 0 : half / worldRadius;
            const layerScale: LayerScale = { x: (units) => units * pxPerWorld, y: (units) => units * pxPerWorld };
            return [
              ...cellStateNodes(cellStates, projectXZ, layerScale, "mm"),
              ...zoneNodes(zones, projectXZ, layerScale, "mm"),
              ...routeNodes(routes, projectXZ, "mm"),
            ];
          })()}
          <circle cx={half} cy={half} r={half - 1} fill="none" stroke="rgba(148,163,184,0.12)" />
          {sorted.map((marker) => {
            const style = markerKindStyle(marker.kind, kindStyles);
            const projected = projectToMinimap(marker.position, view);
            const at = projected.inside ? projected : clampToMinimapEdge(projected, size);
            return (
              <g key={marker.id} data-marker-kind={marker.kind}>
                <circle cx={at.x} cy={at.y} r={7} fill="rgba(2,6,12,0.55)" />
                <text
                  x={at.x}
                  y={at.y + 3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fill={style.color}
                  style={{ fontWeight: 700 }}
                >
                  {style.glyph}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${half} ${half}) rotate(${(rotate ? 0 : bearing) * (180 / Math.PI)})`}>
            <path d="M0,-9 L6,7 L0,3 L-6,7 Z" fill="#4ade80" stroke="#052e16" strokeWidth={0.75} />
          </g>
        </g>
        <circle cx={half} cy={half} r={half - 1} fill="none" stroke="rgba(148,163,184,0.4)" strokeWidth={1.5} />
        <text x={half} y={13} textAnchor="middle" fontSize={11} fill="rgba(226,232,240,0.9)" style={{ fontWeight: 700 }}>
          N
        </text>
      </svg>
      {children}
    </div>
  );
}

/** One dot (or, with `heading`, a rotated arrow) drawn by `MinimapChrome`. */
export interface MinimapChromeMarker {
  id: string;
  position: WorldXZ | readonly [number, number, number];
  /** Bearing (radians) to draw an arrow instead of a dot — pass `headingToBearing(yaw)` for the player/other facing blips. */
  heading?: number;
  color?: string;
  radius?: number;
  glyph?: string;
  glyphColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** Clamp to the minimap edge when outside `view.worldRadius` (off-screen indicator); `false` hides it instead. Default `true`. */
  clampToEdge?: boolean;
}

/** Props for `MinimapChrome`. */
export interface MinimapChromeProps {
  /** Shared with `projectToMinimap`/`clampToMinimapEdge` — pass `view.rotate` to keep a rotating map's arrows pointed correctly. */
  view: MinimapView;
  /** Ring outline (+ `cardinalLabel`). Default `false` — most games draw their own frame/panel around the chrome. */
  frame?: boolean;
  frameColor?: string;
  frameStrokeWidth?: number;
  /** Label drawn at the top of the ring when `frame` is on; `false` omits it. */
  cardinalLabel?: string | false;
  markers?: readonly MinimapChromeMarker[];
  markerColor?: string;
  markerRadius?: number;
  className?: string;
}

/**
 * Headless minimap chrome — nests inside a game's own `<svg>`: an optional
 * ring frame, and edge-clamped marker dots that draw as directional arrows
 * when a marker carries a `heading` (the compass-arrow / player-blip layer
 * ~8 games were re-drawing by hand over `projectToMinimap`/`clampToMinimapEdge`).
 * Renders a bare `<g>` — no background, panel, or title; compose your own
 * content layer (routes, zones, terrain) as sibling SVG nodes for full control
 * of z-order, or call `MinimapChrome` twice (once for `frame`, again for
 * `markers`) to sandwich custom content between the ring and the blips.
 *
 * @capability minimap-chrome ring frame plus edge-clamped, heading-aware marker dots to nest inside a game's own `<svg>`
 */
export function MinimapChrome({
  view,
  frame = false,
  frameColor = "rgba(148,163,184,0.4)",
  frameStrokeWidth = 1.5,
  cardinalLabel = "N",
  markers = [],
  markerColor = "#e2e8f0",
  markerRadius = 5,
  className,
}: MinimapChromeProps): ReactNode {
  const half = view.size / 2;
  const rotate = view.rotate ?? 0;
  return (
    <g className={className} data-minimap-chrome>
      {frame ? (
        <>
          <circle cx={half} cy={half} r={half - 1} fill="none" stroke={frameColor} strokeWidth={frameStrokeWidth} />
          {cardinalLabel !== false ? (
            <text x={half} y={13} textAnchor="middle" fontSize={11} fill={frameColor} style={{ fontWeight: 700 }}>
              {cardinalLabel}
            </text>
          ) : null}
        </>
      ) : null}
      {markers.map((marker) => {
        const projected = projectToMinimap(marker.position, view);
        const clamp = marker.clampToEdge ?? true;
        if (!projected.inside && !clamp) return null;
        const at = projected.inside ? projected : clampToMinimapEdge(projected, view.size);
        const color = marker.color ?? markerColor;
        const radius = marker.radius ?? markerRadius;
        if (marker.heading !== undefined) {
          const deg = (marker.heading - rotate) * (180 / Math.PI);
          return (
            <g key={marker.id} data-minimap-marker={marker.id} transform={`translate(${at.x} ${at.y}) rotate(${deg})`}>
              <path
                d={`M0,${-radius} L${radius * 0.7},${radius * 0.8} L0,${radius * 0.35} L${-radius * 0.7},${radius * 0.8} Z`}
                fill={color}
                stroke={marker.strokeColor ?? "rgba(0,0,0,0.6)"}
                strokeWidth={marker.strokeWidth ?? 0.75}
              />
            </g>
          );
        }
        return (
          <g key={marker.id} data-minimap-marker={marker.id}>
            <circle cx={at.x} cy={at.y} r={radius} fill={color} stroke={marker.strokeColor} strokeWidth={marker.strokeWidth} />
            {marker.glyph !== undefined ? (
              <text x={at.x} y={at.y + 3.5} textAnchor="middle" fontSize={10} fill={marker.glyphColor ?? "#0f172a"} style={{ fontWeight: 700 }}>
                {marker.glyph}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

const NO_SUBSCRIBE = (): (() => void) => () => undefined;
const NULL_CELLS = (): null => null;
const EMPTY_MARKERS_VALUE: readonly MapMarker[] = [];
const EMPTY_MARKERS = (): readonly MapMarker[] => EMPTY_MARKERS_VALUE;

const COMPASS_TICKS: readonly { cardinal: Cardinal; bearing: number }[] = [
  { cardinal: "N", bearing: 0 },
  { cardinal: "NE", bearing: Math.PI / 4 },
  { cardinal: "E", bearing: Math.PI / 2 },
  { cardinal: "SE", bearing: (3 * Math.PI) / 4 },
  { cardinal: "S", bearing: Math.PI },
  { cardinal: "SW", bearing: (5 * Math.PI) / 4 },
  { cardinal: "W", bearing: (3 * Math.PI) / 2 },
  { cardinal: "NW", bearing: (7 * Math.PI) / 4 },
];

export interface CompassProps {
  /** Facing yaw (`rotationY`, forward = `(sin yaw, cos yaw)`) of the tracked entity — pass it raw, never pre-converted to a bearing. */
  facingYaw: number;
  center?: WorldXZ;
  markers?: MarkerSet;
  width?: number;
  fov?: number;
  kindStyles?: Record<string, MarkerKindStyle>;
  className?: string;
}

/**
 * Horizontal compass strip centered on the player's facing direction, with the
 * eight cardinals and optional marker pips (bearing to each `MarkerSet` entry).
 */
export function Compass({
  facingYaw,
  center,
  markers,
  width = 340,
  fov = (Math.PI * 2) / 3,
  kindStyles = DEFAULT_MARKER_KINDS,
  className,
}: CompassProps): ReactNode {
  const markerList = useSyncExternalStore(
    markers?.subscribe ?? NO_SUBSCRIBE,
    markers?.snapshot ?? EMPTY_MARKERS,
    markers?.snapshot ?? EMPTY_MARKERS,
  );
  const facingBearing = headingToBearing(facingYaw);
  const half = fov / 2;
  const toX = (bearing: number): number | null => {
    const delta = relativeBearing(bearing, facingBearing);
    if (Math.abs(delta) > half) return null;
    return width / 2 + (delta / half) * (width / 2);
  };

  return (
    <div
      className={className}
      data-compass
      style={{
        width,
        height: 34,
        position: "relative",
        overflow: "hidden",
        borderRadius: 8,
        border: "1px solid rgba(148,163,184,0.28)",
        background: "linear-gradient(180deg, rgba(18,22,30,0.92), rgba(10,13,18,0.92))",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 1,
          background: "rgba(74,222,128,0.85)",
        }}
      />
      {COMPASS_TICKS.map((tick) => {
        const x = toX(tick.bearing);
        if (x === null) return null;
        const major = tick.cardinal.length === 1;
        return (
          <span
            key={tick.cardinal}
            style={{
              position: "absolute",
              left: x,
              top: major ? 7 : 11,
              transform: "translateX(-50%)",
              fontSize: major ? 13 : 9,
              fontWeight: major ? 700 : 500,
              color: major ? "#f8fafc" : "rgba(148,163,184,0.75)",
            }}
          >
            {tick.cardinal}
          </span>
        );
      })}
      {center !== undefined
        ? markerList.map((marker) => {
            const bearing = compassBearing(center, [marker.position[0], marker.position[2]]);
            const x = toX(bearing);
            if (x === null) return null;
            const style = markerKindStyle(marker.kind, kindStyles);
            return (
              <span
                key={marker.id}
                data-compass-marker={marker.kind}
                style={{
                  position: "absolute",
                  left: x,
                  bottom: 2,
                  transform: "translateX(-50%)",
                  fontSize: 11,
                  color: style.color,
                  fontWeight: 700,
                }}
              >
                {style.glyph}
              </span>
            );
          })
        : null}
    </div>
  );
}

function WorldMapFogImage({
  fogCells,
  project,
  worldW,
  worldD,
  width,
  mapH,
}: {
  fogCells: FogCells | null;
  project: (x: number, z: number) => { x: number; y: number };
  worldW: number;
  worldD: number;
  width: number;
  mapH: number;
}): ReactNode {
  const fogImage = useMemo(() => {
    if (fogCells === null) return null;
    const cellW = (fogCells.cellSize / worldW) * width;
    const cellH = (fogCells.cellSize / worldD) * mapH;
    return createFogDataUrl(
      fogCells,
      { width, height: mapH },
      (col, row) => {
        const at = project(
          fogCells.minX + col * fogCells.cellSize,
          fogCells.minZ + row * fogCells.cellSize,
        );
        return { x: at.x, y: at.y, width: cellW + 0.5, height: cellH + 0.5 };
      },
      "rgba(11, 15, 20, 0.86)",
    );
  }, [fogCells, project, worldW, worldD, width, mapH]);
  if (fogImage === null) return null;
  return <image href={fogImage} x={0} y={0} width={width} height={mapH} preserveAspectRatio="none" />;
}

export interface WorldMapProps {
  markers: MarkerSet;
  bounds: MapBounds;
  player?: WorldXZ;
  /** Facing yaw (`rotationY`, forward = `(sin yaw, cos yaw)`) of the player — pass it raw, never pre-converted to a bearing. */
  facingYaw?: number;
  fog?: FogField;
  background?: string;
  width?: number;
  height?: number;
  kindStyles?: Record<string, MarkerKindStyle>;
  /** Route/corridor polylines drawn under the markers (#285.2); `forecast` routes dash. */
  routes?: readonly MapRoute[];
  /** Zone/hazard overlays with live fills and dashed forecast outlines (#285.1). */
  zones?: readonly MapZone[];
  /** Per-cell status heatmaps (#285.1) — pair with `world/cellStates`. */
  cellStates?: readonly MapCellStates[];
  /** Click-to-pin seam (#285.6): receives the clicked world XZ. */
  onWorldClick?: (world: WorldXZ) => void;
  className?: string;
  title?: string;
  onClose?: () => void;
}

/**
 * Full-bounds top-down world map (the "press M" overlay): baked terrain
 * background, reveal-on-event fog, all markers with labels, and the player.
 * Rectangular linear projection over the supplied world `bounds`.
 */
export function WorldMap({
  markers,
  bounds,
  player,
  facingYaw = 0,
  fog,
  background,
  width = 520,
  height,
  kindStyles = DEFAULT_MARKER_KINDS,
  routes,
  zones,
  cellStates,
  onWorldClick,
  className,
  title = "World Map",
  onClose,
}: WorldMapProps): ReactNode {
  const markerList = useMarkers(markers);
  const fogCells = useSyncExternalStore(
    fog?.subscribe ?? NO_SUBSCRIBE,
    fog?.cells ?? NULL_CELLS,
    fog?.cells ?? NULL_CELLS,
  );
  const worldW = bounds.maxX - bounds.minX;
  const worldD = bounds.maxZ - bounds.minZ;
  const mapH = height ?? Math.round((width * worldD) / worldW);
  const project = (x: number, z: number): { x: number; y: number } => ({
    x: ((x - bounds.minX) / worldW) * width,
    y: ((z - bounds.minZ) / worldD) * mapH,
  });

  return (
    <div
      className={className}
      data-world-map
      style={{
        borderRadius: 16,
        padding: 14,
        background: "linear-gradient(160deg, rgba(20,24,32,0.97), rgba(10,13,18,0.97))",
        border: "1px solid rgba(148,163,184,0.35)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{title}</span>
        {onClose !== undefined ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid rgba(148,163,184,0.4)",
              borderRadius: 6,
              background: "transparent",
              color: "rgba(226,232,240,0.85)",
              fontSize: 11,
              padding: "3px 9px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        ) : null}
      </div>
      <svg
        width={width}
        height={mapH}
        viewBox={`0 0 ${width} ${mapH}`}
        data-world-map-canvas
        style={{ borderRadius: 10, ...(onWorldClick === undefined ? {} : { cursor: "crosshair" as const }) }}
        {...(onWorldClick === undefined
          ? {}
          : {
              onClick: (event: { currentTarget: { getBoundingClientRect(): DOMRect }; clientX: number; clientY: number }) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const px = ((event.clientX - rect.left) / rect.width) * width;
                const py = ((event.clientY - rect.top) / rect.height) * mapH;
                onWorldClick([bounds.minX + (px / width) * worldW, bounds.minZ + (py / mapH) * worldD]);
              },
            })}
      >
        <rect x={0} y={0} width={width} height={mapH} fill="#16202b" />
        {background !== undefined ? (
          <image href={background} x={0} y={0} width={width} height={mapH} preserveAspectRatio="none" opacity={0.95} />
        ) : null}
        <WorldMapFogImage fogCells={fogCells} project={project} worldW={worldW} worldD={worldD} width={width} mapH={mapH} />
        {(() => {
          const projectXZ: ProjectFn = (x, z) => project(x, z);
          const layerScale: LayerScale = {
            x: (units) => (units / worldW) * width,
            y: (units) => (units / worldD) * mapH,
          };
          return [
            ...cellStateNodes(cellStates, projectXZ, layerScale, "wm"),
            ...zoneNodes(zones, projectXZ, layerScale, "wm"),
            ...routeNodes(routes, projectXZ, "wm"),
          ];
        })()}
        {markerList.map((marker) => {
          const at = project(marker.position[0], marker.position[2]);
          const style = markerKindStyle(marker.kind, kindStyles);
          return (
            <g key={marker.id} data-world-marker={marker.kind}>
              <circle cx={at.x} cy={at.y} r={9} fill="rgba(2,6,12,0.6)" stroke={style.color} strokeWidth={1.2} />
              <text x={at.x} y={at.y + 4} textAnchor="middle" fontSize={12} fill={style.color} style={{ fontWeight: 700 }}>
                {style.glyph}
              </text>
              {marker.label !== undefined ? (
                <text x={at.x + 12} y={at.y + 4} fontSize={11} fill="rgba(226,232,240,0.85)">
                  {marker.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {player !== undefined
          ? (() => {
              const at = project(player[0], player[1]);
              return (
                <g transform={`translate(${at.x} ${at.y}) rotate(${headingToBearing(facingYaw) * (180 / Math.PI)})`}>
                  <path d="M0,-11 L7,9 L0,4 L-7,9 Z" fill="#4ade80" stroke="#052e16" strokeWidth={1} />
                </g>
              );
            })()
          : null}
      </svg>
    </div>
  );
}
