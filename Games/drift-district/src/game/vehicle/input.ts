import { AxisChannel, DRIVE_AXIS_BINDINGS, NEUTRAL_AXIS, type AxisInput } from "@jgengine/core/input/axisInput";

export interface DriveInput {
  attach(): void;
  detach(): void;
  sample(dt: number): AxisInput;
  consumeRestart(): boolean;
  consumeBoost(): boolean;
  consumeConfirm(): boolean;
}

export function createDriveInput(): DriveInput {
  const held = new Set<string>();
  const channel = new AxisChannel({ bindings: DRIVE_AXIS_BINDINGS, smoothing: 7 });
  let attached = false;
  let restartRequested = false;
  let boostRequested = false;
  let confirmRequested = false;

  function onKeyDown(event: KeyboardEvent): void {
    held.add(event.code);
    if (event.code === "KeyR") restartRequested = true;
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") boostRequested = true;
    if (event.code === "Enter") confirmRequested = true;
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
    consumeRestart() {
      if (!restartRequested) return false;
      restartRequested = false;
      return true;
    },
    consumeBoost() {
      if (!boostRequested) return false;
      boostRequested = false;
      return true;
    },
    consumeConfirm() {
      if (!confirmRequested) return false;
      confirmRequested = false;
      return true;
    },
  };
}
