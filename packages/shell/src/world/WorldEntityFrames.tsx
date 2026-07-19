import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import {
  EntityFrames,
  type EntityFrameEntry,
  type EntityFrameLayoutOptions,
  type EntityFramePlacement,
  type EntityScreenProjection,
  type ProjectEntity,
} from "@jgengine/react/entityFrames";

/**
 * Returns a {@link ProjectEntity} bound to the live R3F camera and canvas size —
 * the world→screen half of the data-first entity-frame seam. Call the returned
 * function with a world position to get a CSS-pixel screen point (or `null`/`behind`
 * when the point is outside the frustum). Reads the camera fresh on every call, so
 * sample it inside a frame loop. Games that already own their entities use this to
 * feed `@jgengine/react`'s `EntityFrames` without mirroring state into a store.
 *
 * @capability entity-frames R3F camera→screen projector for world-anchored frames
 */
export function useWorldProjection(): ProjectEntity {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const scratch = useRef(new THREE.Vector3());
  return useCallback(
    (worldPosition) => {
      camera.updateMatrixWorld();
      return projectWorldToScreen(scratch.current, camera, worldPosition, size.width, size.height);
    },
    [camera, size.width, size.height],
  );
}

/**
 * Pure world→screen projection: NDC via `camera.project`, mapped to CSS pixels.
 * `behind` is set when the point falls outside the near/far clip range (NDC z
 * beyond [-1, 1]), which covers positions behind the camera. Exposed for tests
 * and for callers wiring their own frame loop around a bare THREE camera.
 *
 * @capability entity-frames pure world→screen projection for a bare THREE camera
 */
export function projectWorldToScreen(
  scratch: THREE.Vector3,
  camera: THREE.Camera,
  worldPosition: readonly [number, number, number],
  width: number,
  height: number,
): EntityScreenProjection {
  scratch.set(worldPosition[0], worldPosition[1], worldPosition[2]);
  scratch.project(camera);
  return {
    x: (scratch.x * 0.5 + 0.5) * width,
    y: (-scratch.y * 0.5 + 0.5) * height,
    depth: scratch.z,
    behind: scratch.z < -1 || scratch.z > 1,
  };
}

/** Props for {@link WorldEntityFrames}. */
export interface WorldEntityFramesProps<E extends EntityFrameEntry> extends EntityFrameLayoutOptions {
  /** Caller-owned entities to anchor; `worldPosition` is the overhead point. */
  entries: readonly E[];
  /** Renders one entity's frame — compose `HealthBar value/max` + a name, themed via `barTokens`. */
  renderFrame: (entry: E, placement: EntityFramePlacement<E>) => ReactNode;
  /** Min ms between projection refreshes — trades smoothness for fewer re-renders at scale. Default 0 (every frame). */
  tickMs?: number;
  /** Class on the overlay layer. */
  className?: string;
  /** Per-frame wrapper transform. Default `translate(-50%, -100%)`. */
  anchorTransform?: string;
}

function pinToViewport(
  _el: THREE.Object3D,
  _camera: THREE.Camera,
  size: { width: number; height: number },
): [number, number] {
  return [size.width / 2, size.height / 2];
}

/**
 * R3F convenience that mounts inside the scene, samples the live camera each
 * frame (throttled by `tickMs`), and renders `@jgengine/react`'s {@link EntityFrames}
 * through a fullscreen `<Html>` overlay. This is the one-line way an R3F game
 * gets overhead enemy nameplates/health bars from its own entity array without a
 * store: pass `entries` + a `renderFrame` that composes the shipped bars. The
 * projection, viewport culling, and stacking come for free.
 *
 * @capability entity-frames R3F overhead entity frames from a caller-owned entity array
 */
export function WorldEntityFrames<E extends EntityFrameEntry>({
  entries,
  renderFrame,
  tickMs = 0,
  className,
  anchorTransform,
  ...layout
}: WorldEntityFramesProps<E>) {
  const size = useThree((state) => state.size);
  const project = useWorldProjection();
  // Re-render on a frame cadence so projected screen positions follow the camera.
  const [, setTick] = useState(0);
  useThreeFrameTick(setTick, tickMs);
  return (
    <Html
      fullscreen
      calculatePosition={pinToViewport}
      zIndexRange={[19, 0]}
      style={{ pointerEvents: "none" }}
    >
      <EntityFrames
        entries={entries}
        project={project}
        renderFrame={renderFrame}
        viewport={{ width: size.width, height: size.height }}
        className={className}
        anchorTransform={anchorTransform}
        {...layout}
      />
    </Html>
  );
}

/** Bumps a state setter on a throttled frame cadence to drive re-projection. */
function useThreeFrameTick(setTick: (updater: (n: number) => number) => void, tickMs: number): void {
  const last = useRef(0);
  useFrame((state) => {
    const elapsedMs = state.clock.elapsedTime * 1000;
    if (elapsedMs - last.current < tickMs) return;
    last.current = elapsedMs;
    setTick((n) => n + 1);
  });
}
