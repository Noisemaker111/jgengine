import { useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { FogCells, FogField } from "@jgengine/core/world/fog";
import {
  DEFAULT_MARKER_KINDS,
  markerKindStyle,
  type MapMarker,
  type MarkerCollection,
  type MarkerKindStyle,
  type MarkerSource,
  type MarkerSet,
  type MarkerView,
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

interface MarkerAccess<TMarker extends MarkerView> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => readonly TMarker[];
  getServerSnapshot: () => readonly TMarker[];
}

function markerAccess(markers: MarkerCollection): MarkerAccess<MarkerView> {
  if (Array.isArray(markers)) {
    const snapshot = markers as readonly MarkerView[];
    return { subscribe: NO_SUBSCRIBE, getSnapshot: () => snapshot, getServerSnapshot: () => snapshot };
  }
  if ("getSnapshot" in markers) {
    const source = markers as MarkerSource;
    return {
      subscribe: (listener) => source.subscribe(listener),
      getSnapshot: () => source.getSnapshot(),
      getServerSnapshot: () => (source.getServerSnapshot ?? source.getSnapshot).call(source),
    };
  }
  const markerSet = markers as MarkerSet;
  return {
    subscribe: (listener) => markerSet.subscribe(listener),
    getSnapshot: () => markerSet.snapshot(),
    getServerSnapshot: () => markerSet.snapshot(),
  };
}

/** Subscribe to a native marker set or external marker source, or read a static marker array. */
export function useMarkers<TMeta = unknown>(markers: MarkerSet<TMeta>): readonly MapMarker<TMeta>[];
export function useMarkers<TMarker extends MarkerView>(
  markers: readonly TMarker[] | MarkerSource<TMarker>,
): readonly TMarker[];
export function useMarkers(markers: MarkerCollection): readonly MarkerView[];
export function useMarkers(markers: MarkerCollection): readonly MarkerView[] {
  const access = useMemo(() => markerAccess(markers), [markers]);
  return useSyncExternalStore(access.subscribe, access.getSnapshot, access.getServerSnapshot);
}

export function useFog(fog: FogField): ReturnType<FogField["cells"]> {
  return useSyncExternalStore(fog.subscribe, fog.cells, fog.cells);
}

export interface MinimapProps {
  /** Static views, an external marker source, or a native JGengine MarkerSet. */
  markers: MarkerCollection;
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
  /** Caller-owned outer chrome overrides, applied after the built-in defaults. */
  style?: CSSProperties;
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
 * fog overlay, categorized marker icons, and a facing arrow. Reads static
 * marker views, an external marker source, or a native `MarkerSet`; supply
 * your own `kindStyles` palette to reskin. Does not require `GameProvider`.
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
  style,
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
  const sorted = useMemo(
    () =>
      [...markerList].sort(
        (a, b) => markerKindStyle(a.kind, kindStyles).priority - markerKindStyle(b.kind, kindStyles).priority,
      ),
    [markerList, kindStyles],
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
        // Ring color reads the shared HudTheme `--jg-ring` token (#1034); fallback = the built-in ring.
        border: "1px solid var(--jg-ring, rgba(148,163,184,0.28))",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        ...style,
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
            const kind = marker.kind ?? "marker";
            const style = markerKindStyle(kind, kindStyles);
            const projected = projectToMinimap(marker.position, view);
            const at = projected.inside ? projected : clampToMinimapEdge(projected, size);
            return (
              <g key={marker.id} data-marker-kind={kind}>
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
const EMPTY_MARKERS_VALUE: readonly MarkerView[] = [];

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
  markers?: MarkerCollection;
  width?: number;
  fov?: number;
  kindStyles?: Record<string, MarkerKindStyle>;
  className?: string;
}

/**
 * Horizontal compass strip centered on the player's facing direction, with the
 * eight cardinals and optional marker pips from static views, an external
 * source, or a native `MarkerSet`.
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
  const markerList = useMarkers(markers ?? EMPTY_MARKERS_VALUE);
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
            const kind = marker.kind ?? "marker";
            const style = markerKindStyle(kind, kindStyles);
            return (
              <span
                key={marker.id}
                data-compass-marker={kind}
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

/** Props for `MinimapPanel` — all `MinimapProps` plus the zone-label/clock header and compass slots. */
export interface MinimapPanelProps extends MinimapProps {
  /** Zone/area name slot rendered in the chrome header — the game supplies its own zone lookup. */
  zoneLabel?: ReactNode;
  /** Clock readout slot rendered in the chrome header — pair with `useGameClock()` + `calendar()`. */
  clock?: ReactNode;
  /** Compass strip beneath the circle. Default true; pass `false` to omit it entirely. */
  showCompass?: boolean;
  compassProps?: Partial<Omit<CompassProps, "className">>;
  headerClassName?: string;
  zoneLabelClassName?: string;
  clockClassName?: string;
  compassClassName?: string;
}

/**
 * Composed circular-minimap chrome: optional zone-label + clock header above
 * the `Minimap`, optional `Compass` strip below. Purely a wiring layer over
 * the existing primitives — the game supplies the zone name and clock text,
 * this only places them; omit either slot and the header disappears.
 *
 * @capability minimap-panel circular minimap with zone label, clock, and compass composed together
 */
export function MinimapPanel({
  zoneLabel,
  clock,
  showCompass = true,
  compassProps,
  headerClassName,
  zoneLabelClassName,
  clockClassName,
  compassClassName,
  children,
  ...minimapProps
}: MinimapPanelProps): ReactNode {
  const hasHeader = zoneLabel !== undefined || clock !== undefined;
  return (
    <div data-minimap-chrome>
      {hasHeader ? (
        <div
          className={headerClassName}
          data-minimap-chrome-header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 4,
            width: minimapProps.size ?? 176,
            color: "#e2e8f0",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          {zoneLabel !== undefined ? (
            <span className={zoneLabelClassName} data-minimap-chrome-zone style={{ fontSize: 12, fontWeight: 700 }}>
              {zoneLabel}
            </span>
          ) : (
            <span />
          )}
          {clock !== undefined ? (
            <span
              className={clockClassName}
              data-minimap-chrome-clock
              style={{ fontSize: 11, color: "rgba(226,232,240,0.75)" }}
            >
              {clock}
            </span>
          ) : null}
        </div>
      ) : null}
      <Minimap {...minimapProps}>{children}</Minimap>
      {showCompass ? (
        <div className={compassClassName} data-minimap-chrome-compass style={{ marginTop: 6 }}>
          <Compass
            facingYaw={minimapProps.facingYaw ?? 0}
            center={minimapProps.center}
            markers={minimapProps.markers}
            width={minimapProps.size ?? 176}
            {...compassProps}
          />
        </div>
      ) : null}
    </div>
  );
}

/** A colored span across the {@link MinimapTrack} rail, given by 0..1 `start`/`end` fractions (e.g. from core `trackFraction`). */
export interface MinimapTrackSpan {
  id: string;
  /** 0..1 fraction where the span starts. */
  start: number;
  /** 0..1 fraction where the span ends. */
  end: number;
  /** Fill color; defaults to a translucent white. */
  color?: string;
  /** Tooltip / accessible label for the span. */
  label?: string;
}

/** A point marker on the {@link MinimapTrack} rail at a 0..1 fraction (e.g. a gate, the exit, or the player). */
export interface MinimapTrackPip {
  id: string;
  /** 0..1 fraction along the rail. */
  at: number;
  /** Marker color; defaults to the rail foreground. */
  color?: string;
  /** Accessible label for the marker. */
  label?: string;
  /** Tooltip text (rendered as the `title` attribute). */
  title?: string;
  /** Silhouette: `gate` (thin tall bar) or a `dot`/`exit`/`player` circle of increasing size (default `dot`). */
  shape?: "gate" | "dot" | "exit" | "player";
}

/** Props for {@link MinimapTrack}. */
export interface MinimapTrackProps {
  /** Colored zone spans painted along the rail. */
  spans?: readonly MinimapTrackSpan[];
  /** Point markers (gates, exit, player) placed by 0..1 fraction. */
  pips?: readonly MinimapTrackPip[];
  /** Rail width (default `100%`). */
  width?: number | string;
  /** Rail thickness in px (default 12). */
  height?: number;
  /** Rail track color (default `rgba(255,255,255,0.10)`). */
  railColor?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const TRACK_PIP_DIAMETER: Record<"dot" | "exit" | "player", number> = {
  dot: 6,
  exit: 8,
  player: 12,
};

/**
 * Horizontal linear track minimap — a rounded progress rail with colored zone
 * `spans` and gate/exit/player `pips` positioned by 0..1 fraction. The
 * structural counterpart to the radial {@link Minimap} for corridor/route
 * games: fractions are supplied by the caller (via core `trackFraction`), so it
 * reads no store and stays presentation-only, sharing chrome with the radial
 * minimap.
 *
 * @capability minimap-track-hud horizontal linear track minimap (corridor/route progress) — colored zone spans and gate/player pips positioned by 0..1 fraction, sharing chrome with the radial Minimap
 */
export function MinimapTrack({
  spans = [],
  pips = [],
  width = "100%",
  height = 12,
  railColor = "rgba(255,255,255,0.10)",
  className,
  style,
  children,
}: MinimapTrackProps): ReactNode {
  return (
    <div
      className={className}
      data-minimap-track
      style={{ position: "relative", width, height, borderRadius: 9999, background: railColor, ...style }}
    >
      {spans.map((span) => (
        <div
          key={span.id}
          data-track-span={span.id}
          title={span.label}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${span.start * 100}%`,
            width: `${(span.end - span.start) * 100}%`,
            background: span.color ?? "rgba(255,255,255,0.25)",
            opacity: 0.4,
            borderRadius: 9999,
          }}
        />
      ))}
      {pips.map((pip) => {
        const shape = pip.shape ?? "dot";
        const color = pip.color ?? "#f4f6fb";
        const common: CSSProperties = {
          position: "absolute",
          top: "50%",
          left: `${pip.at * 100}%`,
          transform: "translate(-50%, -50%)",
          background: color,
        };
        if (shape === "gate") {
          return (
            <div
              key={pip.id}
              data-track-pip={pip.id}
              data-pip-shape="gate"
              title={pip.title ?? pip.label}
              style={{ ...common, width: 3, height: height + 6, borderRadius: 2 }}
            />
          );
        }
        const diameter = TRACK_PIP_DIAMETER[shape];
        return (
          <div
            key={pip.id}
            data-track-pip={pip.id}
            data-pip-shape={shape}
            title={pip.title ?? pip.label}
            style={{ ...common, width: diameter, height: diameter, borderRadius: 9999, border: "1px solid rgba(0,0,0,0.6)" }}
          />
        );
      })}
      {children}
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
  /** Static views, an external marker source, or a native JGengine MarkerSet. */
  markers: MarkerCollection;
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

/** Pan/zoom transform applied to a {@link WorldMapSurface}'s content group. */
export interface MapViewport {
  /** Uniform zoom factor; 1 = fit. */
  scale: number;
  /** Content-group translation in canvas px. */
  tx: number;
  ty: number;
}

const IDENTITY_VIEWPORT: MapViewport = { scale: 1, tx: 0, ty: 0 };

/** Props for {@link WorldMapSurface}. */
export interface WorldMapSurfaceProps {
  markers: MarkerCollection;
  bounds: MapBounds;
  player?: WorldXZ;
  facingYaw?: number;
  fog?: FogField;
  background?: string;
  /** Content layout width in px (world bounds map into this). */
  width?: number;
  /** Content layout height; defaults to the bounds aspect ratio. */
  height?: number;
  kindStyles?: Record<string, MarkerKindStyle>;
  routes?: readonly MapRoute[];
  zones?: readonly MapZone[];
  cellStates?: readonly MapCellStates[];
  onWorldClick?: (world: WorldXZ) => void;
  /** Outer `<svg>` pixel size; defaults to the content `width`/`height` (no viewport). */
  canvasWidth?: number;
  canvasHeight?: number;
  /** Pan/zoom transform; identity when omitted. Click math inverts it before unprojecting. */
  viewport?: MapViewport;
  style?: CSSProperties;
}

/**
 * The bare top-down map `<svg>` shared by {@link WorldMap} (framed panel) and
 * {@link FullscreenMap} (pan/zoom overlay): baked terrain background, fog, map
 * layers, markers with labels, and the player arrow, drawn under an optional
 * viewport transform. Rectangular linear projection over the world `bounds`.
 */
export function WorldMapSurface({
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
  canvasWidth,
  canvasHeight,
  viewport = IDENTITY_VIEWPORT,
  style,
}: WorldMapSurfaceProps): ReactNode {
  const markerList = useMarkers(markers);
  const fogCells = useSyncExternalStore(
    fog?.subscribe ?? NO_SUBSCRIBE,
    fog?.cells ?? NULL_CELLS,
    fog?.cells ?? NULL_CELLS,
  );
  const worldW = bounds.maxX - bounds.minX;
  const worldD = bounds.maxZ - bounds.minZ;
  const mapH = height ?? Math.round((width * worldD) / worldW);
  const svgW = canvasWidth ?? width;
  const svgH = canvasHeight ?? mapH;
  const project = (x: number, z: number): { x: number; y: number } => ({
    x: ((x - bounds.minX) / worldW) * width,
    y: ((z - bounds.minZ) / worldD) * mapH,
  });

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      data-world-map-canvas
      style={{ borderRadius: 10, ...(onWorldClick === undefined ? {} : { cursor: "crosshair" as const }), ...style }}
      {...(onWorldClick === undefined
        ? {}
        : {
            onClick: (event: { currentTarget: { getBoundingClientRect(): DOMRect }; clientX: number; clientY: number }) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const sx = ((event.clientX - rect.left) / rect.width) * svgW;
              const sy = ((event.clientY - rect.top) / rect.height) * svgH;
              const px = (sx - viewport.tx) / viewport.scale;
              const py = (sy - viewport.ty) / viewport.scale;
              onWorldClick([bounds.minX + (px / width) * worldW, bounds.minZ + (py / mapH) * worldD]);
            },
          })}
    >
      <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`} data-world-map-content>
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
          const kind = marker.kind ?? "marker";
          const markerStyle = markerKindStyle(kind, kindStyles);
          return (
            <g key={marker.id} data-world-marker={kind}>
              <circle cx={at.x} cy={at.y} r={9} fill="rgba(2,6,12,0.6)" stroke={markerStyle.color} strokeWidth={1.2} />
              <text x={at.x} y={at.y + 4} textAnchor="middle" fontSize={12} fill={markerStyle.color} style={{ fontWeight: 700 }}>
                {markerStyle.glyph}
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
      </g>
    </svg>
  );
}

/**
 * Full-bounds top-down world map (the "press M" overlay): baked terrain
 * background, reveal-on-event fog, all markers with labels, and the player.
 * Rectangular linear projection over the supplied world `bounds`. Framed panel
 * wrapper over {@link WorldMapSurface}.
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
      <WorldMapSurface
        markers={markers}
        bounds={bounds}
        player={player}
        facingYaw={facingYaw}
        fog={fog}
        background={background}
        width={width}
        height={height}
        kindStyles={kindStyles}
        routes={routes}
        zones={zones}
        cellStates={cellStates}
        onWorldClick={onWorldClick}
      />
    </div>
  );
}

function clampScale(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Props for {@link FullscreenMap}. */
export interface FullscreenMapProps extends Omit<WorldMapSurfaceProps, "canvasWidth" | "canvasHeight" | "viewport" | "width" | "height" | "style"> {
  /** Render nothing when false. Default true. */
  open?: boolean;
  /** Content layout width in px before zoom; height derives from the bounds aspect. Default 900. */
  contentWidth?: number;
  /** Zoom bounds. Default 0.5 / 8. */
  minScale?: number;
  maxScale?: number;
  title?: string;
  onClose?: () => void;
  /** Overlay chrome drawn above the map (legend, tool palette, hints). */
  children?: ReactNode;
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
}

/**
 * Fullscreen pan/zoom world-map overlay — the enlarged "press M" map. Wheel to
 * zoom (toward the cursor), drag to pan, and click to place (wire `onWorldClick`
 * to a waypoint/annotation store). Reuses {@link WorldMapSurface} for rendering,
 * so terrain bake, fog, routes, zones, markers, and the player arrow all appear;
 * a drag never fires `onWorldClick`. Compose a {@link MapLegend} or tool palette
 * via `children`.
 *
 * @capability fullscreen-map fullscreen pan/zoom world-map overlay over WorldMapSurface — wheel-zoom, drag-pan, and click-to-place without firing a click after a pan
 */
export function FullscreenMap({
  open = true,
  bounds,
  contentWidth = 900,
  minScale = 0.5,
  maxScale = 8,
  title = "Map",
  onClose,
  onWorldClick,
  children,
  overlayClassName,
  overlayStyle,
  ...surfaceProps
}: FullscreenMapProps): ReactNode {
  const worldW = bounds.maxX - bounds.minX;
  const worldD = bounds.maxZ - bounds.minZ;
  const contentHeight = Math.round((contentWidth * worldD) / worldW);
  const [viewport, setViewport] = useState<MapViewport>(IDENTITY_VIEWPORT);
  const drag = useRef<{ x: number; y: number; vp: MapViewport } | null>(null);
  const moved = useRef(false);

  if (!open) return null;

  const zoomBy = (factor: number, sx: number, sy: number): void => {
    setViewport((prev) => {
      const next = clampScale(prev.scale * factor, minScale, maxScale);
      const k = next / prev.scale;
      return { scale: next, tx: sx - k * (sx - prev.tx), ty: sy - k * (sy - prev.ty) };
    });
  };

  const canvasPoint = (
    event: { currentTarget: { getBoundingClientRect(): DOMRect }; clientX: number; clientY: number },
  ): { x: number; y: number; kx: number; ky: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    const kx = contentWidth / rect.width;
    const ky = contentHeight / rect.height;
    return { x: (event.clientX - rect.left) * kx, y: (event.clientY - rect.top) * ky, kx, ky };
  };

  const controlButton: CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid rgba(148,163,184,0.4)",
    background: "rgba(17,22,30,0.85)",
    color: "#e2e8f0",
    fontSize: 16,
    lineHeight: "1",
    cursor: "pointer",
  };

  return (
    <div
      className={overlayClassName}
      data-fullscreen-map
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        background: "rgba(6,9,14,0.82)",
        backdropFilter: "blur(2px)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        ...overlayStyle,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid rgba(148,163,184,0.2)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase" }}>{title}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" aria-label="Zoom out" style={controlButton} onClick={() => zoomBy(1 / 1.2, contentWidth / 2, contentHeight / 2)}>
            −
          </button>
          <button type="button" aria-label="Zoom in" style={controlButton} onClick={() => zoomBy(1.2, contentWidth / 2, contentHeight / 2)}>
            +
          </button>
          <button type="button" aria-label="Reset view" style={{ ...controlButton, width: "auto", padding: "0 10px", fontSize: 11 }} onClick={() => setViewport(IDENTITY_VIEWPORT)}>
            Reset
          </button>
          {onClose !== undefined ? (
            <button type="button" aria-label="Close map" style={{ ...controlButton, width: "auto", padding: "0 12px", fontSize: 11 }} onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
      </div>
      <div
        data-fullscreen-map-viewport
        style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", touchAction: "none", cursor: drag.current !== null ? "grabbing" : "grab" }}
        onWheel={(event) => {
          const at = canvasPoint(event);
          zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, at.x, at.y);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = { x: event.clientX, y: event.clientY, vp: viewport };
          moved.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (state === null) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const kx = contentWidth / rect.width;
          const ky = contentHeight / rect.height;
          const dx = (event.clientX - state.x) * kx;
          const dy = (event.clientY - state.y) * ky;
          if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
          setViewport({ scale: state.vp.scale, tx: state.vp.tx + dx, ty: state.vp.ty + dy });
        }}
        onPointerUp={(event) => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <WorldMapSurface
          {...surfaceProps}
          bounds={bounds}
          width={contentWidth}
          height={contentHeight}
          canvasWidth={contentWidth}
          canvasHeight={contentHeight}
          viewport={viewport}
          style={{ width: "100%", height: "100%", borderRadius: 0, display: "block" }}
          onWorldClick={
            onWorldClick === undefined
              ? undefined
              : (world) => {
                  if (moved.current) {
                    moved.current = false;
                    return;
                  }
                  onWorldClick(world);
                }
          }
        />
        {children}
      </div>
    </div>
  );
}

/** Props for {@link MapLegend}. */
export interface MapLegendProps {
  /** Marker kinds to key, in order. */
  kinds: readonly string[];
  /** Human labels per kind; falls back to the kind id. */
  labels?: Record<string, string>;
  kindStyles?: Record<string, MarkerKindStyle>;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Marker-kind key for a map/minimap — glyph + color swatch per kind, labelled.
 * Reads the same `kindStyles` the map renders with, so the legend can never
 * drift from the pins.
 *
 * @capability map-legend marker-kind key (glyph + color + label per kind) sharing the map's kindStyles
 */
export function MapLegend({
  kinds,
  labels,
  kindStyles = DEFAULT_MARKER_KINDS,
  title = "Legend",
  className,
  style,
}: MapLegendProps): ReactNode {
  return (
    <div
      className={className}
      data-map-legend
      style={{
        borderRadius: 10,
        padding: "8px 10px",
        background: "rgba(12,16,22,0.86)",
        border: "1px solid rgba(148,163,184,0.28)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 11,
        ...style,
      }}
    >
      {title !== "" ? (
        <div style={{ fontSize: 9, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(203,213,225,0.7)", marginBottom: 5 }}>
          {title}
        </div>
      ) : null}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {kinds.map((kind) => {
          const kindStyle = markerKindStyle(kind, kindStyles);
          return (
            <li key={kind} data-legend-kind={kind} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span aria-hidden style={{ width: 14, textAlign: "center", color: kindStyle.color, fontWeight: 700 }}>
                {kindStyle.glyph}
              </span>
              <span>{labels?.[kind] ?? kind}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Props for {@link WaypointArrow}. */
export interface WaypointArrowProps {
  /** Bearing to the target relative to facing (radians); 0 = dead ahead. From `WaypointStore.guidance().relative`. */
  relative: number;
  /** XZ distance in world units; renders a readout when supplied. */
  distance?: number;
  label?: string;
  /** Format the distance readout; defaults to whole units + "m". */
  formatDistance?: (distance: number) => string;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * On-screen guide arrow to the tracked waypoint — a HUD compass needle rotated
 * by the facing-relative bearing, with an optional label and distance readout.
 * Pair with `WaypointStore.guidance(playerXZ, facingYaw)`.
 *
 * @capability waypoint-arrow on-screen HUD guide arrow to a tracked waypoint, rotated by facing-relative bearing with a distance readout
 */
export function WaypointArrow({
  relative,
  distance,
  label,
  formatDistance = (value) => `${Math.round(value)}m`,
  size = 44,
  color = "#f59e0b",
  className,
  style,
}: WaypointArrowProps): ReactNode {
  return (
    <div
      className={className}
      data-waypoint-arrow
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        color,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        textShadow: "0 1px 2px rgba(0,0,0,0.9)",
        ...style,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden data-waypoint-arrow-needle>
        <g transform={`rotate(${(relative * 180) / Math.PI} 22 22)`}>
          <path d="M22 6 L32 34 L22 27 L12 34 Z" fill={color} stroke="rgba(0,0,0,0.7)" strokeWidth={1.2} strokeLinejoin="round" />
        </g>
      </svg>
      {label !== undefined ? (
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</span>
      ) : null}
      {distance !== undefined ? (
        <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", color: "rgba(226,232,240,0.9)" }}>
          {formatDistance(distance)}
        </span>
      ) : null}
    </div>
  );
}
