import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";

/** A frame is honest only after every mounted loading fallback has left and a render completes. @internal */
export class FrameReadiness {
  private pending = new Set<object>();
  private ready = false;

  constructor(private publish: (ready: boolean) => void) {}

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
  const canvas = useThree((state) => state.gl.domElement);
  const frame = useMemo(() => readinessFor(canvas), [canvas]);
  const rendered = useRef(false);
  useFrame(() => { rendered.current = true; }, -10_000);
  useLayoutEffect(() => {
    frame.invalidate();
    const detach = addAfterEffect(() => {
      if (!rendered.current) return;
      rendered.current = false;
      frame.drawn();
    });
    return () => {
      detach();
      delete canvas.dataset.jgFrameReady;
    };
  }, [canvas, frame]);
  return null;
}
