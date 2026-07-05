/**
 * Per-frame look channel shared between an event-driven capture layer (writer
 * of raw pointer deltas) and a frame-driven controller (consumer), plus the
 * latest committed pose for same-frame readers such as presence sync. Kept as
 * plain mutable state on purpose: routing per-frame deltas through a reactive
 * store would notify subscribers every frame for state no UI reads.
 */

export interface LookDeltas {
  yaw: number;
  pitch: number;
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
}

export interface LookChannelOptions {
  /** Radians of rotation per pixel of pointer travel. */
  sensitivity: number;
  /** Clamp for the vertical offset register (e.g. peak jump height). */
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
  };
}
