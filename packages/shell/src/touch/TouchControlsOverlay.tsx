import {
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
  type TouchAnchor,
  type TouchButton,
  type TouchButtonShape,
  type TouchJoystick,
  type TouchScheme,
  type TouchStyle,
} from "@jgengine/core/input/touchScheme";
import { GameIcon, iconForAction, isGameIconName, type GameIconName } from "@jgengine/react/gameIcons";
import { useRegisterLayoutRegion } from "@jgengine/react/gameViewport";

const MOVEMENT_ZONE = { id: "control:movement", kind: "control", collisionPolicy: "forbid", collisionGroup: "touch-dock" } as const;
const ACTIONS_ZONE = { id: "control:actions", kind: "control", collisionPolicy: "forbid", collisionGroup: "touch-dock" } as const;
const UTILITY_ZONE = { id: "control:utility", kind: "control", collisionPolicy: "warn", collisionGroup: "touch-dock" } as const;

export interface TouchCodeSink {
  onCodeDown(code: string): void;
  onCodeUp(code: string): void;
}

const JOYSTICK_SIZE = 132;
const JOYSTICK_THUMB = 52;
const JOYSTICK_DEADZONE = 0.28;
const JOYSTICK_AXIS_THRESHOLD = 0.42;
const LOOK_TAP_TUNING = { tapMoveThresholdPx: 12, tapMaxMs: 280, longPressMs: 450 };
const BUTTON_SIZE = 56;
const RAIL_BUTTON_SIZE = 64;
const RING1_RADIUS = 112;
const RING2_RADIUS = 178;
const RING1_CAPACITY = 3;
const RING2_CAPACITY = 5;
const RING1_ANGLES: readonly (readonly number[])[] = [[], [40], [16, 64], [12, 44, 76]];
const DOCK_BASE_PADDING = 20;
const UTILITY_ROW_HEIGHT = 28;

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
  glass: {
    restFill: "rgba(255,255,255,0.10)",
    restStroke: "rgba(255,255,255,0.28)",
    strokeWidth: 2,
    activeFill: "rgba(255,255,255,0.34)",
    activeStroke: "rgba(255,255,255,0.7)",
    text: "rgba(255,255,255,0.92)",
    wrapper: "drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
    activeWrapper: "drop-shadow-[0_1px_5px_rgba(0,0,0,0.4)]",
    joyBase: { border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(4px)" },
    joyThumb: { border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.25)" },
    chipRest: { border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.8)", backdropFilter: "blur(4px)" },
    chipActive: { border: "1px solid rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.25)", color: "#fff" },
  },
  arcade: {
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

function polar(radius: number, deg: number, buttonSize: number): { right: number; bottom: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    right: radius * Math.cos(rad) - buttonSize / 2,
    bottom: radius * Math.sin(rad) - buttonSize / 2,
  };
}

function ringAngles(count: number, from: number, to: number): number[] {
  if (count === 1) return [(from + to) / 2];
  const step = (to - from) / (count - 1);
  return Array.from({ length: count }, (_, index) => from + index * step);
}

/**
 * Thumb-arc placement for primary buttons around the bottom-right corner:
 * up to three on an inner ring, the rest on an outer ring. Null means too
 * many buttons for an arc — the dock falls back to a wrapping grid.
 */
export function primaryButtonOffsets(count: number, scale = 1): { right: number; bottom: number }[] | null {
  if (count === 0) return [];
  if (count > RING1_CAPACITY + RING2_CAPACITY) return null;
  const button = BUTTON_SIZE * scale;
  const ring1 = RING1_ANGLES[Math.min(count, RING1_CAPACITY)] ?? [];
  const offsets = ring1.map((angle) => polar(RING1_RADIUS * scale, angle, button));
  const rest = count - ring1.length;
  if (rest > 0) {
    for (const angle of ringAngles(rest, 10, 80)) offsets.push(polar(RING2_RADIUS * scale, angle, button));
  }
  return offsets;
}

function primaryClusterExtent(count: number, scale = 1): number {
  if (count === 0) return 0;
  if (count <= RING1_CAPACITY) return (RING1_RADIUS + BUTTON_SIZE / 2) * scale;
  if (count <= RING1_CAPACITY + RING2_CAPACITY) return (RING2_RADIUS + BUTTON_SIZE / 2) * scale;
  return Math.ceil(count / 4) * (BUTTON_SIZE + 12) * scale;
}

const BOTTOM_ANCHORS: ReadonlySet<TouchAnchor> = new Set(["bottom-left", "bottom-center", "bottom-right"]);
const ARC_ANCHORS: ReadonlySet<TouchAnchor> = new Set(["bottom-left", "bottom-right"]);

/**
 * Vertical space (px, excluding device safe areas) that *bottom-docked* clusters
 * occupy above the bottom edge. The shell publishes it as
 * `--jg-hud-dock-clearance` so `HudCanvas` regions never collide with touch
 * controls. Side rails and top clusters reserve their own rectangles through the
 * layout registry instead of this scalar.
 */
export function touchDockClearance(scheme: TouchScheme | null, scale = 1): number {
  if (scheme === null) return 0;
  const layout = scheme.layout;
  let primary = 0;
  let utility = 0;
  for (const button of scheme.buttons) {
    if (button.anchor !== null) continue;
    if (button.kind === "utility") utility += 1;
    else primary += 1;
  }
  const heights: number[] = [];
  if (scheme.joystick !== null && BOTTOM_ANCHORS.has(layout.movement)) heights.push(JOYSTICK_SIZE * scale);
  if (primary > 0 && BOTTOM_ANCHORS.has(layout.actions)) {
    heights.push(ARC_ANCHORS.has(layout.actions) ? primaryClusterExtent(primary, scale) : RAIL_BUTTON_SIZE * scale + 12);
  }
  if (utility > 0 && BOTTOM_ANCHORS.has(layout.utility)) heights.push(UTILITY_ROW_HEIGHT);
  const tallest = heights.length === 0 ? 0 : Math.max(...heights);
  if (tallest === 0) return 0;
  return tallest + DOCK_BASE_PADDING + 12;
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
  const activeRef = useRef<Set<string>>(new Set());
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
    const next = joystickDirections(joystick, nx, ny);
    for (const action of activeRef.current) {
      if (!next.has(action)) sink.onCodeUp(touchCode(action));
    }
    for (const action of next) {
      if (!activeRef.current.has(action)) sink.onCodeDown(touchCode(action));
    }
    activeRef.current = next;
  };

  const releaseAll = () => {
    pointerIdRef.current = null;
    for (const action of activeRef.current) sink.onCodeUp(touchCode(action));
    activeRef.current = new Set();
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

function touchButtonIcon(button: TouchButton): GameIconName | null {
  if (button.icon === false) return null;
  if (button.icon !== null && isGameIconName(button.icon)) return button.icon;
  return iconForAction(button.action);
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
  const common = { fill, stroke, strokeWidth, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const body = ((): ReactNode => {
    switch (shape) {
      case "circle":
        return <circle cx={50} cy={50} r={46} {...common} />;
      case "square":
        return <rect x={7} y={7} width={86} height={86} rx={20} {...common} />;
      case "wheel":
        return (
          <g {...common}>
            <circle cx={50} cy={50} r={44} fill={fill} />
            <circle cx={50} cy={50} r={16} fill="none" />
            <path d="M50 34 V18 M36 58 L22 72 M64 58 L78 72" fill="none" />
          </g>
        );
      case "pedal":
        return (
          <g {...common}>
            <path d="M30 6 h40 a10 10 0 0 1 10 10 v58 a16 16 0 0 1 -16 16 h-38 a16 16 0 0 1 -16 -16 v-58 a10 10 0 0 1 10 -10 Z" />
            <path d="M26 26 h48 M26 42 h48 M26 58 h48" fill="none" strokeWidth={strokeWidth * 0.8} />
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

function TouchActionButton({
  button,
  sink,
  tokens,
  size,
  fit,
}: {
  button: TouchButton;
  sink: TouchCodeSink;
  tokens: StyleTokens;
  size: number;
  /** `box` centers the silhouette in a uniform square (thumb-arc); `natural` uses the shape's own footprint (rails). */
  fit: "box" | "natural";
}) {
  const pointerIdRef = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const icon = touchButtonIcon(button);
  const aspect = SHAPE_ASPECT[button.shape];
  const svgW = size * aspect.w;
  const svgH = size * aspect.h;
  const boxW = fit === "box" ? size : svgW;
  const boxH = fit === "box" ? size : svgH;
  const iconSize = Math.round(Math.min(svgW, svgH) * 0.46);

  const releaseIfHeld = () => {
    if (pointerIdRef.current === null) return;
    pointerIdRef.current = null;
    setPressed(false);
    sink.onCodeUp(touchCode(button.action));
  };

  return (
    <button
      type="button"
      aria-label={button.label}
      data-touch-shape={button.shape}
      style={{ width: boxW, height: boxH, transform: pressed ? "scale(0.93)" : "scale(1)", transition: "transform 90ms" }}
      className={`pointer-events-auto relative flex touch-none select-none items-center justify-center ${pressed ? tokens.activeWrapper : tokens.wrapper}`}
      onPointerDown={(event) => {
        if (pointerIdRef.current !== null) return;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPressed(true);
        sink.onCodeDown(touchCode(button.action));
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        releaseIfHeld();
      }}
      onPointerCancel={() => releaseIfHeld()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="relative" style={{ width: svgW, height: svgH }}>
        <ShapeSilhouette
          shape={button.shape}
          width={svgW}
          height={svgH}
          fill={pressed ? tokens.activeFill : tokens.restFill}
          stroke={pressed ? tokens.activeStroke : tokens.restStroke}
          strokeWidth={tokens.strokeWidth}
        />
        <span
          className="absolute inset-0 flex items-center justify-center text-center text-[10px] font-semibold uppercase leading-tight tracking-wide"
          style={{ color: tokens.text }}
        >
          {icon !== null ? <GameIcon name={icon} size={iconSize} /> : <span className="px-1">{button.label}</span>}
        </span>
      </div>
    </button>
  );
}

function TouchUtilityChip({ button, sink, tokens }: { button: TouchButton; sink: TouchCodeSink; tokens: StyleTokens }) {
  const pointerIdRef = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);

  const releaseIfHeld = () => {
    if (pointerIdRef.current === null) return;
    pointerIdRef.current = null;
    setPressed(false);
    sink.onCodeUp(touchCode(button.action));
  };

  return (
    <button
      type="button"
      aria-label={button.label}
      style={pressed ? tokens.chipActive : tokens.chipRest}
      className="pointer-events-auto flex h-7 touch-none select-none items-center rounded-full px-3 text-[10px] font-semibold uppercase tracking-wide"
      onPointerDown={(event) => {
        if (pointerIdRef.current !== null) return;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPressed(true);
        sink.onCodeDown(touchCode(button.action));
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        releaseIfHeld();
      }}
      onPointerCancel={() => releaseIfHeld()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {button.label}
    </button>
  );
}

function ThumbArcCluster({
  buttons,
  sink,
  tokens,
  scale = 1,
}: {
  buttons: readonly TouchButton[];
  sink: TouchCodeSink;
  tokens: StyleTokens;
  scale?: number;
}) {
  const offsets = primaryButtonOffsets(buttons.length, scale);
  if (offsets === null) {
    return (
      <div className="flex max-w-[60%] flex-wrap items-end justify-end gap-3">
        {buttons.map((button) => (
          <TouchActionButton key={button.action} button={button} sink={sink} tokens={tokens} size={BUTTON_SIZE * scale} fit="box" />
        ))}
      </div>
    );
  }
  const extent = primaryClusterExtent(buttons.length, scale);
  return (
    <div className="pointer-events-none relative" style={{ width: extent, height: extent }}>
      {buttons.map((button, index) => {
        const offset = offsets[index];
        return (
          <div key={button.action} className="absolute" style={{ right: offset?.right ?? 0, bottom: offset?.bottom ?? 0 }}>
            <TouchActionButton button={button} sink={sink} tokens={tokens} size={BUTTON_SIZE * scale} fit="box" />
          </div>
        );
      })}
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
}: {
  buttons: readonly TouchButton[];
  utility: readonly TouchButton[];
  sink: TouchCodeSink;
  tokens: StyleTokens;
  column: boolean;
  scale?: number;
}) {
  return (
    <div className={`flex ${column ? "flex-col" : "flex-row flex-wrap"} items-center justify-center gap-3`}>
      {buttons.map((button) => (
        <TouchActionButton key={button.action} button={button} sink={sink} tokens={tokens} size={RAIL_BUTTON_SIZE * scale} fit="natural" />
      ))}
      {utility.map((button) => (
        <TouchUtilityChip key={button.action} button={button} sink={sink} tokens={tokens} />
      ))}
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
}: {
  anchor: TouchAnchor;
  children: ReactNode;
  slotRef?: MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="pointer-events-none absolute z-40" style={{ ...ANCHOR_POSITION[anchor], ...anchorInset(anchor) }}>
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

export function TouchControlsDock({
  scheme,
  sink,
  style,
  scale = 1,
}: {
  scheme: TouchScheme;
  sink: TouchCodeSink;
  /** Player-selected skin; falls back to the scheme's game default. */
  style?: TouchStyle;
  scale?: number;
}) {
  const tokens = STYLE_TOKENS[style ?? scheme.style];
  const layout = scheme.layout;
  const docked = scheme.buttons.filter((button) => button.anchor === null);
  const primary = docked.filter((button) => button.kind !== "utility");
  const utility = docked.filter((button) => button.kind === "utility");
  const extras = useMemo(() => bucketByAnchor(scheme.buttons), [scheme.buttons]);

  const joystickRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const utilityRef = useRef<HTMLDivElement | null>(null);
  useRegisterLayoutRegion(MOVEMENT_ZONE, joystickRef, scheme.joystick !== null);
  useRegisterLayoutRegion(ACTIONS_ZONE, actionsRef, primary.length > 0);
  useRegisterLayoutRegion(UTILITY_ZONE, utilityRef, utility.length > 0);

  const actionsColumn = layout.actions === "left" || layout.actions === "right";
  const utilityColumn = layout.utility === "left" || layout.utility === "right";

  return (
    <ResolvedLayout>
      {scheme.joystick !== null ? (
        <AnchoredSlot anchor={layout.movement} slotRef={joystickRef}>
          <VirtualJoystick joystick={scheme.joystick} sink={sink} tokens={tokens} scale={scale} />
        </AnchoredSlot>
      ) : null}

      {primary.length > 0 ? (
        <AnchoredSlot anchor={layout.actions} slotRef={actionsRef}>
          {ARC_ANCHORS.has(layout.actions) ? (
            <ThumbArcCluster buttons={primary} sink={sink} tokens={tokens} scale={scale} />
          ) : (
            <StackCluster buttons={primary} utility={[]} sink={sink} tokens={tokens} column={actionsColumn} scale={scale} />
          )}
        </AnchoredSlot>
      ) : null}

      {utility.length > 0 ? (
        <AnchoredSlot anchor={layout.utility} slotRef={utilityRef}>
          <StackCluster buttons={[]} utility={utility} sink={sink} tokens={tokens} column={utilityColumn} scale={scale} />
        </AnchoredSlot>
      ) : null}

      {[...extras.entries()].map(([anchor, bucket]) => (
        <AnchoredSlot key={anchor} anchor={anchor}>
          <StackCluster
            buttons={bucket.primary}
            utility={bucket.utility}
            sink={sink}
            tokens={tokens}
            column={anchor === "left" || anchor === "right"}
            scale={scale}
          />
        </AnchoredSlot>
      ))}
    </ResolvedLayout>
  );
}

function ResolvedLayout({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute inset-0 z-40">{children}</div>;
}
