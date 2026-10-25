import type { InputSnapshot } from "@jgengine/core/runtime/inputSnapshot";
import type { DriveAxis } from "./controller";
import { createActionStateTracker, toActionStateBindingMap, type ActionCodesMap } from "@jgengine/core/input/actionBindings";
import { applyBindingOverrides, loadBindingOverrides } from "@jgengine/core/input/bindingOverrides";
import { keybinds } from "../keybinds";

/** Host semantic actions keep native controls and keyboard rebinds in agreement. */
export interface DriveInput {
  sample(dt: number, input: InputSnapshot, active: boolean): DriveAxis;
  reset(): void;
  press(action: string): void;
  release(action: string): void;
  consumeJump(): boolean;
  keyDown(code: string): string | null;
  keyUp(code: string): void;
  isDown(action: string): boolean;
  refreshBindings(): void;
}

export function createDriveInput(bindings: () => ActionCodesMap = () => applyBindingOverrides(keybinds, loadBindingOverrides("Drift Foundry"))): DriveInput {
  let axis: DriveAxis = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  const touchHeld = new Set<string>();
  let jump = false;
  const makeKeyboard = () => createActionStateTracker(toActionStateBindingMap(bindings()));
  let keyboard = makeKeyboard();
  return {
    reset() { axis = { throttle: 0, brake: 0, steer: 0, handbrake: 0 }; touchHeld.clear(); keyboard.reset(); jump = false; },
    // Published shell 0.18.1 builds an empty tracker in the menu and does not
    // rebuild it on phase changes. Own keyboard capture shares its persisted
    // bindings while semantic host input still supports gamepads and touch.
    refreshBindings() { this.reset(); keyboard = makeKeyboard(); },
    keyDown(code) {
      const action = keyboard.handleDown(code);
      if (action === "jumpHop" && keyboard.wasPressed(action)) jump = true;
      return action;
    },
    keyUp(code) { keyboard.handleUp(code); },
    isDown(action) { return keyboard.isDown(action) || touchHeld.has(action); },
    press(action) { if (action === "jumpHop" && !touchHeld.has(action)) jump = true; touchHeld.add(action); },
    release(action) { touchHeld.delete(action); },
    consumeJump() { const pressed = jump; jump = false; return pressed; },
    sample(dt, input, active) {
      if (!active) { this.reset(); return axis; }
      const value = (action: string) => Math.max(input.value(action), this.isDown(action) ? 1 : 0);
      const target = { throttle: value("throttle"), brake: value("brake"), steer: value("steerRight") - value("steerLeft"), handbrake: value("handbrake") };
      const blend = 1 - Math.exp(-6 * Math.max(0, Math.min(dt, .05)));
      axis = {
        // Released pedals must become genuinely neutral so the published vehicle can coast.
        // Any positive analog or another held source still uses the existing easing.
        throttle: target.throttle === 0 ? 0 : axis.throttle + (target.throttle - axis.throttle) * blend,
        brake: target.brake === 0 ? 0 : axis.brake + (target.brake - axis.brake) * blend,
        steer: axis.steer + (target.steer - axis.steer) * blend,
        // The handbrake is a switch, not a pedal: it snaps on and off with the key.
        handbrake: target.handbrake,
      };
      keyboard.endFrame();
      return axis;
    },
  };
}
