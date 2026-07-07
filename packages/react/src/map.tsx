import { useSyncExternalStore, type ReactNode } from "react";
import type { FogField } from "@jgengine/core/world/fog";
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
  projectToMinimap,
  relativeBearing,
  type Cardinal,
  type WorldXZ,
} from "@jgengine/core/world/minimap";

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
  heading?: number;
  rotate?: boolean;
  kindStyles?: Record<string, MarkerKindStyle>;
  background?: string;
  /** World bounds the `background` image spans, so it pans correctly under a player-centered map. */
  mapBounds?: MapBounds;
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
 */
export function Minimap({
  markers,
  center,
  worldRadius,
  fog,
  size = 176,
  heading = 0,
  rotate = false,
  kindStyles = DEFAULT_MARKER_KINDS,
  background,
  mapBounds,
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
  const view = {
    center,
    worldRadius,
    size,
    ...(rotate ? { rotate: -heading } : {}),
  };
  const half = size / 2;
  const clipId = `mm-clip-${size}`;
  const sorted = [...markerList].sort(
    (a, b) => markerKindStyle(a.kind, kindStyles).priority - markerKindStyle(b.kind, kindStyles).priority,
  );

  const fogRects: ReactNode[] = [];
  if (fogCells !== null) {
    const cellPx = (fogCells.cellSize / worldRadius) * half;
    for (let row = 0; row < fogCells.rows; row += 1) {
      for (let col = 0; col < fogCells.cols; col += 1) {
        if (fogCells.revealed[row * fogCells.cols + col]) continue;
        const worldX = fogCells.minX + (col + 0.5) * fogCells.cellSize;
        const worldZ = fogCells.minZ + (row + 0.5) * fogCells.cellSize;
        const projected = projectToMinimap([worldX, worldZ], view);
        if (projected.distance > worldRadius + fogCells.cellSize) continue;
        fogRects.push(
          <rect
            key={`fog-${col}-${row}`}
            x={projected.x - cellPx / 2 - 0.5}
            y={projected.y - cellPx / 2 - 0.5}
            width={cellPx + 1}
            height={cellPx + 1}
            fill="#0b0f14"
            opacity={0.82}
          />,
        );
      }
    }
  }

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
          {bearingToCardinal(heading)}
        </span>
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} data-minimap-canvas>
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
          {fogRects}
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
          <g transform={`translate(${half} ${half}) rotate(${(rotate ? 0 : heading) * (180 / Math.PI)})`}>
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
  heading: number;
  center?: WorldXZ;
  markers?: MarkerSet;
  width?: number;
  fov?: number;
  kindStyles?: Record<string, MarkerKindStyle>;
  className?: string;
}

/**
 * Horizontal compass strip centered on the player's facing bearing, with the
 * eight cardinals and optional marker pips (bearing to each `MarkerSet` entry).
 */
export function Compass({
  heading,
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
  const half = fov / 2;
  const toX = (bearing: number): number | null => {
    const delta = relativeBearing(bearing, heading);
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

export interface WorldMapProps {
  markers: MarkerSet;
  bounds: MapBounds;
  player?: WorldXZ;
  heading?: number;
  fog?: FogField;
  background?: string;
  width?: number;
  height?: number;
  kindStyles?: Record<string, MarkerKindStyle>;
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
  heading = 0,
  fog,
  background,
  width = 520,
  height,
  kindStyles = DEFAULT_MARKER_KINDS,
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
      <svg width={width} height={mapH} viewBox={`0 0 ${width} ${mapH}`} data-world-map-canvas style={{ borderRadius: 10 }}>
        <rect x={0} y={0} width={width} height={mapH} fill="#16202b" />
        {background !== undefined ? (
          <image href={background} x={0} y={0} width={width} height={mapH} preserveAspectRatio="none" opacity={0.95} />
        ) : null}
        {fogCells !== null
          ? (() => {
              const cellW = (fogCells.cellSize / worldW) * width;
              const cellH = (fogCells.cellSize / worldD) * mapH;
              const rects: ReactNode[] = [];
              for (let row = 0; row < fogCells.rows; row += 1) {
                for (let col = 0; col < fogCells.cols; col += 1) {
                  if (fogCells.revealed[row * fogCells.cols + col]) continue;
                  const at = project(
                    fogCells.minX + col * fogCells.cellSize,
                    fogCells.minZ + row * fogCells.cellSize,
                  );
                  rects.push(
                    <rect
                      key={`wfog-${col}-${row}`}
                      x={at.x}
                      y={at.y}
                      width={cellW + 0.5}
                      height={cellH + 0.5}
                      fill="#0b0f14"
                      opacity={0.86}
                    />,
                  );
                }
              }
              return rects;
            })()
          : null}
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
                <g transform={`translate(${at.x} ${at.y}) rotate(${heading * (180 / Math.PI)})`}>
                  <path d="M0,-11 L7,9 L0,4 L-7,9 Z" fill="#4ade80" stroke="#052e16" strokeWidth={1} />
                </g>
              );
            })()
          : null}
      </svg>
    </div>
  );
}
