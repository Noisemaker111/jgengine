import type { SimLoop } from "./simLoop";

/**
 * Frames shorter than this share of a fixed step get their next step run ahead, between frames. Above it
 * (under 120 fps at 60 Hz) most frames carry a step anyway, so running one early would only sample input
 * sooner without taking a spike off any frame.
 */
export const STEP_AHEAD_MAX_FRAME_SHARE = 0.5;

/**
 * Whether the frame after one that took `frameDt` real seconds will owe a fixed step, so the driver can run
 * that step now, in the time the main thread waits for the next frame, instead of inside it. The prediction
 * is that the next frame takes as long as this one; when it is shorter, {@link SimLoop.advance} still counts
 * the early step and owes the difference, so the world a frame shows is at most that jitter early.
 */
export function shouldStepAhead(loop: Pick<SimLoop, "untilStep" | "stepSeconds">, frameDt: number): boolean {
  const step = loop.stepSeconds();
  const until = loop.untilStep();
  if (step === null || until === null || !(frameDt > 0)) return false;
  return frameDt < step * STEP_AHEAD_MAX_FRAME_SHARE && until <= frameDt;
}

/** A task that runs once as its own macrotask after the current one, however often it is requested before then. */
export interface IdleTask {
  request(): void;
  dispose(): void;
}

/**
 * Run `run` in its own task right after the current one: after a frame's callbacks and its commit, before the
 * next frame's. A `MessageChannel` message is used where one exists, since timers are clamped and throttled.
 */
export function createIdleTask(run: () => void): IdleTask {
  let pending = false;
  let disposed = false;
  const fire = () => {
    if (!pending || disposed) return;
    pending = false;
    run();
  };
  const channel = typeof MessageChannel === "function" ? new MessageChannel() : null;
  if (channel !== null) channel.port1.onmessage = fire;
  return {
    request() {
      if (pending || disposed) return;
      pending = true;
      if (channel !== null) channel.port2.postMessage(null);
      else setTimeout(fire, 0);
    },
    dispose() {
      disposed = true;
      pending = false;
      if (channel !== null) {
        channel.port1.onmessage = null;
        channel.port1.close();
        channel.port2.close();
      }
    },
  };
}

/**
 * Frame times for a replay of a loop that steps ahead. A step run between frames is recorded as a frame of
 * its own whose time makes the step fall due; the frames after it give that time back, so a plain loop fed
 * the recorded times runs every step in the same recorded frame as the live one did.
 */
export interface RecordedTime {
  /** The time to record for a step just run ahead, given what {@link SimLoop.untilStep} said before it. */
  ahead(untilStep: number): number;
  /** The time to record for a frame that took `dt` real seconds. */
  frame(dt: number): number;
}

/** Create the {@link RecordedTime} ledger for one recording. */
export function createRecordedTime(): RecordedTime {
  let carry = 0;
  return {
    ahead(untilStep) {
      carry -= untilStep;
      return untilStep;
    },
    frame(dt) {
      const owed = dt + carry;
      const recorded = Math.max(0, owed);
      carry = owed - recorded;
      return recorded;
    },
  };
}
