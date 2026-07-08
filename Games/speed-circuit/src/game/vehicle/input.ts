import { AxisChannel, DRIVE_AXIS_BINDINGS, NEUTRAL_AXIS, type AxisInput } from "@jgengine/core/input/axisInput";

const held = new Set<string>();
const channel = new AxisChannel({ bindings: DRIVE_AXIS_BINDINGS, smoothing: 7 });

let attached = false;
let restartRequested = false;

function onKeyDown(event: KeyboardEvent): void {
  held.add(event.code);
  if (event.code === "KeyR") restartRequested = true;
}

function onKeyUp(event: KeyboardEvent): void {
  held.delete(event.code);
}

export function attachDriveInput(): () => void {
  if (attached || typeof window === "undefined") return () => {};
  attached = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  return () => {
    attached = false;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    held.clear();
    channel.reset();
  };
}

export function sampleDriveInput(dt: number): AxisInput {
  return attached ? channel.sample(dt, (code) => held.has(code)) : NEUTRAL_AXIS;
}

export function consumeRestart(): boolean {
  if (!restartRequested) return false;
  restartRequested = false;
  return true;
}
