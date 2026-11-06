interface FrameShare {
  frame: number;
  busy: number;
  busyLast: number;
}

/**
 * One frame's grass work shared by every patch drawn by one renderer. A patch asks for its slice
 * before it works and says whether it still has work after; the frame's budget is split evenly
 * among the patches that still had work the frame before, so ten patches cost what one does.
 * @internal
 */
export class GrassFrameShare {
  private readonly shares = new WeakMap<object, FrameShare>();

  /** Milliseconds this patch may spend now, out of `totalMs` for the whole frame on `renderer`. */
  slice(renderer: object, frame: number, totalMs: number): number {
    let share = this.shares.get(renderer);
    if (share === undefined) {
      share = { frame, busy: 0, busyLast: 1 };
      this.shares.set(renderer, share);
    }
    if (share.frame !== frame) {
      share.frame = frame;
      share.busyLast = Math.max(1, share.busy);
      share.busy = 0;
    }
    return totalMs / share.busyLast;
  }

  /** Record that a patch still has work after its slice this frame. */
  stillBusy(renderer: object): void {
    const share = this.shares.get(renderer);
    if (share !== undefined) share.busy += 1;
  }
}
