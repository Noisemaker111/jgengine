export interface LookDeltas {
  yaw: number;
  pitch: number;
}

/** Plain JSON state of a {@link LookChannel}: the pending pixel deltas and the committed pose. */
export interface LookChannelState {
  deltaX: number;
  deltaY: number;
  yaw: number;
  pitch: number;
  verticalOffset: number;
}

export interface LookChannel {
  accumulate(dx: number, dy: number): void;
  /** Yaw/pitch deltas (radians) for this frame; clears the accumulator. */
  consume(): LookDeltas;
  setYaw(yaw: number): void;
  readYaw(): number;
  setPitch(pitch: number): void;
  readPitch(): number;
  setVerticalOffset(offset: number): void;
  readVerticalOffset(): number;
  snapshot(): LookChannelState;
  restore(next: LookChannelState): void;
}

export interface LookChannelOptions {
  /** Radians of rotation per pixel of pointer travel. */
  sensitivity: number;
  maxVerticalOffset?: number;
}

export function createLookChannel({ sensitivity, maxVerticalOffset = Infinity }: LookChannelOptions): LookChannel {
  let deltaX = 0;
  let deltaY = 0;
  let yaw = 0;
  let pitch = 0;
  let verticalOffset = 0;

  return {
    accumulate(dx, dy) {
      deltaX += dx;
      deltaY += dy;
    },
    consume() {
      const result = { yaw: -deltaX * sensitivity, pitch: -deltaY * sensitivity };
      deltaX = 0;
      deltaY = 0;
      return result;
    },
    setYaw(value) {
      yaw = value;
    },
    readYaw() {
      return yaw;
    },
    setPitch(value) {
      pitch = value;
    },
    readPitch() {
      return pitch;
    },
    setVerticalOffset(value) {
      verticalOffset = Math.max(0, Math.min(maxVerticalOffset, value));
    },
    readVerticalOffset() {
      return verticalOffset;
    },
    snapshot() {
      return { deltaX, deltaY, yaw, pitch, verticalOffset };
    },
    restore(next) {
      ({ deltaX, deltaY, yaw, pitch, verticalOffset } = next);
    },
  };
}
