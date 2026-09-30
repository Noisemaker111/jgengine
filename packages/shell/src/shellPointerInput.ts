import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";

type Pointer = { pointerId: number; button: number };
/** Canvas-owned physical buttons; DOM overlays never begin gameplay input. @internal */
export function shellPointerInput(tracker: Pick<ActionStateTracker<string>, "handleDown" | "handleUp">, active: () => boolean) {
  const buttons = new Map<number, { pointerId: number; bound: boolean }>();
  return {
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
    cancel(pointerId?: number) {
      for (const [button, held] of buttons) {
        if (pointerId !== undefined && held.pointerId !== pointerId) continue;
        buttons.delete(button);
        tracker.handleUp(`mouse${button}`);
      }
    },
  };
}
