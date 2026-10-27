/**
 * `drive --record`'s lockstep recorder: game time advances one tick per captured frame, so a clip
 * plays smoothly however slowly the page renders.
 */
import type { CdpSession } from "./browser-lib";
import type { TimedPng } from "./apng";

/** A lockstep step that commits no new frame falls back to a forced capture after this. */
const LOCKSTEP_FRAME_TIMEOUT_MS = 20_000;

/**
 * Lockstep recorder: takes over the page's `requestAnimationFrame` and clocks
 * (the timeweb/timecut technique) so game time only advances when we say so —
 * exactly ONE rendered frame per `1000/fps` ms tick, captured after it draws.
 * The sim sees ordinary frame deltas, so the assembled clip plays smoothly at
 * the target fps no matter how slowly software GL actually renders. (CDP
 * virtual time is the wrong tool here: it fires rAF at 60 virtual fps, causing
 * several unnecessary renders per captured frame.) The honest cost is wall-clock —
 * one real render per output frame — so choreograph recorded drives in seconds
 * of game time, not minutes.
 */
export class LockstepRecorder {
  readonly frames: TimedPng[] = [];
  readonly frameMs: number;
  private virtualMs = 0;
  /** The clock this recorder has advanced to; the run reads it as the time source under a lockstep record. */
  get virtualNow(): number {
    return this.virtualMs;
  }
  private pump: ((frame: { data: string; timestamp: number }) => void) | null = null;
  private stopPump: (() => void) | null = null;

  constructor(
    private readonly session: CdpSession,
    fps: number,
  ) {
    this.frameMs = Math.max(20, Math.round(1000 / fps));
  }

  /** Install the clock takeover. Call only after `data-jg-capture=ready` — a
   * page still booting under a frozen rAF would never reach ready. */
  async start(): Promise<void> {
    await this.session.evaluate(`(() => {
      if (globalThis.__jgVtStep !== undefined) return;
      const epoch = Date.now();
      const baseVirtual = performance.now();
      let virtual = baseVirtual;
      let nextId = 1;
      const queue = new Map();
      window.requestAnimationFrame = (cb) => { const id = nextId++; queue.set(id, cb); return id; };
      window.cancelAnimationFrame = (id) => { queue.delete(id); };
      performance.now = () => virtual;
      Date.now = () => epoch + (virtual - baseVirtual);
      globalThis.__jgVtStep = (dt) => {
        virtual += dt;
        const cbs = [...queue.values()];
        queue.clear();
        for (const cb of cbs) { try { cb(virtual); } catch (err) { console.error(err); } }
      };
    })()`);
    if (process.env["JG_CAPTURE_SCREENCAST"] === "0") {
      await this.captureFrame();
      return;
    }
    this.stopPump = this.session.on("Page.screencastFrame", (params) => {
      const sessionId = params["sessionId"];
      if (typeof sessionId === "number" || typeof sessionId === "string") {
        void this.session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      }
      const data = params["data"];
      const metadata = params["metadata"];
      const timestamp =
        typeof metadata === "object" && metadata !== null && "timestamp" in metadata ? metadata.timestamp : undefined;
      if (typeof data !== "string" || data.length === 0) return;
      this.pump?.({ data, timestamp: typeof timestamp === "number" ? timestamp : Date.now() / 1000 });
    });
    await this.session.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 });
    await this.captureFrame();
  }

  /** Release the screencast pump; safe to call twice. */
  async stop(): Promise<void> {
    this.stopPump?.();
    this.stopPump = null;
    this.pump = null;
    await this.session.send("Page.stopScreencast").catch(() => {});
  }

  /** Advance game time by `ms`, rendering + capturing one frame per tick. */
  async advance(ms: number): Promise<void> {
    for (let done = 0; done < ms; done += this.frameMs) {
      const budget = Math.min(this.frameMs, ms - done);
      await this.session.evaluate(`globalThis.__jgVtStep(${budget})`);
      this.virtualMs += budget;
      await this.captureFrame();
    }
  }

  /**
   * Take the frame the step just drew. The screencast pump hands over the composited
   * frame for roughly one render; `Page.captureScreenshot` forces its own re-raster on
   * top of that one and costs several (measured ~2s vs ~1s per half-res frame here), so
   * it is only the fallback for a step that commits nothing. JPEG throughout — lockstep
   * output is mp4, which takes JPEG frames directly.
   */
  private async captureFrame(): Promise<void> {
    const notBefore = Date.now() / 1000;
    const streamed = this.stopPump === null ? null : await new Promise<string | null>((resolvePromise) => {
      const timer = setTimeout(() => {
        this.pump = null;
        resolvePromise(null);
      }, LOCKSTEP_FRAME_TIMEOUT_MS);
      this.pump = (frame) => {
        if (frame.timestamp < notBefore) return;
        clearTimeout(timer);
        this.pump = null;
        resolvePromise(frame.data);
      };
    });
    const data =
      streamed ??
      (await this.session.send("Page.captureScreenshot", { format: "jpeg", quality: 85, fromSurface: true }))["data"];
    if (typeof data !== "string" || data.length === 0) return;
    this.frames.push({ png: Buffer.from(data, "base64"), tMs: this.virtualNow });
  }
}
