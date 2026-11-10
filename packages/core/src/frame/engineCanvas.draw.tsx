/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import {
  createEngineLoop,
  type EngineFrameState,
  type EngineFrameloop,
} from "./engineLoop.draw";
import { EngineHostProvider, type EngineHost } from "./engineHost.draw";
import type { EngineRendererFactory } from "../webgpu/engineRenderer.draw";

export interface EngineCanvasProps {
  /** From `useEngineRendererFactory`; the canvas remounts per `factory.backend`. */
  rendererFactory: EngineRendererFactory;
  orthographic?: boolean | undefined;
  /** Camera fov/zoom and near/far planes. */
  camera?: { fov?: number; zoom?: number; near?: number; far?: number } | undefined;
  /** Enable PCFShadowMap ("percentage") shadows. */
  shadows?: boolean | undefined;
  /** Pixel ratio, or [min, max] clamped against devicePixelRatio. */
  dpr?: number | readonly [number, number] | undefined;
  /** Keep the drawing buffer for capture/snapshot reads. */
  preserveDrawingBuffer?: boolean | undefined;
  frameloop?: EngineFrameloop | undefined;
  style?: CSSProperties | undefined;
  /** Runs once after renderer/scene/camera exist, before the first frame. */
  onCreated?: ((state: EngineFrameState) => void) | undefined;
  children?: ReactNode;
}

/**
 * One canvas, one {@link createEngineLoop}, and an {@link EngineHostProvider}
 * for draw wrappers mounted through `useEngineHost`/`useEngineDraw`. Children
 * remount when the renderer backend changes so draws never survive a dead scene.
 */
export function EngineCanvas({
  rendererFactory,
  orthographic = false,
  camera,
  shadows = false,
  dpr,
  preserveDrawingBuffer = false,
  frameloop = "always",
  style,
  onCreated,
  children,
}: EngineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  const [loop, setLoop] = useState<ReturnType<typeof createEngineLoop> | null>(null);
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    // Materials and both renderer backends share these context attributes.
    const created = rendererFactory({
      canvas,
      powerPreference: "high-performance",
      antialias: true,
      alpha: true,
      preserveDrawingBuffer,
    });
    // Both renderer backends use the same tone curve and output color space.
    created.toneMapping = THREE.ACESFilmicToneMapping;
    created.outputColorSpace = THREE.SRGBColorSpace;
    const engine = createEngineLoop({
      canvas,
      renderer: created,
      orthographic,
      ...(camera === undefined ? {} : { cameraProps: camera }),
      frameloop,
      ...(dpr === undefined ? {} : { dpr }),
      onCreated: (state) => onCreatedRef.current?.(state),
    });
    setRenderer(created);
    setLoop(engine);
    return () => {
      setLoop(null);
      setRenderer(null);
      engine.dispose();
    };
    // frameloop/dpr/camera/onCreated are applied live below; the loop is built once per factory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendererFactory]);

  useEffect(() => {
    loop?.setFrameloop(frameloop);
  }, [loop, frameloop]);

  useEffect(() => {
    if (renderer === null || dpr === undefined) return;
    const value = typeof dpr === "number"
      ? dpr
      : THREE.MathUtils.clamp(window.devicePixelRatio, dpr[0], dpr[1]);
    renderer.setPixelRatio(value);
  }, [renderer, dpr]);

  useEffect(() => {
    if (renderer === null) return;
    const next = shadows === true;
    if (renderer.shadowMap.enabled === next) return;
    renderer.shadowMap.enabled = next;
    if (next) renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.needsUpdate = true;
  }, [renderer, shadows]);

  const host = useMemo<EngineHost | null>(() => {
    if (loop === null) return null;
    return {
      frame: loop.state,
      advance: (elapsed?: number) => loop.advance(elapsed),
      setFrameloop: (mode: EngineFrameloop) => loop.setFrameloop(mode),
      setFpsLimit: (fps: number) => loop.setFpsLimit(fps),
    };
  }, [loop]);

  return (
    <>
      {/* A fresh DOM canvas per renderer backend. */}
      {/* The box is in the page flow and takes the caller's `style` (a height, a background); the
          canvas fills it. A canvas styled directly would leave the flow and stack over its siblings. */}
      <div data-engine-canvas="" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", ...style }}>
        <canvas
          key={`canvas-${rendererFactory.backend}`}
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none" }}
        />
      </div>
      {host !== null ? (
        <EngineHostProvider key={`host-${rendererFactory.backend}`} host={host}>
          {children}
        </EngineHostProvider>
      ) : null}
    </>
  );
}
