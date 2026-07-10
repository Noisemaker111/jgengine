import { AxisChannel, NEUTRAL_AXIS, type AxisBindingMap, type AxisInput } from "@jgengine/core/input/axisInput";

const WRECKWAY_AXIS_BINDINGS: AxisBindingMap = {
  throttle: { positive: ["KeyW", "ArrowUp"] },
  brake: { positive: ["KeyS", "ArrowDown"] },
  steer: { positive: ["KeyD", "ArrowRight"], negative: ["KeyA", "ArrowLeft"] },
  handbrake: { positive: [] },
};

export interface DriveInput {
  attach(): void;
  detach(): void;
  sample(dt: number): AxisInput;
  isPlowBracing(): boolean;
  consumeJump(): boolean;
  consumeRestart(): boolean;
  consumeStart(): boolean;
}

export function createDriveInput(): DriveInput {
  const held = new Set<string>();
  const channel = new AxisChannel({ bindings: WRECKWAY_AXIS_BINDINGS, smoothing: 6 });
  let attached = false;
  let jumpRequested = false;
  let restartRequested = false;
  let startRequested = false;

  function onKeyDown(event: KeyboardEvent): void {
    held.add(event.code);
    if (event.code === "Space") jumpRequested = true;
    if (event.code === "KeyR") restartRequested = true;
    if (event.code === "Enter") startRequested = true;
  }

  function onKeyUp(event: KeyboardEvent): void {
    held.delete(event.code);
  }

  return {
    attach() {
      if (attached || typeof window === "undefined") return;
      attached = true;
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    },
    detach() {
      if (!attached || typeof window === "undefined") return;
      attached = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      held.clear();
      channel.reset();
    },
    sample(dt) {
      return attached ? channel.sample(dt, (code) => held.has(code)) : NEUTRAL_AXIS;
    },
    isPlowBracing() {
      return held.has("ShiftLeft") || held.has("ShiftRight");
    },
    consumeJump() {
      if (!jumpRequested) return false;
      jumpRequested = false;
      return true;
    },
    consumeRestart() {
      if (!restartRequested) return false;
      restartRequested = false;
      return true;
    },
    consumeStart() {
      if (!startRequested) return false;
      startRequested = false;
      return true;
    },
  };
}
