import { useMemo, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";

import { createGestureSurfaceTracker } from "@jgengine/core/input/gestureSurface";
import { createTouchGestureTracker } from "@jgengine/core/input/touchGestures";
import { touchCode, type TouchButton, type TouchJoystick, type TouchScheme } from "@jgengine/core/input/touchScheme";
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
const RING1_RADIUS = 112;
const RING2_RADIUS = 178;
const RING1_CAPACITY = 3;
const RING2_CAPACITY = 5;
const RING1_ANGLES: readonly (readonly number[])[] = [[], [40], [16, 64], [12, 44, 76]];
const DOCK_BASE_PADDING = 20;
const UTILITY_ROW_HEIGHT = 28;

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

/**
 * Vertical space (px, excluding device safe areas) the dock occupies above
 * the bottom edge. The shell publishes it as `--jg-hud-dock-clearance` so
 * `HudCanvas` regions never collide with touch controls.
 */
export function touchDockClearance(scheme: TouchScheme | null, scale = 1): number {
  if (scheme === null) return 0;
  let primary = 0;
  let utility = 0;
  for (const button of scheme.buttons) {
    if (button.kind === "utility") utility += 1;
    else primary += 1;
  }
  const tallest = Math.max(
    scheme.joystick !== null ? JOYSTICK_SIZE * scale : 0,
    primaryClusterExtent(primary, scale),
    utility > 0 ? UTILITY_ROW_HEIGHT : 0,
  );
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

function VirtualJoystick({ joystick, sink, scale = 1 }: { joystick: TouchJoystick; sink: TouchCodeSink; scale?: number }) {
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
      className="pointer-events-auto relative flex touch-none select-none items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-sm"
      style={{ width: size, height: size }}
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
      <div
        ref={thumbRef}
        className="rounded-full border border-white/30 bg-white/25"
        style={{ width: thumbSize, height: thumbSize }}
      />
    </div>
  );
}

function touchButtonIcon(button: TouchButton): GameIconName | null {
  if (button.icon === false) return null;
  if (button.icon !== null && isGameIconName(button.icon)) return button.icon;
  return iconForAction(button.action);
}

function TouchActionButton({ button, sink, scale = 1 }: { button: TouchButton; sink: TouchCodeSink; scale?: number }) {
  const pointerIdRef = useRef<number | null>(null);
  const icon = touchButtonIcon(button);
  const size = BUTTON_SIZE * scale;

  const releaseIfHeld = () => {
    if (pointerIdRef.current === null) return;
    pointerIdRef.current = null;
    sink.onCodeUp(touchCode(button.action));
  };

  return (
    <button
      type="button"
      aria-label={button.label}
      style={{ width: size, height: size }}
      className="pointer-events-auto flex touch-none select-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/90 backdrop-blur-sm active:border-white/50 active:bg-white/30"
      onPointerDown={(event) => {
        if (pointerIdRef.current !== null) return;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        sink.onCodeDown(touchCode(button.action));
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        releaseIfHeld();
      }}
      onPointerCancel={() => releaseIfHeld()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {icon !== null ? <GameIcon name={icon} size={Math.round(26 * scale)} /> : <span className="px-1">{button.label}</span>}
    </button>
  );
}

function TouchUtilityChip({ button, sink }: { button: TouchButton; sink: TouchCodeSink }) {
  const pointerIdRef = useRef<number | null>(null);

  const releaseIfHeld = () => {
    if (pointerIdRef.current === null) return;
    pointerIdRef.current = null;
    sink.onCodeUp(touchCode(button.action));
  };

  return (
    <button
      type="button"
      aria-label={button.label}
      className="pointer-events-auto flex h-7 touch-none select-none items-center rounded-full border border-white/20 bg-black/40 px-3 text-[10px] font-semibold uppercase tracking-wide text-white/80 backdrop-blur-sm active:border-white/50 active:bg-white/25"
      onPointerDown={(event) => {
        if (pointerIdRef.current !== null) return;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
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

function PrimaryButtonCluster({ buttons, sink, scale = 1 }: { buttons: readonly TouchButton[]; sink: TouchCodeSink; scale?: number }) {
  const offsets = primaryButtonOffsets(buttons.length, scale);
  if (offsets === null) {
    return (
      <div className="flex max-w-[60%] flex-wrap items-end justify-end gap-3">
        {buttons.map((button) => (
          <TouchActionButton key={button.action} button={button} sink={sink} scale={scale} />
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
          <div
            key={button.action}
            className="absolute"
            style={{ right: offset?.right ?? 0, bottom: offset?.bottom ?? 0 }}
          >
            <TouchActionButton button={button} sink={sink} scale={scale} />
          </div>
        );
      })}
    </div>
  );
}

export function TouchControlsDock({ scheme, sink, scale = 1 }: { scheme: TouchScheme; sink: TouchCodeSink; scale?: number }) {
  const primary = scheme.buttons.filter((button) => button.kind !== "utility");
  const utility = scheme.buttons.filter((button) => button.kind === "utility");
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const utilityRef = useRef<HTMLDivElement | null>(null);
  useRegisterLayoutRegion(MOVEMENT_ZONE, joystickRef, scheme.joystick !== null);
  useRegisterLayoutRegion(ACTIONS_ZONE, actionsRef, primary.length > 0);
  useRegisterLayoutRegion(UTILITY_ZONE, utilityRef, utility.length > 0);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40"
      style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${DOCK_BASE_PADDING}px)` }}
    >
      <div className="flex items-end justify-between gap-4 px-5">
        <div ref={joystickRef}>
          {scheme.joystick !== null ? <VirtualJoystick joystick={scheme.joystick} sink={sink} scale={scale} /> : null}
        </div>
        <div ref={actionsRef}>
          <PrimaryButtonCluster buttons={primary} sink={sink} scale={scale} />
        </div>
      </div>
      {utility.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
        >
          <div ref={utilityRef} className="flex gap-2">
            {utility.map((button) => (
              <TouchUtilityChip key={button.action} button={button} sink={sink} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
