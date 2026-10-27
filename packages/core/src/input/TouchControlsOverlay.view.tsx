import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { createGestureSurfaceTracker } from "@jgengine/core/input/gestureSurface";
import { createTouchGestureTracker } from "@jgengine/core/input/touchGestures";
import {
  touchCode,
  touchSlotNumber,
  type TouchAnchor,
  type TouchButton,
  type TouchButtonShape,
  type TouchJoystick,
  type TouchJoystickVariant,
  type TouchScheme,
  type TouchStyle,
} from "@jgengine/core/input/touchScheme";
import { useRegisterLayoutRegion } from "@jgengine/core/ui/viewport.view";

import {
  DEFAULT_TOUCH_SHORT_SIDE,
  DOCK_GEOMETRY,
  UTILITY_INLINE_LIMIT,
  mainButtonIndex,
  partitionDockButtons,
  touchClusterLayout,
  touchClusterSizes,
  type TouchClusterSizes,
} from "./touchClusterLayout";
import { TouchGlyph, touchButtonFace } from "./touchIcons.view";


const MOVEMENT_ZONE = { id: "control:movement", kind: "control", collisionPolicy: "forbid", collisionGroup: "touch-dock" } as const;
const ACTIONS_ZONE = { id: "control:actions", kind: "control", collisionPolicy: "forbid", collisionGroup: "touch-dock" } as const;
const UTILITY_ZONE = { id: "control:utility", kind: "control", collisionPolicy: "warn", collisionGroup: "touch-dock" } as const;

export interface TouchCodeSink {
  onCodeDown(code: string): void;
  onCodeUp(code: string): void;
  /** Analog per-action magnitudes (0..1) from the joystick's continuous vector; `null` when the stick is released. Optional so bespoke docks that only press buttons need not care. */
  onAnalog?(values: Readonly<Record<string, number>> | null): void;
}

const JOYSTICK_SIZE = DOCK_GEOMETRY.joystick;
const JOYSTICK_THUMB = DOCK_GEOMETRY.joystickThumb;
/** Radial deflection below which the stick reads as centered; travel past it rescales to 0..1 so analog output starts from zero instead of jumping. */
const JOYSTICK_DEADZONE = 0.16;
/** Digital fallback codes fire past this per-axis deflection — kept for edge-detection consumers (`justPressed`); analog movement itself flows through `onAnalog`. */
const JOYSTICK_AXIS_THRESHOLD = 0.42;
const LOOK_TAP_TUNING = { tapMoveThresholdPx: 12, tapMaxMs: 280, longPressMs: 450 };
const RAIL_BUTTON_SIZE = DOCK_GEOMETRY.railButton;
const DOCK_BASE_PADDING = DOCK_GEOMETRY.basePadding;

/** width:height footprint of each silhouette; the longer side equals the button size. */
const SHAPE_ASPECT: Record<TouchButtonShape, { w: number; h: number }> = {
  circle: { w: 1, h: 1 },
  square: { w: 1, h: 1 },
  wheel: { w: 1, h: 1 },
  pedal: { w: 0.78, h: 1 },
  lever: { w: 0.64, h: 1 },
  trigger: { w: 0.92, h: 1 },
  tab: { w: 1.5, h: 0.72 },
};

interface StyleTokens {
  /** Main-button rim and glyph tint. */
  accent: string;
  restFill: string;
  restStroke: string;
  strokeWidth: number;
  activeFill: string;
  activeStroke: string;
  text: string;
  wrapper: string;
  activeWrapper: string;
  joyBase: CSSProperties;
  joyThumb: CSSProperties;
  chipRest: CSSProperties;
  chipActive: CSSProperties;
}

const STYLE_TOKENS: Record<TouchStyle, StyleTokens> = {
  // The default skin reads the game's HudTheme tokens, so each game's palette reskins the dock: a dark
  // translucent plate keeps the light glyph readable over bright scenery such as desert sand or sky.
  glass: {
    accent: "var(--jg-accent, #7dd3fc)",
    restFill: "color-mix(in srgb, var(--jg-surface-deep, #0b1220) 52%, transparent)",
    restStroke: "color-mix(in srgb, var(--jg-text, #ffffff) 42%, transparent)",
    strokeWidth: 2.5,
    activeFill: "color-mix(in srgb, var(--jg-accent, #7dd3fc) 55%, transparent)",
    activeStroke: "var(--jg-accent, #7dd3fc)",
    text: "var(--jg-text, rgba(255,255,255,0.94))",
    wrapper: "drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]",
    activeWrapper: "drop-shadow-[0_1px_5px_rgba(0,0,0,0.5)]",
    joyBase: {
      border: "1.5px solid color-mix(in srgb, var(--jg-text, #ffffff) 35%, transparent)",
      background: "color-mix(in srgb, var(--jg-surface-deep, #0b1220) 35%, transparent)",
      backdropFilter: "blur(4px)",
    },
    joyThumb: {
      border: "1.5px solid color-mix(in srgb, var(--jg-text, #ffffff) 60%, transparent)",
      background: "color-mix(in srgb, var(--jg-text, #ffffff) 30%, transparent)",
    },
    chipRest: {
      border: "1.5px solid color-mix(in srgb, var(--jg-text, #ffffff) 38%, transparent)",
      background: "color-mix(in srgb, var(--jg-surface-deep, #0b1220) 58%, transparent)",
      color: "var(--jg-text, rgba(255,255,255,0.92))",
      backdropFilter: "blur(4px)",
    },
    chipActive: {
      border: "1.5px solid var(--jg-accent, #7dd3fc)",
      background: "color-mix(in srgb, var(--jg-accent, #7dd3fc) 55%, transparent)",
      color: "var(--jg-text, #ffffff)",
    },
  },
  arcade: {
    accent: "rgba(240,255,255,0.95)",
    restFill: "rgba(9,12,20,0.82)",
    restStroke: "rgba(120,224,255,0.75)",
    strokeWidth: 3,
    activeFill: "rgba(120,224,255,0.9)",
    activeStroke: "rgba(240,255,255,0.95)",
    text: "rgba(190,244,255,0.95)",
    wrapper: "drop-shadow-[0_0_9px_rgba(80,200,255,0.5)]",
    activeWrapper: "drop-shadow-[0_0_16px_rgba(120,224,255,0.85)]",
    joyBase: { border: "3px solid rgba(120,224,255,0.7)", background: "rgba(9,12,20,0.8)", boxShadow: "0 0 16px rgba(80,200,255,0.4)" },
    joyThumb: { border: "2px solid rgba(240,255,255,0.9)", background: "rgba(120,224,255,0.85)" },
    chipRest: { border: "2px solid rgba(120,224,255,0.6)", background: "rgba(9,12,20,0.85)", color: "rgba(190,244,255,0.95)", fontWeight: 700 },
    chipActive: { border: "2px solid rgba(240,255,255,0.95)", background: "rgba(120,224,255,0.9)", color: "#04121a", fontWeight: 700 },
  },
  mechanical: {
    accent: "rgba(240,242,246,0.8)",
    restFill: "rgba(63,68,78,0.9)",
    restStroke: "rgba(210,214,222,0.4)",
    strokeWidth: 2.5,
    activeFill: "rgba(120,126,138,0.95)",
    activeStroke: "rgba(240,242,246,0.7)",
    text: "rgba(232,234,240,0.95)",
    wrapper: "drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]",
    activeWrapper: "drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]",
    joyBase: { border: "2px solid rgba(210,214,222,0.35)", background: "linear-gradient(180deg,rgba(78,84,94,0.92),rgba(44,48,56,0.92))", boxShadow: "0 3px 8px rgba(0,0,0,0.5)" },
    joyThumb: { border: "2px solid rgba(240,242,246,0.5)", background: "linear-gradient(180deg,rgba(150,156,166,0.95),rgba(96,102,112,0.95))" },
    chipRest: { border: "1px solid rgba(210,214,222,0.35)", background: "linear-gradient(180deg,rgba(72,78,88,0.92),rgba(40,44,52,0.92))", color: "rgba(232,234,240,0.95)" },
    chipActive: { border: "1px solid rgba(240,242,246,0.6)", background: "rgba(120,126,138,0.95)", color: "#fff" },
  },
  minimal: {
    accent: "rgba(255,255,255,0.95)",
    restFill: "rgba(0,0,0,0.001)",
    restStroke: "rgba(255,255,255,0.45)",
    strokeWidth: 1.75,
    activeFill: "rgba(255,255,255,0.14)",
    activeStroke: "rgba(255,255,255,0.85)",
    text: "rgba(255,255,255,0.85)",
    wrapper: "",
    activeWrapper: "",
    joyBase: { border: "1.5px solid rgba(255,255,255,0.4)", background: "transparent" },
    joyThumb: { border: "1.5px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.1)" },
    chipRest: { border: "1px solid rgba(255,255,255,0.35)", background: "transparent", color: "rgba(255,255,255,0.8)" },
    chipActive: { border: "1px solid rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.14)", color: "#fff" },
  },
};

/** Viewport size in CSS px the touch dock lays out against. */
export interface TouchViewport {
  width: number;
  height: number;
  /** `min(width, height)`: the cluster's buttons size from it. */
  shortSide: number;
}

const FALLBACK_VIEWPORT: TouchViewport = {
  width: DEFAULT_TOUCH_SHORT_SIDE * 2,
  height: DEFAULT_TOUCH_SHORT_SIDE,
  shortSide: DEFAULT_TOUCH_SHORT_SIDE,
};

function readViewport(): TouchViewport {
  if (typeof window === "undefined") return FALLBACK_VIEWPORT;
  const width = Math.round(window.visualViewport?.width ?? window.innerWidth);
  const height = Math.round(window.visualViewport?.height ?? window.innerHeight);
  if (!(width > 0 && height > 0)) return FALLBACK_VIEWPORT;
  return { width, height, shortSide: Math.min(width, height) };
}

/**
 * The viewport size, kept current across resizes and rotation; the touch dock sizes and reserves space from it.
 *
 * @internal
 */
export function useTouchViewport(): TouchViewport {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () =>
      setViewport((previous) => {
        const next = readViewport();
        return previous.width === next.width && previous.height === next.height ? previous : next;
      });
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return viewport;
}

function pressOnce(sink: TouchCodeSink, action: string): void {
  const code = touchCode(action);
  sink.onCodeDown(code);
  sink.onCodeUp(code);
}

export function TouchPlaySurface({
  scheme,
  sink,
  yawRef,
  pitchRef,
  maxPitch,
  onPrimaryTap,
}: {
  scheme: TouchScheme;
  sink: TouchCodeSink;
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  maxPitch: number;
  onPrimaryTap: () => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const gestureTracker = useMemo(
    () => (scheme.gestures === null ? null : createGestureSurfaceTracker(scheme.gestures)),
    [scheme],
  );
  const lookTracker = useMemo(
    () => (scheme.look ? createTouchGestureTracker(LOOK_TAP_TUNING) : null),
    [scheme],
  );

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
  };

  return (
    <div
      className="absolute inset-0 touch-none"
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" || pointerIdRef.current !== null) return;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        if (lookTracker !== null) lookTracker.begin(event.clientX, event.clientY, performance.now());
        else gestureTracker?.begin(event.clientX, event.clientY, performance.now());
      }}
      onPointerMove={(event) => {
        if (event.pointerId !== pointerIdRef.current) return;
        event.stopPropagation();
        if (lookTracker !== null) {
          const delta = lookTracker.move(event.clientX, event.clientY);
          if (delta !== null) {
            yawRef.current -= delta.dx * scheme.lookSensitivity;
            pitchRef.current = Math.max(
              -maxPitch,
              Math.min(maxPitch, pitchRef.current - delta.dy * scheme.lookSensitivity),
            );
          }
          return;
        }
        for (const action of gestureTracker?.move(event.clientX, event.clientY) ?? []) pressOnce(sink, action);
      }}
      onPointerUp={(event) => {
        if (event.pointerId !== pointerIdRef.current) return;
        event.stopPropagation();
        release(event);
        if (lookTracker !== null) {
          if (lookTracker.end(performance.now()) === "tap") {
            if (scheme.gestures?.tap !== undefined) pressOnce(sink, scheme.gestures.tap);
            else onPrimaryTap();
          }
          return;
        }
        for (const action of gestureTracker?.end(event.clientX, event.clientY, performance.now()) ?? []) {
          pressOnce(sink, action);
        }
      }}
      onPointerCancel={(event) => {
        release(event);
        lookTracker?.cancel();
        gestureTracker?.cancel();
      }}
    />
  );
}

function joystickDirections(joystick: TouchJoystick, nx: number, ny: number): Set<string> {
  const active = new Set<string>();
  if (Math.hypot(nx, ny) < JOYSTICK_DEADZONE) return active;
  if (joystick.up !== null && ny < -JOYSTICK_AXIS_THRESHOLD) active.add(joystick.up);
  if (joystick.down !== null && ny > JOYSTICK_AXIS_THRESHOLD) active.add(joystick.down);
  if (joystick.left !== null && nx < -JOYSTICK_AXIS_THRESHOLD) active.add(joystick.left);
  if (joystick.right !== null && nx > JOYSTICK_AXIS_THRESHOLD) active.add(joystick.right);
  return active;
}

/**
 * Per-action analog magnitudes for a stick deflection: radial deadzone, then travel rescaled to
 * 0..1 and split across the joystick's four mapped actions. This is what actually moves the
 * player — the digital codes above only exist for edge-detection consumers.
 */
function joystickAnalogValues(joystick: TouchJoystick, nx: number, ny: number): Record<string, number> {
  const values: Record<string, number> = {};
  const assign = (action: string | null, magnitude: number): void => {
    if (action !== null) values[action] = magnitude;
  };
  const length = Math.hypot(nx, ny);
  let dx = 0;
  let dy = 0;
  if (length >= JOYSTICK_DEADZONE) {
    const travel = Math.min(1, (length - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE));
    dx = (nx / length) * travel;
    dy = (ny / length) * travel;
  }
  assign(joystick.up, Math.max(0, -dy));
  assign(joystick.down, Math.max(0, dy));
  assign(joystick.left, Math.max(0, -dx));
  assign(joystick.right, Math.max(0, dx));
  return values;
}

/** Shared drag state machine for both joystick variants: converts pointer travel around an origin into digital edge codes + analog magnitudes, and releases both on lift. */
function useJoystickDrag(joystick: TouchJoystick, sink: TouchCodeSink) {
  const activeRef = useRef<Set<string>>(new Set());

  const applyNormalized = (nx: number, ny: number) => {
    const next = joystickDirections(joystick, nx, ny);
    for (const action of activeRef.current) {
      if (!next.has(action)) sink.onCodeUp(touchCode(action));
    }
    for (const action of next) {
      if (!activeRef.current.has(action)) sink.onCodeDown(touchCode(action));
    }
    activeRef.current = next;
    sink.onAnalog?.(joystickAnalogValues(joystick, nx, ny));
  };

  const release = () => {
    for (const action of activeRef.current) sink.onCodeUp(touchCode(action));
    activeRef.current = new Set();
    sink.onAnalog?.(null);
  };

  return { applyNormalized, release };
}

function VirtualJoystick({
  joystick,
  sink,
  tokens,
  scale = 1,
}: {
  joystick: TouchJoystick;
  sink: TouchCodeSink;
  tokens: StyleTokens;
  scale?: number;
}) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const drag = useJoystickDrag(joystick, sink);
  const size = JOYSTICK_SIZE * scale;
  const thumbSize = JOYSTICK_THUMB * scale;

  const applyVector = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    const thumb = thumbRef.current;
    if (base === null || thumb === null) return;
    const rect = base.getBoundingClientRect();
    const radius = rect.width / 2;
    let nx = (clientX - rect.left - radius) / radius;
    let ny = (clientY - rect.top - radius) / radius;
    const length = Math.hypot(nx, ny);
    if (length > 1) {
      nx /= length;
      ny /= length;
    }
    const travel = radius - thumbSize / 2;
    thumb.style.transform = `translate(${nx * travel}px, ${ny * travel}px)`;
    drag.applyNormalized(nx, ny);
  };

  const releaseAll = () => {
    pointerIdRef.current = null;
    drag.release();
    if (thumbRef.current !== null) thumbRef.current.style.transform = "translate(0px, 0px)";
  };

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto relative flex touch-none select-none items-center justify-center rounded-full"
      style={{ width: size, height: size, ...tokens.joyBase }}
      onPointerDown={(event) => {
        if (pointerIdRef.current !== null) return;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        applyVector(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.pointerId !== pointerIdRef.current) return;
        event.stopPropagation();
        applyVector(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (event.pointerId !== pointerIdRef.current) return;
        event.stopPropagation();
        releaseAll();
      }}
      onPointerCancel={() => releaseAll()}
    >
      <div ref={thumbRef} className="rounded-full" style={{ width: thumbSize, height: thumbSize, ...tokens.joyThumb }} />
    </div>
  );
}

/** Capture-zone footprint of the floating joystick — generous around the dock corner, but bounded so it never blankets HUD elements further up the screen (the zone eats pointer events). */
const FLOATING_ZONE_WIDTH = "min(42vw, 300px)";
const FLOATING_ZONE_HEIGHT = "min(40vh, 260px)";

/**
 * The floating joystick variant: its dock corner is an invisible capture zone with a faint
 * resting ring for discoverability; the stick spawns centered under wherever the thumb lands and
 * follows the same deadzone/analog math as the fixed stick. The modern mobile-shooter default —
 * the hand never has to find a fixed target mid-fight.
 */
function FloatingJoystick({
  joystick,
  sink,
  tokens,
  scale = 1,
}: {
  joystick: TouchJoystick;
  sink: TouchCodeSink;
  tokens: StyleTokens;
  scale?: number;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const baseRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const [engaged, setEngaged] = useState(false);
  const drag = useJoystickDrag(joystick, sink);
  const size = JOYSTICK_SIZE * scale;
  const thumbSize = JOYSTICK_THUMB * scale;
  const radius = size / 2;

  const applyVector = (clientX: number, clientY: number) => {
    const origin = originRef.current;
    const thumb = thumbRef.current;
    if (origin === null || thumb === null) return;
    let nx = (clientX - origin.x) / radius;
    let ny = (clientY - origin.y) / radius;
    const length = Math.hypot(nx, ny);
    if (length > 1) {
      nx /= length;
      ny /= length;
    }
    const travel = radius - thumbSize / 2;
    thumb.style.transform = `translate(${nx * travel}px, ${ny * travel}px)`;
    drag.applyNormalized(nx, ny);
  };

  const releaseAll = () => {
    pointerIdRef.current = null;
    originRef.current = null;
    setEngaged(false);
    drag.release();
    if (thumbRef.current !== null) thumbRef.current.style.transform = "translate(0px, 0px)";
  };

  return (
    <div
      className="pointer-events-auto relative touch-none select-none"
      style={{ width: FLOATING_ZONE_WIDTH, height: FLOATING_ZONE_HEIGHT }}
      onPointerDown={(event) => {
        if (pointerIdRef.current !== null) return;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        const zone = event.currentTarget.getBoundingClientRect();
        // Clamp the spawn point so the whole base stays inside the zone.
        const x = Math.min(Math.max(event.clientX, zone.left + radius), zone.right - radius);
        const y = Math.min(Math.max(event.clientY, zone.top + radius), zone.bottom - radius);
        originRef.current = { x, y };
        setEngaged(true);
        const base = baseRef.current;
        if (base !== null) {
          base.style.left = `${x - zone.left - radius}px`;
          base.style.top = `${y - zone.top - radius}px`;
        }
        applyVector(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.pointerId !== pointerIdRef.current) return;
        event.stopPropagation();
        applyVector(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (event.pointerId !== pointerIdRef.current) return;
        event.stopPropagation();
        releaseAll();
      }}
      onPointerCancel={() => releaseAll()}
    >
      {/* Resting hint ring in the corner so an idle screen still shows where movement lives. */}
      <div
        className="pointer-events-none absolute rounded-full transition-opacity"
        style={{
          width: size,
          height: size,
          left: 0,
          bottom: 0,
          opacity: engaged ? 0 : 0.4,
          ...tokens.joyBase,
        }}
      />
      <div
        ref={baseRef}
        className="pointer-events-none absolute flex items-center justify-center rounded-full"
        style={{ width: size, height: size, visibility: engaged ? "visible" : "hidden", ...tokens.joyBase }}
      >
        <div ref={thumbRef} className="rounded-full" style={{ width: thumbSize, height: thumbSize, ...tokens.joyThumb }} />
      </div>
    </div>
  );
}

function ShapeSilhouette({
  shape,
  width,
  height,
  fill,
  stroke,
  strokeWidth,
}: {
  shape: TouchButtonShape;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  // Paint through `style`, not presentation attributes: theme colours are CSS `var()`/`color-mix()` expressions.
  const common = { style: { fill, stroke, strokeWidth }, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const body = ((): ReactNode => {
    switch (shape) {
      case "circle":
        return <circle cx={50} cy={50} r={46} {...common} />;
      case "square":
        return <rect x={7} y={7} width={86} height={86} rx={20} {...common} />;
      case "wheel":
        return (
          <g {...common}>
            <circle cx={50} cy={50} r={44} />
            <circle cx={50} cy={50} r={16} style={{ fill: "none" }} />
            <path d="M50 34 V18 M36 58 L22 72 M64 58 L78 72" style={{ fill: "none" }} />
          </g>
        );
      case "pedal":
        return (
          <g {...common}>
            <path d="M30 6 h40 a10 10 0 0 1 10 10 v58 a16 16 0 0 1 -16 16 h-38 a16 16 0 0 1 -16 -16 v-58 a10 10 0 0 1 10 -10 Z" />
            <path d="M26 26 h48 M26 42 h48 M26 58 h48" style={{ fill: "none", strokeWidth: strokeWidth * 0.8 }} />
          </g>
        );
      case "lever":
        return (
          <g {...common}>
            <circle cx={50} cy={22} r={18} />
            <path d="M42 36 h16 v52 a8 8 0 0 1 -16 0 Z" />
          </g>
        );
      case "trigger":
        return <path d="M18 20 h44 a24 24 0 0 1 24 24 v10 a30 30 0 0 1 -30 30 h-24 a14 14 0 0 1 -14 -14 v-40 a10 10 0 0 1 0 -10 Z" {...common} />;
      case "tab":
        return <path d="M6 18 a12 12 0 0 1 12 -12 h124 a12 12 0 0 1 12 12 v20 a12 12 0 0 1 -12 12 h-124 a12 12 0 0 1 -12 -12 Z" {...common} />;
    }
  })();
  const viewBox = shape === "tab" ? "0 0 160 56" : "0 0 100 100";
  return (
    <svg width={width} height={height} viewBox={viewBox} className="pointer-events-none absolute inset-0">
      {body}
    </svg>
  );
}

/** Icon (or 1–3 character glyph) for a button face; never the full label. */
function ButtonFace({ button, size, color }: { button: TouchButton; size: number; color: string }) {
  const face = touchButtonFace(button);
  if (face.kind === "glyph") {
    return (
      <span style={{ color }} data-touch-face="glyph">
        <TouchGlyph name={face.name} size={Math.round(size)} />
      </span>
    );
  }
  return (
    <span
      data-touch-face="text"
      style={{
        color,
        fontFamily: "var(--jg-font-display, inherit)",
        fontWeight: 700,
        fontSize: Math.round(size * (face.text.length > 3 ? 0.42 : 0.62)),
        letterSpacing: "0.02em",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {face.text}
    </span>
  );
}

/** Holds a touch code down while a pointer is on the element; shared by every pressable in the dock. */
function usePressable(action: string, sink: TouchCodeSink) {
  const pointerIdRef = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const releaseIfHeld = () => {
    if (pointerIdRef.current === null) return;
    pointerIdRef.current = null;
    setPressed(false);
    sink.onCodeUp(touchCode(action));
  };
  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== null) return;
      pointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setPressed(true);
      sink.onCodeDown(touchCode(action));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      releaseIfHeld();
    },
    onPointerCancel: () => releaseIfHeld(),
    onContextMenu: (event: { preventDefault(): void }) => event.preventDefault(),
  };
  return { pressed, handlers };
}

function TouchActionButton({
  button,
  sink,
  tokens,
  size,
  fit,
  main = false,
}: {
  button: TouchButton;
  sink: TouchCodeSink;
  tokens: StyleTokens;
  size: number;
  /** `box` centers the silhouette in a uniform square (thumb-arc); `natural` uses the shape's own footprint (rails). */
  fit: "box" | "natural";
  /** The cluster's big fire/attack button: accent rim, and a round plate instead of the trigger paddle. */
  main?: boolean;
}) {
  const { pressed, handlers } = usePressable(button.action, sink);
  // A fire trigger reads as the big round shooter button; pedals, levers and wheels keep their silhouette.
  const shape: TouchButtonShape = main && button.shape === "trigger" ? "circle" : button.shape;
  const aspect = SHAPE_ASPECT[shape];
  const svgW = size * aspect.w;
  const svgH = size * aspect.h;
  const boxW = fit === "box" ? size : svgW;
  const boxH = fit === "box" ? size : svgH;
  const iconSize = Math.min(svgW, svgH) * (main ? 0.44 : 0.5);

  return (
    <button
      type="button"
      aria-label={button.label}
      title={button.label}
      data-touch-action={button.action}
      data-touch-shape={shape}
      data-touch-main={main ? "" : undefined}
      style={{ width: boxW, height: boxH, transform: pressed ? "scale(0.93)" : "scale(1)", transition: "transform 90ms" }}
      className={`pointer-events-auto relative flex touch-none select-none items-center justify-center ${pressed ? tokens.activeWrapper : tokens.wrapper}`}
      {...handlers}
    >
      <div className="relative" style={{ width: svgW, height: svgH }}>
        {button.image !== null ? (
          <img
            src={button.image}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            style={{ filter: pressed ? "brightness(1.25)" : undefined }}
          />
        ) : (
          <ShapeSilhouette
            shape={shape}
            width={svgW}
            height={svgH}
            fill={pressed ? tokens.activeFill : tokens.restFill}
            stroke={pressed ? tokens.activeStroke : main ? tokens.accent : tokens.restStroke}
            strokeWidth={main ? tokens.strokeWidth * 1.4 : tokens.strokeWidth}
          />
        )}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <ButtonFace button={button} size={iconSize} color={main && !pressed ? tokens.accent : tokens.text} />
        </span>
      </div>
    </button>
  );
}

/** Small round icon chip for slots and menu-type actions. */
function TouchChip({
  action,
  label,
  sink,
  tokens,
  size,
  children,
}: {
  action: string;
  label: string;
  sink: TouchCodeSink;
  tokens: StyleTokens;
  size: number;
  children: ReactNode;
}) {
  const { pressed, handlers } = usePressable(action, sink);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-touch-action={action}
      data-touch-chip=""
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: pressed ? "scale(0.92)" : undefined,
        transition: "transform 90ms",
        ...(pressed ? tokens.chipActive : tokens.chipRest),
      }}
      className="pointer-events-auto touch-none select-none"
      {...handlers}
    >
      {children}
    </button>
  );
}

function UtilityChip({ button, sink, tokens, size }: { button: TouchButton; sink: TouchCodeSink; tokens: StyleTokens; size: number }) {
  return (
    <TouchChip action={button.action} label={button.label} sink={sink} tokens={tokens} size={size}>
      <ButtonFace button={button} size={size * 0.52} color="currentColor" />
    </TouchChip>
  );
}

/** Numbered chips for slot pickers (`selectSlot1`…): one small strip instead of a big button per slot. */
function SlotStrip({ slots, sink, tokens, size, gap }: { slots: readonly string[]; sink: TouchCodeSink; tokens: StyleTokens; size: number; gap: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap }} data-touch-slots="">
      {slots.map((action, index) => {
        const number = touchSlotNumber(action) ?? index + 1;
        return (
          <TouchChip key={action} action={action} label={`Slot ${number}`} sink={sink} tokens={tokens} size={size}>
            <span style={{ fontFamily: "var(--jg-font-numeric, var(--jg-font-display, inherit))", fontWeight: 700, fontSize: Math.round(size * 0.46), lineHeight: 1 }}>
              {number}
            </span>
          </TouchChip>
        );
      })}
    </div>
  );
}

/**
 * Menu-type actions (open skills, map, inventory…) as small icon chips; past
 * {@link UTILITY_INLINE_LIMIT} they fold behind one overflow chip that opens a short list.
 */
function UtilityGroup({
  buttons,
  sink,
  tokens,
  size,
  gap,
  column = false,
  openUp = true,
}: {
  buttons: readonly TouchButton[];
  sink: TouchCodeSink;
  tokens: StyleTokens;
  size: number;
  gap: number;
  column?: boolean;
  openUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (buttons.length === 0) return null;
  if (buttons.length <= UTILITY_INLINE_LIMIT) {
    return (
      <div style={{ display: "flex", flexDirection: column ? "column" : "row", alignItems: "center", gap }}>
        {buttons.map((button) => (
          <UtilityChip key={button.action} button={button} sink={sink} tokens={tokens} size={size} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }} data-touch-overflow={open ? "open" : "closed"}>
      <button
        type="button"
        aria-label="More controls"
        aria-expanded={open}
        title="More controls"
        style={{ width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", ...(open ? tokens.chipActive : tokens.chipRest) }}
        className="pointer-events-auto touch-none select-none"
        onClick={() => setOpen((value) => !value)}
      >
        <TouchGlyph name="more" size={Math.round(size * 0.5)} />
      </button>
      {open ? (
        <div
          style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap, right: 0, ...(openUp ? { bottom: size + gap } : { top: size + gap }) }}
        >
          {buttons.map((button) => (
            <UtilityChip key={button.action} button={button} sink={sink} tokens={tokens} size={size} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The right-thumb cluster: one big main button in the corner, secondaries on tight arcs around
 * it, and a small row above for slot chips and menu-type buttons. `side` mirrors it for a
 * bottom-left dock.
 */
function ThumbArcCluster({
  buttons,
  slots,
  utility,
  sink,
  tokens,
  sizes,
  side,
}: {
  buttons: readonly TouchButton[];
  slots: readonly string[];
  utility: readonly TouchButton[];
  sink: TouchCodeSink;
  tokens: StyleTokens;
  sizes: TouchClusterSizes;
  side: "left" | "right";
}) {
  const mainIndex = mainButtonIndex(buttons);
  const main = buttons[mainIndex] ?? null;
  const secondaries = buttons.filter((_, index) => index !== mainIndex);
  const layout = touchClusterLayout(secondaries.length, sizes);
  const width = main === null ? 0 : layout.width;
  const height = main === null ? 0 : layout.height;
  const hasAux = slots.length > 0 || utility.length > 0;
  const place = (offset: { right: number; bottom: number }): CSSProperties =>
    side === "right" ? { right: offset.right, bottom: offset.bottom } : { left: offset.right, bottom: offset.bottom };
  return (
    <div className="pointer-events-none" style={{ display: "flex", flexDirection: "column", alignItems: side === "right" ? "flex-end" : "flex-start", gap: sizes.gap }}>
      {hasAux ? (
        <div style={{ display: "flex", alignItems: "center", flexDirection: side === "right" ? "row" : "row-reverse", gap: sizes.gap }} data-touch-aux="">
          <SlotStrip slots={slots} sink={sink} tokens={tokens} size={sizes.chip} gap={sizes.gap} />
          <UtilityGroup buttons={utility} sink={sink} tokens={tokens} size={sizes.chip} gap={sizes.gap} />
        </div>
      ) : null}
      {main === null ? null : (
        <div className="pointer-events-none relative" style={{ width, height }} data-touch-cluster="">
          <div className="absolute" style={place(layout.main)}>
            <TouchActionButton button={main} sink={sink} tokens={tokens} size={sizes.main} fit="box" main />
          </div>
          {secondaries.map((button, index) => {
            const offset = layout.secondaries[index];
            if (offset === undefined) return null;
            return (
              <div key={button.action} className="absolute" style={place(offset)}>
                <TouchActionButton button={button} sink={sink} tokens={tokens} size={sizes.secondary} fit="box" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Vertical rail (`left`/`right`) or a wrapping row for the remaining anchors. */
function StackCluster({
  buttons,
  utility,
  sink,
  tokens,
  column,
  scale = 1,
  sizes,
}: {
  buttons: readonly TouchButton[];
  utility: readonly TouchButton[];
  sink: TouchCodeSink;
  tokens: StyleTokens;
  column: boolean;
  scale?: number;
  sizes: TouchClusterSizes;
}) {
  return (
    <div className={`flex ${column ? "flex-col" : "flex-row flex-wrap"} items-center justify-center gap-3`}>
      {buttons.map((button) => (
        <TouchActionButton key={button.action} button={button} sink={sink} tokens={tokens} size={RAIL_BUTTON_SIZE * scale} fit="natural" />
      ))}
      <UtilityGroup buttons={utility} sink={sink} tokens={tokens} size={sizes.chip} gap={sizes.gap} column={column} />
    </div>
  );
}

const ANCHOR_POSITION: Record<TouchAnchor, CSSProperties> = {
  "bottom-left": { bottom: 0, left: 0 },
  "bottom-center": { bottom: 0, left: "50%", transform: "translateX(-50%)" },
  "bottom-right": { bottom: 0, right: 0 },
  left: { top: "50%", left: 0, transform: "translateY(-50%)" },
  right: { top: "50%", right: 0, transform: "translateY(-50%)" },
  "top-left": { top: 0, left: 0 },
  "top-center": { top: 0, left: "50%", transform: "translateX(-50%)" },
  "top-right": { top: 0, right: 0 },
};

function anchorInset(anchor: TouchAnchor): CSSProperties {
  const safeBottom = "env(safe-area-inset-bottom, 0px)";
  const safeTop = "env(safe-area-inset-top, 0px)";
  const safeLeft = "env(safe-area-inset-left, 0px)";
  const safeRight = "env(safe-area-inset-right, 0px)";
  const pad = `${DOCK_BASE_PADDING}px`;
  const style: CSSProperties = {};
  if (anchor.startsWith("bottom")) style.paddingBottom = `calc(${safeBottom} + ${pad})`;
  if (anchor.startsWith("top")) style.paddingTop = `calc(${safeTop} + ${pad})`;
  if (anchor === "left" || anchor.endsWith("left")) style.paddingLeft = `calc(${safeLeft} + ${pad})`;
  if (anchor === "right" || anchor.endsWith("right")) style.paddingRight = `calc(${safeRight} + ${pad})`;
  if (anchor === "bottom-center" || anchor === "top-center") {
    style.paddingLeft = `calc(${safeLeft} + ${pad})`;
    style.paddingRight = `calc(${safeRight} + ${pad})`;
  }
  return style;
}

function AnchoredSlot({
  anchor,
  children,
  slotRef,
  movement = false,
}: {
  anchor: TouchAnchor;
  children: ReactNode;
  slotRef?: MutableRefObject<HTMLDivElement | null>;
  movement?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute" style={{ zIndex: movement ? 10 : 40, ...ANCHOR_POSITION[anchor], ...anchorInset(anchor) }}>
      <div ref={slotRef}>{children}</div>
    </div>
  );
}

interface AnchorBucket {
  primary: TouchButton[];
  utility: TouchButton[];
}

function bucketByAnchor(buttons: readonly TouchButton[]): Map<TouchAnchor, AnchorBucket> {
  const map = new Map<TouchAnchor, AnchorBucket>();
  for (const button of buttons) {
    if (button.anchor === null) continue;
    const bucket = map.get(button.anchor) ?? { primary: [], utility: [] };
    if (button.kind === "utility") bucket.utility.push(button);
    else bucket.primary.push(button);
    map.set(button.anchor, bucket);
  }
  return map;
}

/** Buttons a game pinned to one anchor; registered as a control region so HUD panels keep clear of them. */
function AnchoredButtons({
  anchor,
  bucket,
  sink,
  tokens,
  scale,
  sizes,
}: {
  anchor: TouchAnchor;
  bucket: AnchorBucket;
  sink: TouchCodeSink;
  tokens: StyleTokens;
  scale: number;
  sizes: TouchClusterSizes;
}) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const zone = useMemo(
    () => ({ id: `control:anchored:${anchor}`, kind: "control", collisionPolicy: "forbid", collisionGroup: "touch-dock" }) as const,
    [anchor],
  );
  useRegisterLayoutRegion(zone, slotRef);
  return (
    <AnchoredSlot anchor={anchor} slotRef={slotRef}>
      <StackCluster
        buttons={bucket.primary}
        utility={bucket.utility}
        sink={sink}
        tokens={tokens}
        column={anchor === "left" || anchor === "right"}
        scale={scale}
        sizes={sizes}
      />
    </AnchoredSlot>
  );
}

const ARC_ANCHORS: ReadonlySet<TouchAnchor> = new Set(["bottom-left", "bottom-right"]);

export function TouchControlsDock({
  scheme,
  sink,
  style,
  scale = 1,
  joystickVariant = "floating",
  shortSide,
}: {
  scheme: TouchScheme;
  sink: TouchCodeSink;
  /** Player-selected skin; falls back to the scheme's game default. */
  style?: TouchStyle;
  /** Multiplies the joystick and side-rail buttons; the thumb cluster sizes from `shortSide`. */
  scale?: number;
  /** Player-selected joystick behavior (Settings → Controls). Default `floating`. */
  joystickVariant?: TouchJoystickVariant;
  /** Viewport short side in CSS px the cluster sizes from; unset measures the window. */
  shortSide?: number;
}) {
  const tokens = STYLE_TOKENS[style ?? scheme.style];
  const layout = scheme.layout;
  const measured = useTouchViewport();
  const sizes = touchClusterSizes(shortSide ?? measured.shortSide);
  const { primary, utility } = partitionDockButtons(scheme);
  const slots = scheme.slots ?? [];
  const extras = useMemo(() => bucketByAnchor(scheme.buttons), [scheme.buttons]);
  const arc = ARC_ANCHORS.has(layout.actions);
  const utilityJoinsActions = arc && layout.utility === layout.actions;

  const joystickRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const utilityRef = useRef<HTMLDivElement | null>(null);
  useRegisterLayoutRegion(MOVEMENT_ZONE, joystickRef, scheme.joystick !== null);
  useRegisterLayoutRegion(ACTIONS_ZONE, actionsRef, primary.length > 0 || slots.length > 0 || (utilityJoinsActions && utility.length > 0));
  useRegisterLayoutRegion(UTILITY_ZONE, utilityRef, utility.length > 0 && !utilityJoinsActions);

  const actionsColumn = layout.actions === "left" || layout.actions === "right";
  const utilityColumn = layout.utility === "left" || layout.utility === "right";
  const showActions = primary.length > 0 || slots.length > 0 || (utilityJoinsActions && utility.length > 0);

  return (
    <ResolvedLayout>
      {scheme.joystick !== null ? (
        <AnchoredSlot anchor={layout.movement} slotRef={joystickRef} movement>
          {joystickVariant === "floating" ? (
            <FloatingJoystick joystick={scheme.joystick} sink={sink} tokens={tokens} scale={scale} />
          ) : (
            <VirtualJoystick joystick={scheme.joystick} sink={sink} tokens={tokens} scale={scale} />
          )}
        </AnchoredSlot>
      ) : null}

      {showActions ? (
        <AnchoredSlot anchor={layout.actions} slotRef={actionsRef}>
          {arc ? (
            <ThumbArcCluster
              buttons={primary}
              slots={slots}
              utility={utilityJoinsActions ? utility : []}
              sink={sink}
              tokens={tokens}
              sizes={sizes}
              side={layout.actions === "bottom-left" ? "left" : "right"}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: actionsColumn ? "column" : "row", alignItems: "center", gap: sizes.gap }}>
              {slots.length > 0 ? <SlotStrip slots={slots} sink={sink} tokens={tokens} size={sizes.chip} gap={sizes.gap} /> : null}
              <StackCluster buttons={primary} utility={[]} sink={sink} tokens={tokens} column={actionsColumn} scale={scale} sizes={sizes} />
            </div>
          )}
        </AnchoredSlot>
      ) : null}

      {utility.length > 0 && !utilityJoinsActions ? (
        <AnchoredSlot anchor={layout.utility} slotRef={utilityRef}>
          <UtilityGroup
            buttons={utility}
            sink={sink}
            tokens={tokens}
            size={sizes.chip}
            gap={sizes.gap}
            column={utilityColumn}
            openUp={!layout.utility.startsWith("top")}
          />
        </AnchoredSlot>
      ) : null}

      {[...extras.entries()].map(([anchor, bucket]) => (
        <AnchoredButtons key={anchor} anchor={anchor} bucket={bucket} sink={sink} tokens={tokens} scale={scale} sizes={sizes} />
      ))}
    </ResolvedLayout>
  );
}

function ResolvedLayout({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute inset-0">{children}</div>;
}
