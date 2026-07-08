import { useMemo, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";

import { createGestureSurfaceTracker } from "@jgengine/core/input/gestureSurface";
import { createTouchGestureTracker } from "@jgengine/core/input/touchGestures";
import { touchCode, type TouchButton, type TouchJoystick, type TouchScheme } from "@jgengine/core/input/touchScheme";
import { GameIcon, iconForAction, isGameIconName, type GameIconName } from "@jgengine/react/gameui/icons";

export interface TouchCodeSink {
  onCodeDown(code: string): void;
  onCodeUp(code: string): void;
}

const JOYSTICK_SIZE = 132;
const JOYSTICK_THUMB = 52;
const JOYSTICK_DEADZONE = 0.28;
const JOYSTICK_AXIS_THRESHOLD = 0.42;
const LOOK_TAP_TUNING = { tapMoveThresholdPx: 12, tapMaxMs: 280, longPressMs: 450 };

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

function VirtualJoystick({ joystick, sink }: { joystick: TouchJoystick; sink: TouchCodeSink }) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const activeRef = useRef<Set<string>>(new Set());

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
    const travel = radius - JOYSTICK_THUMB / 2;
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
      style={{ width: JOYSTICK_SIZE, height: JOYSTICK_SIZE }}
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
        style={{ width: JOYSTICK_THUMB, height: JOYSTICK_THUMB }}
      />
    </div>
  );
}

function touchButtonIcon(button: TouchButton): GameIconName | null {
  if (button.icon === false) return null;
  if (button.icon !== null && isGameIconName(button.icon)) return button.icon;
  return iconForAction(button.action);
}

function TouchActionButton({ button, sink }: { button: TouchButton; sink: TouchCodeSink }) {
  const pointerIdRef = useRef<number | null>(null);
  const icon = touchButtonIcon(button);

  const releaseIfHeld = () => {
    if (pointerIdRef.current === null) return;
    pointerIdRef.current = null;
    sink.onCodeUp(touchCode(button.action));
  };

  return (
    <button
      type="button"
      aria-label={button.label}
      className="pointer-events-auto flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/90 backdrop-blur-sm active:border-white/50 active:bg-white/30"
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
      {icon !== null ? <GameIcon name={icon} size={26} /> : <span className="px-1">{button.label}</span>}
    </button>
  );
}

export function TouchControlsDock({ scheme, sink }: { scheme: TouchScheme; sink: TouchCodeSink }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex items-end justify-between gap-4 px-5"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
    >
      <div>{scheme.joystick !== null ? <VirtualJoystick joystick={scheme.joystick} sink={sink} /> : null}</div>
      <div className="flex max-w-[60%] flex-wrap items-end justify-end gap-3">
        {scheme.buttons.map((button) => (
          <TouchActionButton key={button.action} button={button} sink={sink} />
        ))}
      </div>
    </div>
  );
}
