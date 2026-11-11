/**
 * Which surface owns the pointer over a full-viewport UI canvas. The canvas takes events only over
 * its hit regions, while it is modal, or for a press that began on it; a press that began on the
 * world below stays the world's until it is released, so a world click's release is not stolen
 * when the canvas switches on mid-gesture.
 */
export interface RunePassThrough {
  move(x: number, y: number, buttons: number): void;
  down(x: number, y: number, onUi: boolean): void;
  up(x: number, y: number): void;
  /** True when the UI canvas should take pointer events now. */
  takes(modal: boolean): boolean;
}

export function createRunePassThrough(overUi: (x: number, y: number) => boolean): RunePassThrough {
  let x = -1, y = -1, uiPresses = 0, worldPresses = 0;
  return {
    move(nextX, nextY, buttons) {
      x = nextX; y = nextY;
      // A move with no buttons held ends any press whose release was missed.
      if (buttons === 0) { uiPresses = 0; worldPresses = 0; }
    },
    down(nextX, nextY, onUi) {
      x = nextX; y = nextY;
      if (onUi) uiPresses += 1;
      else worldPresses += 1;
    },
    up(nextX, nextY) {
      x = nextX; y = nextY;
      if (uiPresses > 0) uiPresses -= 1;
      else worldPresses = Math.max(0, worldPresses - 1);
    },
    takes(modal) {
      if (modal || uiPresses > 0) return true;
      if (worldPresses > 0) return false;
      return x >= 0 && overUi(x, y);
    },
  };
}
