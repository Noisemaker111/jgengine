interface FrameShare {
  frame: number;
  busy: number;
  busyLast: number;
}

/** @internal */
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

  stillBusy(renderer: object): void {
    const share = this.shares.get(renderer);
    if (share !== undefined) share.busy += 1;
  }
}
