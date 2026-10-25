import { useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";


import {
  restoreBuilderCameraSnapshot,
  saveBuilderCameraSnapshot,
  type BuilderCameraSnapshot,
} from "@/dev/builder/builderCameraBridge";
import {
  PRESET_CAPTURE_ANGLES,
  type BuilderScreenshotAngle,
} from "../../../../builderScreenshotApi";

const CAPTURE_ENDPOINT = "/__llmville-builder/screenshot";
const PENDING_ENDPOINT = "/__llmville-builder/screenshot/pending";
const REQUEST_ENDPOINT = "/__llmville-builder/screenshot/request";
const SCENE_POLL_INTERVAL_MS = 2000;
const PENDING_POLL_INTERVAL_MS = 1200;

/** Render frames to wait after moving the camera before reading pixels. */
const SETTLE_FRAMES = 2;
const FRAMES_PER_ANGLE = 1 + SETTLE_FRAMES + 1;

export interface BuilderScreenshotCaptureJob {
  requestId: number;
  angles: readonly BuilderScreenshotAngle[];
  sceneVersion?: number;
}

function getCameraPositions(floor: { centerX: number; centerZ: number; width: number; depth: number }): Record<
  Exclude<BuilderScreenshotAngle, "viewport">,
  { position: [number, number, number]; target: [number, number, number] }
> {
  const span = Math.max(floor.width, floor.depth);
  const distance = Math.max(14, span * 0.42);
  const cx = floor.centerX;
  const cz = floor.centerZ;
  return {
    perspective: {
      position: [cx + distance, distance * 0.72, cz + distance * 1.05],
      target: [cx, 0, cz],
    },
    top: {
      position: [cx, span * 1.4, cz],
      target: [cx, 0, cz],
    },
    side: {
      position: [cx + span * 1.3, span * 0.6, cz],
      target: [cx, span * 0.3, cz],
    },
  };
}

export function useSceneVersionPoller(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let lastVersion = 0;

    async function poll() {
      if (cancelled) return;
      try {
        const response = await fetch("/__llmville-builder/scene");
        if (!response.ok) return;
        const payload = (await response.json()) as { version?: number } | null;
        if (payload && typeof payload.version === "number" && payload.version !== lastVersion) {
          lastVersion = payload.version;
          setVersion(payload.version);
        }
      } catch {
        // ignore
      }
      setTimeout(poll, SCENE_POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}

export function useScreenshotRequestPoller(): {
  job: BuilderScreenshotCaptureJob | null;
  acknowledgeJob: (requestId: number) => void;
} {
  const [job, setJob] = useState<BuilderScreenshotCaptureJob | null>(null);
  const lastHandledRequestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const response = await fetch(PENDING_ENDPOINT);
        if (!response.ok) return;
        const payload = (await response.json()) as {
          requestId?: number | null;
          angles?: BuilderScreenshotAngle[];
          sceneVersion?: number;
        } | null;
        const requestId = payload?.requestId;
        if (
          typeof requestId === "number" &&
          requestId > lastHandledRequestIdRef.current &&
          Array.isArray(payload?.angles) &&
          payload.angles.length > 0
        ) {
          setJob({
            requestId,
            angles: payload.angles,
            ...(typeof payload.sceneVersion === "number" ? { sceneVersion: payload.sceneVersion } : {}),
          });
        }
      } catch {
        // ignore
      }
      setTimeout(poll, PENDING_POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  const acknowledgeJob = (requestId: number) => {
    lastHandledRequestIdRef.current = Math.max(lastHandledRequestIdRef.current, requestId);
    setJob((current) => (current?.requestId === requestId ? null : current));
  };

  return { job, acknowledgeJob };
}

export async function requestBuilderScreenshotCapture(): Promise<{ requestId: number } | null> {
  try {
    const response = await fetch(REQUEST_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { requestId?: number };
    return typeof payload.requestId === "number" ? { requestId: payload.requestId } : null;
  } catch {
    return null;
  }
}

export function SceneCapture({
  floor,
  angles,
  requestId,
  sceneVersion,
  onComplete,
}: {
  floor: { centerX: number; centerZ: number; width: number; depth: number };
  angles: readonly BuilderScreenshotAngle[];
  requestId?: number;
  sceneVersion?: number;
  onComplete: () => void;
}) {
  const { camera, gl, scene } = useThree();
  const frameRef = useRef(0);
  const finishedRef = useRef(false);
  const positionsRef = useRef(getCameraPositions(floor));
  const savedCameraRef = useRef<BuilderCameraSnapshot | null>(null);
  const [uploading, setUploading] = useState(false);
  const captureAngles = angles.length > 0 ? angles : PRESET_CAPTURE_ANGLES;

  useEffect(() => {
    positionsRef.current = getCameraPositions(floor);
    frameRef.current = 0;
    finishedRef.current = false;
    savedCameraRef.current = null;
  }, [floor.centerX, floor.centerZ, floor.width, floor.depth, requestId, captureAngles.join(",")]);

  useFrame(() => {
    if (uploading || finishedRef.current) return;

    const positions = positionsRef.current;
    const frame = frameRef.current;

    if (frame === 0) {
      savedCameraRef.current = saveBuilderCameraSnapshot(camera);
    }

    const angleIndex = Math.floor(frame / FRAMES_PER_ANGLE);
    const localFrame = frame % FRAMES_PER_ANGLE;

    if (angleIndex >= captureAngles.length) {
      if (savedCameraRef.current) {
        restoreBuilderCameraSnapshot(camera, savedCameraRef.current);
      }
      finishedRef.current = true;
      onComplete();
      return;
    }

    const angle = captureAngles[angleIndex];
    const isViewport = angle === "viewport";

    if (!isViewport && localFrame === 0) {
      const preset = positions[angle as Exclude<BuilderScreenshotAngle, "viewport">];
      camera.position.set(...preset.position);
      camera.lookAt(...preset.target);
      frameRef.current += 1;
      return;
    }

    if (isViewport && localFrame === 0) {
      frameRef.current += 1;
      return;
    }

    if (localFrame < FRAMES_PER_ANGLE - 1) {
      frameRef.current += 1;
      return;
    }

    gl.render(scene, camera);
    const dataUrl = gl.domElement.toDataURL("image/png");
    setUploading(true);
    void fetch(CAPTURE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        angle,
        image: dataUrl,
        ...(requestId !== undefined ? { requestId } : {}),
        ...(sceneVersion !== undefined ? { sceneVersion } : {}),
      }),
    })
      .then(() => {
        setUploading(false);
        frameRef.current += 1;
      })
      .catch(() => {
        setUploading(false);
        frameRef.current += 1;
      });
  });

  return null;
}