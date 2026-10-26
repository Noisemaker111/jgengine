import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";
import type { observableShellTracker } from "./shellInputPublication";

type Pointer = { pointerId: number; button: number };
// PointerEvent.buttons uses middle=4 and right=2, unlike PointerEvent.button.
const buttonMask = (button: number) => [1, 4, 2, 8, 16][button] ?? 0;
/** Canvas-owned physical buttons; DOM overlays never begin gameplay input. @internal */
export function shellPointerInput(tracker: Pick<ActionStateTracker<string>, "handleDown" | "handleUp">, active: () => boolean) {
  const buttons = new Map<number, { pointerId: number; bound: boolean }>();
  const input = {
    down(event: Pointer, worldTarget: boolean) {
      if (!worldTarget || !active() || buttons.has(event.button)) return;
      const action = tracker.handleDown(`mouse${event.button}`);
      buttons.set(event.button, { pointerId: event.pointerId, bound: action !== null });
    },
    up(event: Pointer): boolean {
      const held = buttons.get(event.button);
      if (held === undefined || held.pointerId !== event.pointerId) return false;
      buttons.delete(event.button);
      tracker.handleUp(`mouse${event.button}`);
      return held.bound;
    },
    /** Native mouse chords change buttons through pointermove, including releases outside the canvas. */
    move(event: Pointer & { buttons: number }, worldTarget: boolean) {
      for (const [button, held] of buttons) {
        if (held.pointerId === event.pointerId && (event.buttons & buttonMask(button)) === 0) {
          input.up({ pointerId: event.pointerId, button });
        }
      }
      if (event.button >= 0 && (event.buttons & buttonMask(event.button)) !== 0) input.down(event, worldTarget);
    },
    cancel(pointerId?: number) {
      for (const [button, held] of buttons) {
        if (pointerId !== undefined && held.pointerId !== pointerId) continue;
        buttons.delete(button);
        tracker.handleUp(`mouse${button}`);
      }
    },
    attachReset(source: Pick<ReturnType<typeof observableShellTracker>, "subscribe">, clearGesture: () => void) {
      return source.subscribe(change => {
        if (change !== "reset") return;
        input.cancel();
        clearGesture();
      });
    },
  };
  return input;
}
