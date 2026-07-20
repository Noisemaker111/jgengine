import { useReducer, useEffect, type CSSProperties, type ReactNode } from "react";

import {
  layoutScreenMarker,
  type ScreenMarkerLayout,
  type Waypoint,
  type WaypointTracker,
} from "@jgengine/core/ui/screenMarkers";
import { formatDistance, type DistanceFormat } from "@jgengine/core/format/distance";

import type { ProjectEntity } from "./entityFrames";

/**
 * Subscribe to a {@link WaypointTracker} and re-render on every change, returning
 * its current waypoints. Pass a plain array instead and it is returned as-is
 * (no subscription), so a game can drive the host from a tracker or from its own
 * derived state.
 *
 * @capability use-waypoints React binding that returns a waypoint tracker's live list (or a passthrough array)
 */
export function useWaypoints(source: WaypointTracker | readonly Waypoint[]): readonly Waypoint[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const isTracker = !Array.isArray(source);
  useEffect(() => {
    if (isTracker) return (source as WaypointTracker).subscribe(bump);
    return undefined;
  }, [source, isTracker]);
  return isTracker ? (source as WaypointTracker).all() : (source as readonly Waypoint[]);
}

/** Reskin tokens for {@link WaypointMarkers}. Per-`kind` color layers on top via `kindColors`. */
export interface WaypointMarkerTheme {
  /** Default marker color (pin fill, arrow fill, label accent). Default reads `--jg-accent`. */
  color?: string;
  /** Label/text color. Default near-white. */
  text?: string;
  /** Label chip background. */
  chipBg?: string;
  /** Font family. */
  fontFamily?: string;
  /** Pixel size of the pin dot / arrow glyph. Default `22`. */
  size?: number;
}

function resolveTheme(theme: WaypointMarkerTheme | undefined): Required<WaypointMarkerTheme> {
  return {
    color: theme?.color ?? "var(--jg-accent, #38bdf8)",
    text: theme?.text ?? "#f8fafc",
    chipBg: theme?.chipBg ?? "rgba(8,11,16,0.82)",
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
    size: theme?.size ?? 22,
  };
}

/** Props for {@link WaypointMarkers}. */
export interface WaypointMarkersProps {
  /** A live {@link WaypointTracker} or a plain waypoint array. */
  entries: WaypointTracker | readonly Waypoint[];
  /**
   * World→screen projector — caller-owned, so this seam never depends on a
   * specific camera. R3F games get one from `useWorldProjection` in
   * `@jgengine/shell/world/WorldEntityFrames`; return `null` to skip a waypoint.
   */
  project: ProjectEntity;
  /** Viewport size (CSS px) markers are laid out within. */
  viewport: { width: number; height: number };
  /**
   * 3D distance (world units) from the camera/player to a waypoint, for the
   * off-screen arrow's distance label. Caller-owned; return `undefined` to omit
   * the label. When absent, no distance is shown.
   */
  distanceOf?: (waypoint: Waypoint) => number | undefined;
  /** How to format {@link distanceOf}'s meters. Default `{ unit: "auto" }`. */
  distanceFormat?: DistanceFormat;
  /** Base reskin tokens. */
  theme?: WaypointMarkerTheme;
  /**
   * Per-`kind` color keyed by the free-string `kind` a game sets ("objective",
   * "loot", "ally", …). The model never interprets `kind` — this is pure styling.
   */
  kindColors?: Record<string, string>;
  /**
   * Inset (px) from each edge that off-screen arrows clamp inside. Forwarded to
   * `layoutScreenMarker`. Default `28`.
   */
  margin?: number;
  /** Also show a label next to on-screen pins. Default `true`. */
  showPinLabels?: boolean;
  className?: string;
  style?: CSSProperties;
}

// One reused layout object — the host lays out every waypoint per render without
// allocating a result per marker (see layoutScreenMarker's `out`).
const scratch: ScreenMarkerLayout = { onScreen: false, x: 0, y: 0, angle: 0 };

/**
 * Off-screen objective / waypoint markers: an absolutely-positioned overlay that
 * turns a set of world waypoints into on-screen pins and off-screen directional
 * arrows. For each waypoint it calls the caller's `project` to get a screen point,
 * then {@link layoutScreenMarker} to decide: an in-view target renders a pin (and
 * optional label) at its projected spot; an off-screen or behind-camera target
 * renders an arrow clamped to the viewport edge, rotated to point the way, with an
 * optional distance label from `distanceOf`. Color comes from `theme` plus a
 * per-`kind` `kindColors` map the game owns — the model never interprets `kind`.
 * Presentation only: tracking, projection, and distance are all caller-supplied.
 *
 * @capability waypoint-markers overlay rendering world waypoints as on-screen pins and off-screen edge-clamped directional arrows with distance, colored per game-owned kind
 */
export function WaypointMarkers({
  entries,
  project,
  viewport,
  distanceOf,
  distanceFormat,
  theme,
  kindColors,
  margin = 28,
  showPinLabels = true,
  className,
  style,
}: WaypointMarkersProps): ReactNode {
  const waypoints = useWaypoints(entries);
  const t = resolveTheme(theme);

  const rendered: ReactNode[] = [];
  for (const waypoint of waypoints) {
    const projection = project(waypoint.position);
    if (projection === null) continue;
    const layout = layoutScreenMarker(projection, viewport, { margin, out: scratch });
    const color = kindColors?.[waypoint.kind] ?? t.color;
    const distance = distanceOf?.(waypoint);
    const distanceText =
      distance === undefined ? undefined : formatDistance(distance, distanceFormat ?? { unit: "auto" });

    rendered.push(
      layout.onScreen ? (
        <WaypointPin
          key={waypoint.id}
          waypoint={waypoint}
          x={layout.x}
          y={layout.y}
          color={color}
          theme={t}
          label={showPinLabels ? waypoint.label : undefined}
          distanceText={distanceText}
        />
      ) : (
        <WaypointArrow
          key={waypoint.id}
          waypoint={waypoint}
          x={layout.x}
          y={layout.y}
          angle={layout.angle}
          color={color}
          theme={t}
          distanceText={distanceText}
        />
      ),
    );
  }

  return (
    <div
      className={className}
      data-waypoint-markers=""
      style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }}
    >
      {rendered}
    </div>
  );
}

function chipStyle(theme: Required<WaypointMarkerTheme>, color: string): CSSProperties {
  return {
    padding: "2px 7px",
    borderRadius: 9999,
    background: theme.chipBg,
    border: `1px solid ${color}`,
    color: theme.text,
    fontFamily: theme.fontFamily,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
    textShadow: "0 1px 2px rgba(0,0,0,0.9)",
  };
}

interface PinProps {
  waypoint: Waypoint;
  x: number;
  y: number;
  color: string;
  theme: Required<WaypointMarkerTheme>;
  label: string | undefined;
  distanceText: string | undefined;
}

/** An on-screen pin: a dot at the projected point with an optional label/distance chip above it. */
function WaypointPin({ waypoint, x, y, color, theme, label, distanceText }: PinProps): ReactNode {
  const dot = theme.size * 0.7;
  const caption = [label, distanceText].filter((part) => part !== undefined).join("  ");
  return (
    <div
      data-waypoint-pin={waypoint.id}
      data-kind={waypoint.kind}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      {caption.length > 0 ? <div style={chipStyle(theme, color)}>{caption}</div> : null}
      <div
        aria-hidden="true"
        style={{
          width: dot,
          height: dot,
          borderRadius: "50%",
          background: color,
          border: "2px solid rgba(255,255,255,0.9)",
          boxShadow: `0 0 10px ${color}, 0 2px 6px rgba(0,0,0,0.6)`,
        }}
      />
    </div>
  );
}

interface ArrowProps {
  waypoint: Waypoint;
  x: number;
  y: number;
  angle: number;
  color: string;
  theme: Required<WaypointMarkerTheme>;
  distanceText: string | undefined;
}

/** An edge-clamped directional arrow: a triangle rotated by `angle` with an optional distance chip. */
function WaypointArrow({ waypoint, x, y, angle, color, theme, distanceText }: ArrowProps): ReactNode {
  const size = theme.size;
  const caption = [waypoint.label, distanceText].filter((part) => part !== undefined).join("  ");
  return (
    <div
      data-waypoint-arrow={waypoint.id}
      data-kind={waypoint.kind}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        // Point the triangle (drawn pointing right at 0rad) along the bearing.
        style={{ transform: `rotate(${angle}rad)`, display: "block", filter: `drop-shadow(0 0 6px ${color})` }}
      >
        <path d="M22 12 L6 21 L11 12 L6 3 Z" fill={color} stroke="rgba(255,255,255,0.85)" strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
      {caption.length > 0 ? <div style={chipStyle(theme, color)}>{caption}</div> : null}
    </div>
  );
}
