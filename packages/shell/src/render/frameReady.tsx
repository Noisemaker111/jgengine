import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";

/** A frame is honest only after every mounted loading fallback has left and a render completes. @internal */
export class FrameReadiness {
  private pending = new Set<object>();
  private ready = false;
  private framesStarted = 0;
  private framesCompleted = 0;
  private lastFrameStartedAt: number | null = null;
  private lastFrameCompletedAt: number | null = null;

  constructor(private publish: (ready: boolean) => void, private now: () => number = () => performance.now()) {}

  /** Read once when a capture fails, without marking or invalidating a frame. @internal */
  snapshot(): { ready: boolean; pending: number; framesStarted: number; framesCompleted: number; lastFrameStartedAt: number | null; lastFrameCompletedAt: number | null } {
    return {
      ready: this.ready, pending: this.pending.size,
      framesStarted: this.framesStarted, framesCompleted: this.framesCompleted,
      lastFrameStartedAt: this.lastFrameStartedAt, lastFrameCompletedAt: this.lastFrameCompletedAt,
    };
  }

  /** Records a render attempt separately from its after-effect completion. @internal */
  started(): void {
    this.framesStarted++;
    this.lastFrameStartedAt = this.now();
  }

  begin(): () => void {
    const token = {};
    this.pending.add(token);
    this.invalidate();
    return () => { this.pending.delete(token); };
  }

  invalidate(): void {
    if (!this.ready) return;
    this.ready = false;
    this.publish(false);
  }

  drawn(): void {
    this.framesCompleted++;
    this.lastFrameCompletedAt = this.now();
    if (this.pending.size > 0 || this.ready) return;
    this.ready = true;
    this.publish(true);
  }
}

const frames = new WeakMap<HTMLCanvasElement, FrameReadiness>();

function readinessFor(canvas: HTMLCanvasElement): FrameReadiness {
  let frame = frames.get(canvas);
  if (frame === undefined) {
    let ownedStatus: string | undefined;
    frame = new FrameReadiness((ready) => {
      if (ready) canvas.dataset.jgFrameReady = "";
      else delete canvas.dataset.jgFrameReady;
      const root = canvas.ownerDocument.documentElement;
      if (root.dataset.jgCapture !== ownedStatus) return;
      ownedStatus = ready ? "ready" : "preparing";
      root.dataset.jgCapture = ownedStatus;
    });
    frames.set(canvas, frame);
  }
  return frame;
}

/** Loading fallback that keeps the canvas unready until its Suspense subtree commits. @internal */
export function PendingFrame(): null {
  const canvas = useThree((state) => state.gl.domElement);
  useLayoutEffect(() => readinessFor(canvas).begin(), [canvas]);
  return null;
}

/** Publishes data-jg-frame-ready after a rendered frame with no pending shell model subtrees. @internal */
export function FrameReady(): null {
  const gl = useThree((state) => state.gl);
  const canvas = gl.domElement;
  const frame = useMemo(() => readinessFor(canvas), [canvas]);
  const rendered = useRef(false);
  useFrame(() => { frame.started(); rendered.current = true; }, -10_000);
  useLayoutEffect(() => {
    frame.invalidate();
    // Internal failure probe. No DOM updates or graphics queries occur in the frame loop.
    Object.defineProperty(canvas, "__jgFrameReadiness", {
      configurable: true,
      value: () => ({
        ...frame.snapshot(),
        contextLost: gl.getContext().isContextLost(),
        calls: gl.info.render.calls, triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
      }),
    });
    const detach = addAfterEffect(() => {
      if (!rendered.current) return;
      rendered.current = false;
      frame.drawn();
    });
    return () => {
      detach();
      Reflect.deleteProperty(canvas, "__jgFrameReadiness");
      delete canvas.dataset.jgFrameReady;
    };
  }, [canvas, frame, gl]);
  return null;
}
